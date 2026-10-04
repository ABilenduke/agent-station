import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { computeTimes } from './active.js';
import { formatMinutes, parseEstimate } from './duration.js';
import { classifyHook } from './hook.js';
import { appendEvent, readLedger, type EventName, type Harness, type LedgerEvent } from './ledger.js';
import { renderTimeMd } from './render.js';
import { loadBindings, saveBindings, type Binding } from './state.js';
import { summarize } from './summary.js';

export interface CliDeps {
  env: Record<string, string | undefined>;
  now: () => Date;
  stateDir: string;
  stdin: () => Promise<string>;
  stdout: (s: string) => void;
  stderr: (s: string) => void;
}

const USAGE = `Usage: worklog <command>

  start <feature-dir> <step> [--estimate 1h30m] [--note text]   open a step and bind this session
  join <feature-dir> <step> [--note text]                        bind another session to an open step
  finish <feature-dir> <step> [--note text]                      close a step and render time.md
  render <feature-dir>                                           regenerate time.md from time.jsonl
  check <feature-dir>                                            validate time.jsonl and time.md
  status                                                         list open steps and bound sessions
  summary <dir>... [--json]                                      estimate calibration across features
  hook [--harness claude-code|codex]                             record a hook event (used by hooks)
`;

class UsageError extends Error {}

/** ISO 8601 with the local offset, e.g. 2026-10-01T21:52:07.000-04:00. */
export function localIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 23);
  return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

interface Agent {
  harness: Harness;
  ids: string[];
}

function detectAgent(env: CliDeps['env']): Agent {
  const claude = env['CLAUDE_CODE_SESSION_ID'];
  if (claude) return { harness: 'claude-code', ids: [claude] };
  const codex = [env['CODEX_THREAD_ID'], env['CODEX_SESSION_ID']].filter((id): id is string => Boolean(id));
  if (codex.length > 0) return { harness: 'codex', ids: [...new Set(codex)] };
  return { harness: 'shell', ids: [] };
}

function parseArgs(args: string[]): { positional: string[]; flags: Map<string, string | true> } {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg.startsWith('--')) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(arg.slice(2), next);
        i++;
      } else flags.set(arg.slice(2), true);
    } else positional.push(arg);
  }
  return { positional, flags };
}

function stringFlag(flags: Map<string, string | true>, name: string): string | undefined {
  const value = flags.get(name);
  if (value === true) throw new UsageError(`--${name} needs a value.`);
  return value;
}

function featureDir(raw: string | undefined): string {
  if (!raw) throw new UsageError('Missing feature folder.');
  const dir = resolve(raw);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`Feature folder not found: ${raw}`);
  return dir;
}

function stepName(raw: string | undefined): string {
  if (!raw || /[|\n]/.test(raw)) throw new UsageError('Missing or invalid step label (no "|" or newlines).');
  return raw;
}

function openSteps(events: LedgerEvent[]): Set<string> {
  const open = new Set<string>();
  const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (const e of sorted) {
    if (e.event === 'step-start') open.add(e.step);
    if (e.event === 'step-finish') open.delete(e.step);
  }
  return open;
}

function ledgerPath(dir: string): string {
  return join(dir, 'time.jsonl');
}

function render(dir: string): string {
  const content = renderTimeMd(basename(dir), readLedger(ledgerPath(dir)).events);
  writeFileSync(join(dir, 'time.md'), content, 'utf8');
  return content;
}

function stepEvent(
  deps: CliDeps,
  event: EventName,
  step: string,
  agent: Agent,
  extra: Partial<LedgerEvent>,
): LedgerEvent {
  return {
    v: 1,
    ts: localIso(deps.now()),
    event,
    step,
    session: agent.ids[0] ?? null,
    harness: agent.harness,
    ...extra,
  };
}

function bind(deps: CliDeps, dir: string, step: string, agent: Agent, ts: string): void {
  const bindings = loadBindings(deps.stateDir).filter((b) => !agent.ids.includes(b.session));
  for (const session of agent.ids) bindings.push({ session, dir, step, harness: agent.harness, since: ts });
  saveBindings(deps.stateDir, bindings);
}

