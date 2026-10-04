import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { computeTimes } from './active.js';
import { formatMinutes, parseEstimate } from './duration.js';
import { GitHub } from './github.js';
import { collectHistory } from './collect.js';
import { allowanceRatios, calibrationByKind, dataLine, forecast as simulate, parseDataLine, referenceClass, seededRandom, timeData, } from './history.js';
import { classifyHook } from './hook.js';
import { checkKey, commentContent, stripFrontmatter, tableSteps } from './issue.js';
import { appendEvent, readLedger } from './ledger.js';
import { renderTimeMd } from './render.js';
import { loadBindings, saveBindings } from './state.js';
import { quantile, summarize } from './summary.js';
const USAGE = `Usage: worklog <command>

  start <ledger> <step> [--estimate 1h30m] [--note text]   open a step and bind this session
  join <ledger> <step> [--note text]                        bind another session to an open step
  finish <ledger> <step> [--note text]                      close a step and render time.md
  render <ledger>                                           regenerate time.md from time.jsonl
  check <ledger>                                            validate time.jsonl and time.md
  post <issue-N> [--repo o/r] [--force] [--origin 12,14]   put time.md in issue N's time comment (gh);
                                                            --origin: the issues whose defects this fixes
  status                                                    list open steps and bound sessions
  summary [<dir>...] [--json]                               estimate calibration (default .agent/worklog)
  history [--labels a,b] [--repo o/r] [--json]              calibration from the repository's issues (gh)
  forecast <step>=<estimate>... [--labels a,b] [--json]     P50/P80 for a plan's estimates from history
  hook [--harness claude-code|codex]                        record a hook event (used by hooks)
  issue section <N> <name> [--file <path|->] [--repo o/r]   print one marked section of N's body, or
                                                            replace or add it from the file (- is stdin)
  issue comment <N> <key> [--file <path|->] [--repo o/r]    print your comment marked <key> on N, or
                                                            edit or create it from the file

<ledger> is a folder, or issue-N for .agent/worklog/issue-N/ at the repository root, which is
meant to stay out of git (add .agent/ to .gitignore). Issue commands work on PR numbers too.
`;
class UsageError extends Error {
}
/** ISO 8601 with the local offset, e.g. 2026-10-01T21:52:07.000-04:00. */
export function localIso(date) {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    const pad = (n) => String(n).padStart(2, '0');
    const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 23);
    return `${local}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
function detectAgent(env) {
    const claude = env['CLAUDE_CODE_SESSION_ID'];
    if (claude)
        return { harness: 'claude-code', ids: [claude] };
    const codex = [env['CODEX_THREAD_ID'], env['CODEX_SESSION_ID']].filter((id) => Boolean(id));
    if (codex.length > 0)
        return { harness: 'codex', ids: [...new Set(codex)] };
    return { harness: 'shell', ids: [] };
}
function parseArgs(args) {
    const positional = [];
    const flags = new Map();
    for (let i = 0; i < args.length; i++) {
        const arg = args[i] ?? '';
        if (arg.startsWith('--')) {
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith('--')) {
                flags.set(arg.slice(2), next);
                i++;
            }
            else
                flags.set(arg.slice(2), true);
        }
        else
            positional.push(arg);
    }
    return { positional, flags };
}
function stringFlag(flags, name) {
    const value = flags.get(name);
    if (value === true)
        throw new UsageError(`--${name} needs a value.`);
    return value;
}
const ISSUE_REF = /^issue-(\d+)$/;
export const LEDGER_HOME = join('.agent', 'worklog');
/** The nearest folder at or above `from` holding `.git`, or `from` itself outside a repository. */
function repoRoot(from) {
    for (let dir = from;; dir = dirname(dir)) {
        if (existsSync(join(dir, '.git')))
            return dir;
        if (dirname(dir) === dir)
            return from;
    }
}
/** A ledger folder: `issue-N` under `.agent/worklog/` (made when `create`), else an existing folder. */
function featureDir(raw, deps, create = false) {
    if (!raw)
        throw new UsageError('Missing ledger folder.');
    if (ISSUE_REF.test(raw)) {
        const dir = join(repoRoot(deps.cwd), LEDGER_HOME, raw);
        if (create)
            mkdirSync(dir, { recursive: true });
        else if (!existsSync(dir))
            throw new UsageError(`No ledger for ${raw}: ${dir}`);
        return dir;
    }
    const dir = resolve(deps.cwd, raw);
    if (!existsSync(dir) || !statSync(dir).isDirectory())
        throw new UsageError(`Ledger folder not found: ${raw}`);
    return dir;
}
function stepName(raw) {
    if (!raw || /[|\n]/.test(raw))
        throw new UsageError('Missing or invalid step label (no "|" or newlines).');
    return raw;
}
function openSteps(events) {
    const open = new Set();
    const sorted = [...events].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    for (const e of sorted) {
        if (e.event === 'step-start')
            open.add(e.step);
        if (e.event === 'step-finish')
            open.delete(e.step);
    }
    return open;
}
function ledgerPath(dir) {
    return join(dir, 'time.jsonl');
}
function render(dir) {
    const content = renderTimeMd(basename(dir), readLedger(ledgerPath(dir)).events);
    writeFileSync(join(dir, 'time.md'), content, 'utf8');
    return content;
}
function stepEvent(deps, event, step, agent, extra) {
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
function bind(deps, dir, step, agent, ts) {
    const bindings = loadBindings(deps.stateDir).filter((b) => !agent.ids.includes(b.session));
    for (const session of agent.ids)
        bindings.push({ session, dir, step, harness: agent.harness, since: ts });
    saveBindings(deps.stateDir, bindings);
}
/** The binding that keeps this session on a different step than `dir`/`step`, if any. */
function busyBinding(deps, agent, dir, step) {
    return loadBindings(deps.stateDir).find((b) => agent.ids.includes(b.session) && !(b.dir === dir && b.step === step));
}
function start(args, deps) {
    const { positional, flags } = parseArgs(args);
    const dir = featureDir(positional[0], deps, true);
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
    if (agent.ids.length > 0)
        bind(deps, dir, step, agent, event.ts);
    else {
        deps.stderr('No agent session detected (CLAUDE_CODE_SESSION_ID or CODEX_THREAD_ID); the stamp is recorded but active time will not be measured.\n');
    }
    deps.stdout(`Started ${step} at ${event.ts}.\n`);
    return 0;
}
function join_(args, deps) {
    const { positional, flags } = parseArgs(args);
    const dir = featureDir(positional[0], deps);
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
function finish(args, deps) {
    const { positional, flags } = parseArgs(args);
    const dir = featureDir(positional[0], deps);
    const step = stepName(positional[1]);
    const note = stringFlag(flags, 'note');
    if (!openSteps(readLedger(ledgerPath(dir)).events).has(step)) {
        deps.stderr(`${step} is not open in ${dir}.\n`);
        return 1;
    }
    const agent = detectAgent(deps.env);
    appendEvent(ledgerPath(dir), stepEvent(deps, 'step-finish', step, agent, note === undefined ? {} : { note }));
    saveBindings(deps.stateDir, loadBindings(deps.stateDir).filter((b) => !(b.dir === dir && b.step === step)));
    render(dir);
    const row = computeTimes(readLedger(ledgerPath(dir)).events).steps.find((s) => s.step === step);
    const show = (ms) => (ms == null ? '—' : formatMinutes(ms / 60_000));
    deps.stdout(`Finished ${step}: wall ${show(row?.wallMs)}, active ${show(row?.activeMs)}. Wrote time.md.\n`);
    return 0;
}
async function hook(args, deps) {
    try {
        const bindings = loadBindings(deps.stateDir);
        if (bindings.length === 0)
            return 0;
        const flag = parseArgs(args).flags.get('harness');
        const activity = classifyHook(JSON.parse(await deps.stdin()));
        if (!activity)
            return 0;
        const binding = bindings.find((b) => b.session === activity.session);
        if (!binding || !existsSync(binding.dir))
            return 0;
        const harness = flag === 'claude-code' || flag === 'codex' ? flag : binding.harness;
        appendEvent(ledgerPath(binding.dir), {
            v: 1,
            ts: localIso(deps.now()),
            event: activity.event,
            step: binding.step,
            session: activity.session,
            harness,
        });
    }
    catch {
        // A hook must never disturb the agent: unreadable input or a failed write is dropped.
    }
    return 0;
}
function check(args, deps) {
    const dir = featureDir(parseArgs(args).positional[0], deps);
    const path = ledgerPath(dir);
    if (!existsSync(path)) {
        deps.stderr(`No time.jsonl in ${dir}.\n`);
        return 1;
    }
    const { events, problems } = readLedger(path);
    for (const p of problems)
        deps.stderr(`time.jsonl line ${p.line}: ${p.message}\n`);
    const timeMd = join(dir, 'time.md');
    const expected = renderTimeMd(basename(dir), events);
    const stale = !existsSync(timeMd) || readFileSync(timeMd, 'utf8') !== expected;
    if (stale)
        deps.stderr(`time.md is out of date; run worklog render ${dir}\n`);
    if (problems.length > 0 || stale)
        return 1;
    deps.stdout(`${basename(dir)}: ${events.length} events, time.md current.\n`);
    return 0;
}
/** GitHub's owner and repository name characters; anything else is refused before it reaches a path. */
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
function repoFlag(flags) {
    const repo = stringFlag(flags, 'repo');
    if (repo !== undefined && (!REPO.test(repo) || repo.endsWith('/..') || repo.endsWith('/.'))) {
        throw new UsageError(`--repo takes owner/repo, not "${repo}".`);
    }
    return repo;
}
function github(flags, deps) {
    return new GitHub(deps.exec, repoFlag(flags));
}
/** Names the harness and time, since a comment posted by an agent goes out under the person's account. */
function provenance(deps) {
    return `devflow · ${detectAgent(deps.env).harness} · ${localIso(deps.now()).slice(0, 16).replace('T', ' ')}`;
}
/** Puts the rendered time.md in the issue's `time` comment, so the history lives in the tracker. */
function post(args, deps) {
    const { positional, flags } = parseArgs(args);
    const ref = positional[0];
    const match = ref === undefined ? null : ISSUE_REF.exec(ref);
    if (!match)
        throw new UsageError('post needs an issue-N ref.');
    const dir = featureDir(ref, deps);
    const path = ledgerPath(dir);
    if (!existsSync(path)) {
        deps.stderr(`No time.jsonl in ${dir}; nothing to post.\n`);
        return 1;
    }
    const { events, problems } = readLedger(path);
    for (const p of problems)
        deps.stderr(`time.jsonl line ${p.line}: ${p.message}\n`);
    if (problems.length > 0 || events.length === 0) {
        deps.stderr(problems.length > 0 ? 'Fix the ledger before posting.\n' : 'time.jsonl has no events; nothing to post.\n');
        return 1;
    }
    const issue = Number(match[1]);
    const gh = github(flags, deps);
    // The ledger lives on one machine; a post from a ledger that lacks steps would erase them.
    const posted = gh.markedComment(issue, 'time');
    const steps = new Set(events.map((e) => e.step));
    const missing = posted ? tableSteps(posted.body).filter((step) => !steps.has(step)) : [];
    if (missing.length > 0 && !flags.has('force')) {
        deps.stderr(`The time comment on #${issue} reports ${missing.join(', ')}, which ${dir} does not have; posting would drop them. Post from the ledger that has them, or use --force.\n`);
        return 1;
    }
    const originFlag = stringFlag(flags, 'origin');
    if (originFlag !== undefined && !/^\d+(,\d+)*$/.test(originFlag)) {
        throw new UsageError('--origin takes issue numbers, such as 12 or 12,14.');
    }
    // Which issues this work fixes defects in; kept from the earlier post when not given again.
    const origin = originFlag?.split(',').map(Number) ?? (posted && parseDataLine(posted.body)?.origin);
    const data = { ...timeData(events), ...(origin ? { origin } : {}) };
    const content = `${stripFrontmatter(render(dir))}\n${dataLine(data)}\n`;
    const done = gh.upsertComment(issue, 'time', content, provenance(deps));
    deps.stdout(`${done === 'created' ? 'Created' : 'Updated'} the time comment on #${issue}.\n`);
    return 0;
}
function issueNumber(raw) {
    if (!raw || !/^\d+$/.test(raw))
        throw new UsageError('Missing or invalid issue number.');
    return Number(raw);
}
async function content(file, deps) {
    const text = file === '-' ? await deps.stdin() : readFileSync(resolve(deps.cwd, file), 'utf8');
    if (text.trim() === '')
        throw new Error('The content is empty; nothing to write.');
    return text;
}
async function issue(args, deps) {
    const [action, ...rest] = args;
    const { positional, flags } = parseArgs(rest);
    const number = issueNumber(positional[0]);
    const key = checkKey(positional[1]);
    const file = stringFlag(flags, 'file');
    const gh = github(flags, deps);
    if (file === undefined && (action === 'section' || action === 'comment')) {
        const text = action === 'section' ? gh.section(number, key) : gh.markedComment(number, key)?.body;
        if (text === undefined || text === null) {
            deps.stderr(`#${number} has no ${key} ${action}${action === 'comment' ? ' of yours' : ''}.\n`);
            return 1;
        }
        deps.stdout(`${action === 'section' ? text : commentContent(text)}\n`);
        return 0;
    }
    if (file === undefined)
        throw new UsageError(`Unknown issue action "${action ?? ''}"; use section or comment.`);
    if (action === 'section') {
        const done = gh.setSection(number, key, await content(file, deps));
        deps.stdout(done === 'added' ? `Added section ${key} to #${number}.\n` : `Updated section ${key} on #${number}.\n`);
        return 0;
    }
    if (action === 'comment') {
        const done = gh.upsertComment(number, key, await content(file, deps), provenance(deps));
        deps.stdout(`${done === 'created' ? 'Created' : 'Updated'} the ${key} comment on #${number}.\n`);
        return 0;
    }
    throw new UsageError(`Unknown issue action "${action ?? ''}"; use section or comment.`);
}
/** The issue's ledgers on this machine, as history records (labels come from GitHub). */
function localHistory(deps) {
    const home = join(repoRoot(deps.cwd), LEDGER_HOME);
    return ledgerFolders([home], deps.cwd).flatMap((dir) => {
        const match = ISSUE_REF.exec(basename(dir));
        return match
            ? [{ issue: Number(match[1]), labels: [], steps: timeData(readLedger(ledgerPath(dir)).events).steps }]
            : [];
    });
}
/** Time data from the repository's issues, cached under .agent/worklog, plus this machine's ledgers. */
function loadHistory(flags, deps) {
    const repo = repoFlag(flags);
    // Encoding the whole owner/repo keeps the name in one path component and unique per repository.
    const name = repo === undefined ? 'history.json' : `history-${encodeURIComponent(repo)}.json`;
    const cache = join(repoRoot(deps.cwd), LEDGER_HOME, name);
    return { history: collectHistory(github(flags, deps), cache, repo === undefined ? localHistory(deps) : []), cache };
}
const ratio = (r) => `${r.toFixed(2)}×`;
const minutes = (m) => (m === null ? '—' : formatMinutes(m));
function history(args, deps) {
    const { flags } = parseArgs(args);
    const { history: records, cache } = loadHistory(flags, deps);
    const kinds = calibrationByKind(records);
    const allowance = allowanceRatios(records);
    if (flags.has('json')) {
        deps.stdout(`${JSON.stringify({ issues: records, kinds, allowance }, null, 2)}\n`);
        return 0;
    }
    deps.stdout(`${records.length} issues with time data (cache: ${cache}).\n`);
    for (const k of kinds) {
        deps.stdout(`${k.kind.padEnd(9)} ${`${k.count} step${k.count === 1 ? '' : 's'}`.padEnd(10)} ${ratio(k.median)} actual/estimate (IQR ${ratio(k.q1)}–${ratio(k.q3)})\n`);
    }
    if (allowance.length > 0) {
        const median = Math.round(quantile(allowance, 0.5) * 100);
        deps.stdout(`Unplanned QA, review fixes and bug fixes: median +${median}% of planned time (${allowance.length} issues).\n`);
    }
    printReference(flags, records, deps);
    return 0;
}
function printReference(flags, records, deps) {
    const labels = (stringFlag(flags, 'labels') ?? '').split(',').filter(Boolean);
    const reference = labels.length > 0 ? referenceClass(records, labels) : null;
    if (labels.length > 0 && !reference)
        deps.stdout(`Fewer than 3 past issues labelled ${labels.join(', ')}.\n`);
    if (!reference)
        return;
    deps.stdout(`Past issues labelled ${labels.join(', ')}: median ${formatMinutes(reference.medianActiveMin)} active (IQR ${formatMinutes(reference.q1ActiveMin)}–${formatMinutes(reference.q3ActiveMin)}, ${reference.count} issues).\n`);
}
function table(rows) {
    const widths = (rows[0] ?? []).map((_, col) => Math.max(...rows.map((r) => (r[col] ?? '').length)));
    return rows
        .map((r) => r
        .map((c, i) => c.padEnd(widths[i] ?? 0))
        .join('  ')
        .trimEnd())
        .join('\n');
}
function forecastCommand(args, deps) {
    const { positional, flags } = parseArgs(args);
    if (positional.length === 0)
        throw new UsageError('forecast needs estimates as step=estimate, such as S1=1h30m.');
    const estimates = positional.map((arg) => {
        const [step, estimate] = arg.split('=');
        if (!step || !estimate)
            throw new UsageError(`Give "${arg}" as step=estimate, such as S1=1h30m.`);
        return { step: stepName(step), estimateMin: parseEstimate(estimate) };
    });
    const labels = (stringFlag(flags, 'labels') ?? '').split(',').filter(Boolean);
    const { history: records } = loadHistory(flags, deps);
    const result = simulate(estimates, records, { runs: 10_000, random: seededRandom(1) });
    const reference = labels.length > 0 ? referenceClass(records, labels) : null;
    if (flags.has('json')) {
        deps.stdout(`${JSON.stringify({ forecast: result, referenceClass: reference }, null, 2)}\n`);
        return 0;
    }
    if (result.total.p50Min === null) {
        deps.stdout(`No basis yet: fewer than 5 finished steps with an estimate and measured time. Quote ${formatMinutes(result.total.estimateMin)} as judgement, with a range.\n`);
        return 0;
    }
    const rows = [
        ['Step', 'Estimate', 'Basis', 'P50', 'P80'],
        ...result.steps.map((s) => [
            s.step,
            minutes(s.estimateMin),
            `${s.basis} (${s.samples})`,
            minutes(s.p50Min),
            minutes(s.p80Min),
        ]),
        ['Total', minutes(result.total.estimateMin), '', minutes(result.total.p50Min), minutes(result.total.p80Min)],
    ];
    const a = result.withAllowance;
    if (a) {
        rows.push([
            'With QA and fixes',
            '',
            `+${Math.round(a.medianRatio * 100)}% (${a.issues} issues)`,
            minutes(a.p50Min),
            minutes(a.p80Min),
        ]);
    }
    deps.stdout(`P50: as likely over as under. P80: four in five finish within it.\n\n${table(rows)}\n`);
    if (labels.length > 0)
        deps.stdout('\n');
    printReference(flags, records, deps);
    return 0;
}
function status(deps) {
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
function ledgerFolders(paths, cwd) {
    const folders = [];
    for (const raw of paths) {
        const dir = resolve(cwd, raw);
        if (existsSync(ledgerPath(dir)))
            folders.push(dir);
        else if (existsSync(dir) && statSync(dir).isDirectory()) {
            for (const entry of readdirSync(dir).sort()) {
                if (existsSync(ledgerPath(join(dir, entry))))
                    folders.push(join(dir, entry));
            }
        }
    }
    return folders;
}
function summary(args, deps) {
    const { positional, flags } = parseArgs(args);
    const folders = ledgerFolders(positional.length > 0 ? positional : [join(repoRoot(deps.cwd), LEDGER_HOME)], deps.cwd);
    const result = summarize(folders.map((dir) => ({ name: basename(dir), events: readLedger(ledgerPath(dir)).events })));
    if (flags.has('json')) {
        deps.stdout(`${JSON.stringify(result, null, 2)}\n`);
        return 0;
    }
    const c = result.calibration;
    deps.stdout(c
        ? `Calibration from ${c.count} finished steps: actual/estimate median ${c.median.toFixed(2)} (IQR ${c.q1.toFixed(2)}–${c.q3.toFixed(2)}).\n`
        : 'No finished steps with both an estimate and measured active time yet; estimates have no baseline.\n');
    const show = (ms) => (ms === null ? '—' : formatMinutes(ms / 60_000));
    for (const f of result.features) {
        const estimate = f.estimateMin === null ? '—' : formatMinutes(f.estimateMin);
        deps.stdout(`${f.name}\testimate ${estimate}\tactive ${show(f.activeMs)}\twall ${show(f.wallMs)}\n`);
    }
    return 0;
}
export async function runCli(argv, deps) {
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
                const dir = featureDir(parseArgs(args).positional[0], deps);
                render(dir);
                deps.stdout(`Wrote ${join(dir, 'time.md')}.\n`);
                return 0;
            }
            case 'check':
                return check(args, deps);
            case 'post':
                return post(args, deps);
            case 'issue':
                return await issue(args, deps);
            case 'history':
                return history(args, deps);
            case 'forecast':
                return forecastCommand(args, deps);
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
    }
    catch (error) {
        deps.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
        if (error instanceof UsageError)
            deps.stderr(USAGE);
        return 1;
    }
}