/** The binding that keeps this session on a different step than `dir`/`step`, if any. */
function busyBinding(deps: CliDeps, agent: Agent, dir: string, step: string): Binding | undefined {
  return loadBindings(deps.stateDir).find((b) => agent.ids.includes(b.session) && !(b.dir === dir && b.step === step));
}

function start(args: string[], deps: CliDeps): number {
  const { positional, flags } = parseArgs(args);
  const dir = featureDir(positional[0]);
  const step = stepName(positional[1]);
  const estimate = stringFlag(flags, 'estimate');
  const note = stringFlag(flags, 'note');
  const agent = detectAgent(deps.env);
  if (openSteps(readLedger(ledgerPath(dir)).events).has(step)) {
    deps.stderr(`${step} is already open in ${dir}; finish it before starting it again.\n`);
    return 1;
  }
  const busy = busyBinding(deps, agent, dir, step);
  if (busy) {
    deps.stderr(`This session is still on ${busy.step} in ${busy.dir}; run worklog finish for it first.\n`);
    return 1;
  }
  const event = stepEvent(deps, 'step-start', step, agent, {
    ...(estimate === undefined ? {} : { estimateMin: parseEstimate(estimate) }),
    ...(note === undefined ? {} : { note }),
  });
  appendEvent(ledgerPath(dir), event);
  if (agent.ids.length > 0) bind(deps, dir, step, agent, event.ts);
  else {
    deps.stderr(
      'No agent session detected (CLAUDE_CODE_SESSION_ID or CODEX_THREAD_ID); the stamp is recorded but active time will not be measured.\n',
    );
  }
  deps.stdout(`Started ${step} at ${event.ts}.\n`);
  return 0;
}

function join_(args: string[], deps: CliDeps): number {
  const { positional, flags } = parseArgs(args);
  const dir = featureDir(positional[0]);
  const step = stepName(positional[1]);
  const note = stringFlag(flags, 'note');
  const agent = detectAgent(deps.env);
  if (agent.ids.length === 0) {
    deps.stderr('join needs an agent session (CLAUDE_CODE_SESSION_ID or CODEX_THREAD_ID).\n');
    return 1;
  }
  if (!openSteps(readLedger(ledgerPath(dir)).events).has(step)) {
    deps.stderr(`${step} is not open in ${dir}; use worklog start.\n`);
    return 1;
  }
  const busy = busyBinding(deps, agent, dir, step);
  if (busy) {
    deps.stderr(`This session is still on ${busy.step} in ${busy.dir}; run worklog finish for it first.\n`);
    return 1;
  }
  const event = stepEvent(deps, 'join', step, agent, note === undefined ? {} : { note });
  appendEvent(ledgerPath(dir), event);
  bind(deps, dir, step, agent, event.ts);
  deps.stdout(`Joined ${step} at ${event.ts}.\n`);
  return 0;
}

function finish(args: string[], deps: CliDeps): number {
  const { positional, flags } = parseArgs(args);
  const dir = featureDir(positional[0]);
  const step = stepName(positional[1]);
  const note = stringFlag(flags, 'note');
  if (!openSteps(readLedger(ledgerPath(dir)).events).has(step)) {
    deps.stderr(`${step} is not open in ${dir}.\n`);
    return 1;
  }
  const agent = detectAgent(deps.env);
  appendEvent(ledgerPath(dir), stepEvent(deps, 'step-finish', step, agent, note === undefined ? {} : { note }));
  saveBindings(
    deps.stateDir,
    loadBindings(deps.stateDir).filter((b) => !(b.dir === dir && b.step === step)),
  );
  render(dir);
  const row = computeTimes(readLedger(ledgerPath(dir)).events).steps.find((s) => s.step === step);
  const show = (ms: number | null | undefined): string => (ms == null ? '—' : formatMinutes(ms / 60_000));
  deps.stdout(`Finished ${step}: wall ${show(row?.wallMs)}, active ${show(row?.activeMs)}. Wrote time.md.\n`);
  return 0;
}

async function hook(args: string[], deps: CliDeps): Promise<number> {
  try {
    const bindings = loadBindings(deps.stateDir);
    if (bindings.length === 0) return 0;
    const flag = parseArgs(args).flags.get('harness');
    const activity = classifyHook(JSON.parse(await deps.stdin()) as unknown);
    if (!activity) return 0;
    const binding: Binding | undefined = bindings.find((b) => b.session === activity.session);
    if (!binding || !existsSync(binding.dir)) return 0;
    const harness: Harness = flag === 'claude-code' || flag === 'codex' ? flag : binding.harness;
    appendEvent(ledgerPath(binding.dir), {
      v: 1,
      ts: localIso(deps.now()),
      event: activity.event,
      step: binding.step,
      session: activity.session,
      harness,
    });
  } catch {
    // A hook must never disturb the agent: unreadable input or a failed write is dropped.
  }
  return 0;
}

function check(args: string[], deps: CliDeps): number {
  const dir = featureDir(parseArgs(args).positional[0]);
  const path = ledgerPath(dir);
  if (!existsSync(path)) {
    deps.stderr(`No time.jsonl in ${dir}.\n`);
    return 1;
  }
  const { events, problems } = readLedger(path);
  for (const p of problems) deps.stderr(`time.jsonl line ${p.line}: ${p.message}\n`);
  const timeMd = join(dir, 'time.md');
  const expected = renderTimeMd(basename(dir), events);
  const stale = !existsSync(timeMd) || readFileSync(timeMd, 'utf8') !== expected;
  if (stale) deps.stderr(`time.md is out of date; run worklog render ${dir}\n`);
  if (problems.length > 0 || stale) return 1;
  deps.stdout(`${basename(dir)}: ${events.length} events, time.md current.\n`);
  return 0;
}

function status(deps: CliDeps): number {
  const bindings = loadBindings(deps.stateDir);
  if (bindings.length === 0) {
    deps.stdout('No open steps are bound to a session.\n');
    return 0;
  }
  for (const b of bindings) {
    deps.stdout(`${b.step}\t${b.dir}\t${b.harness} ${b.session}\tsince ${b.since}\n`);
  }
  return 0;
}

function ledgerFolders(paths: string[]): string[] {
  const folders: string[] = [];
  for (const raw of paths) {
    const dir = resolve(raw);
    if (existsSync(ledgerPath(dir))) folders.push(dir);
    else if (existsSync(dir) && statSync(dir).isDirectory()) {
      for (const entry of readdirSync(dir).sort()) {
        if (existsSync(ledgerPath(join(dir, entry)))) folders.push(join(dir, entry));
      }
    }
  }
  return folders;
}

function summary(args: string[], deps: CliDeps): number {
  const { positional, flags } = parseArgs(args);
  const folders = ledgerFolders(positional.length > 0 ? positional : ['docs/features']);
  const result = summarize(folders.map((dir) => ({ name: basename(dir), events: readLedger(ledgerPath(dir)).events })));
  if (flags.has('json')) {
    deps.stdout(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  const c = result.calibration;
  deps.stdout(
    c
      ? `Calibration from ${c.count} finished steps: actual/estimate median ${c.median.toFixed(2)} (IQR ${c.q1.toFixed(2)}–${c.q3.toFixed(2)}).\n`
      : 'No finished steps with both an estimate and measured active time yet; estimates have no baseline.\n',
  );
  const show = (ms: number | null): string => (ms === null ? '—' : formatMinutes(ms / 60_000));
  for (const f of result.features) {
    const estimate = f.estimateMin === null ? '—' : formatMinutes(f.estimateMin);
    deps.stdout(`${f.name}\testimate ${estimate}\tactive ${show(f.activeMs)}\twall ${show(f.wallMs)}\n`);
  }
  return 0;
}

export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case 'start':
        return start(args, deps);
      case 'join':
        return join_(args, deps);
      case 'finish':
        return finish(args, deps);
      case 'hook':
        return await hook(args, deps);
      case 'render': {
        const dir = featureDir(parseArgs(args).positional[0]);
        render(dir);
        deps.stdout(`Wrote ${join(dir, 'time.md')}.\n`);
        return 0;
      }
      case 'check':
        return check(args, deps);
      case 'status':
        return status(deps);
      case 'summary':
        return summary(args, deps);
      case 'help':
      case '--help':
      case undefined:
        deps.stdout(USAGE);
        return command === undefined ? 1 : 0;
      default:
        deps.stderr(`Unknown command "${command}".\n${USAGE}`);
        return 1;
    }
  } catch (error) {
    deps.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    if (error instanceof UsageError) deps.stderr(USAGE);
    return 1;
  }
}
