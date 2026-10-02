import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, type CliDeps } from '../src/cli-core.js';
import { parseLedger } from '../src/ledger.js';

let root: string;
let feature: string;
let stateDir: string;
let clock: number;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'worklog-'));
  feature = join(root, 'docs', 'features', '2026-10-05-sample');
  mkdirSync(feature, { recursive: true });
  stateDir = join(root, 'state');
  clock = Date.parse('2026-10-05T09:00:00-04:00');
});

interface Run {
  code: number;
  out: string;
  err: string;
}

async function run(argv: string[], env: Record<string, string> = {}, stdin = ''): Promise<Run> {
  let out = '';
  let err = '';
  const deps: CliDeps = {
    env,
    now: () => new Date(clock),
    stateDir,
    stdin: async () => stdin,
    stdout: (s) => {
      out += s;
    },
    stderr: (s) => {
      err += s;
    },
  };
  const code = await runCli(argv, deps);
  return { code, out, err };
}

const claude = { CLAUDE_CODE_SESSION_ID: 'claude-session-1' };
const codex = { CODEX_THREAD_ID: 'codex-thread-1' };

function ledger(): ReturnType<typeof parseLedger>['events'] {
  return parseLedger(readFileSync(join(feature, 'time.jsonl'), 'utf8')).events;
}

function advance(minutes: number): void {
  clock += minutes * 60_000;
}

test('start records the step, its estimate and the agent session, then binds the session', async () => {
  const result = await run(['start', feature, 'S1', '--estimate', '1h30m'], claude);
  assert.equal(result.code, 0, result.err);
  const [event] = ledger();
  assert.ok(event);
  assert.equal(event.event, 'step-start');
  assert.equal(event.step, 'S1');
  assert.equal(event.estimateMin, 90);
  assert.equal(event.session, 'claude-session-1');
  assert.equal(event.harness, 'claude-code');
  assert.equal(Date.parse(event.ts), clock);
  assert.match(readFileSync(join(stateDir, 'active.json'), 'utf8'), /claude-session-1/);
});

test('hook events from a bound session are appended to the feature ledger', async () => {
  await run(['start', feature, 'S1'], claude);
  advance(3);
  const payload = JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 'claude-session-1', tool_name: 'Bash' });
  const result = await run(['hook', '--harness', 'claude-code'], {}, payload);
  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  const last = ledger().at(-1);
  assert.deepEqual(last && { event: last.event, step: last.step, session: last.session, harness: last.harness }, {
    event: 'tool',
    step: 'S1',
    session: 'claude-session-1',
    harness: 'claude-code',
  });
});

test('hook events from other sessions and unreadable payloads are ignored silently', async () => {
  await run(['start', feature, 'S1'], claude);
  const other = JSON.stringify({ hook_event_name: 'Stop', session_id: 'someone-else' });
  assert.deepEqual(await run(['hook', '--harness', 'claude-code'], {}, other), { code: 0, out: '', err: '' });
  assert.deepEqual(await run(['hook', '--harness', 'codex'], {}, '{not json'), { code: 0, out: '', err: '' });
  assert.equal(ledger().length, 1);
});

test('the hook does nothing when no step is open anywhere', async () => {
  const payload = JSON.stringify({ hook_event_name: 'Stop', session_id: 'claude-session-1' });
  assert.deepEqual(await run(['hook', '--harness', 'claude-code'], {}, payload), { code: 0, out: '', err: '' });
  assert.equal(existsSync(join(feature, 'time.jsonl')), false);
});

test('finish closes the step, unbinds its sessions and writes time.md', async () => {
  await run(['start', feature, 'S1', '--estimate', '30m'], claude);
  advance(20);
  await run(
    ['hook', '--harness', 'claude-code'],
    {},
    JSON.stringify({ hook_event_name: 'Stop', session_id: 'claude-session-1' }),
  );
  const result = await run(['finish', feature, 'S1'], claude);
  assert.equal(result.code, 0, result.err);
  assert.equal(ledger().at(-1)?.event, 'step-finish');
  assert.equal(existsSync(join(stateDir, 'active.json')), false);
  assert.match(readFileSync(join(feature, 'time.md'), 'utf8'), /\| S1 +\| 30m +\|.*\| 20m +\| 20m +\|/);
  assert.match(result.out, /S1/);
});

test('a second session can join an open step', async () => {
  await run(['start', feature, 'S1'], claude);
  const result = await run(['join', feature, 'S1'], codex);
  assert.equal(result.code, 0, result.err);
  const last = ledger().at(-1);
  assert.equal(last?.event, 'join');
  assert.equal(last?.harness, 'codex');
  await run(
    ['hook', '--harness', 'codex'],
    {},
    JSON.stringify({ hook_event_name: 'Stop', session_id: 'codex-thread-1' }),
  );
  assert.equal(ledger().at(-1)?.session, 'codex-thread-1');
});

test('a hook without --harness records the harness its session was bound with', async () => {
  await run(['start', feature, 'S1'], claude);
  await run(['join', feature, 'S1'], codex);
  await run(['hook'], {}, JSON.stringify({ hook_event_name: 'Stop', session_id: 'codex-thread-1' }));
  assert.equal(ledger().at(-1)?.harness, 'codex');
  await run(['hook'], {}, JSON.stringify({ hook_event_name: 'Stop', session_id: 'claude-session-1' }));
  assert.equal(ledger().at(-1)?.harness, 'claude-code');
});

test('starting an open step again, or finishing one that is not open, fails clearly', async () => {
  await run(['start', feature, 'S1'], claude);
  const again = await run(['start', feature, 'S1'], claude);
  assert.equal(again.code, 1);
  assert.match(again.err, /already open/);
  const notOpen = await run(['finish', feature, 'S9'], claude);
  assert.equal(notOpen.code, 1);
  assert.match(notOpen.err, /not open/);
});

test('a session already working on another open step must finish it first', async () => {
  await run(['start', feature, 'S1'], claude);
  const result = await run(['start', feature, 'S2'], claude);
  assert.equal(result.code, 1);
  assert.match(result.err, /S1/);
});

test('without an agent session the stamp is still recorded, with a warning', async () => {
  const result = await run(['start', feature, 'S1'], {});
  assert.equal(result.code, 0);
  assert.match(result.err, /no agent session/i);
  const [event] = ledger();
  assert.equal(event?.session, null);
  assert.equal(event?.harness, 'shell');
  assert.equal(existsSync(join(stateDir, 'active.json')), false);
});

test('check passes for a current time.md and fails for a stale one or a bad ledger line', async () => {
  await run(['start', feature, 'S1'], claude);
  advance(5);
  await run(['finish', feature, 'S1'], claude);
  assert.equal((await run(['check', feature])).code, 0);
  writeFileSync(join(feature, 'time.md'), 'edited by hand\n');
  const stale = await run(['check', feature]);
  assert.equal(stale.code, 1);
  assert.match(stale.err, /time\.md/);
  await run(['render', feature]);
  writeFileSync(join(feature, 'time.jsonl'), `${readFileSync(join(feature, 'time.jsonl'), 'utf8')}oops\n`);
  const bad = await run(['check', feature]);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /line 3/);
});

test('summary reports calibration across feature folders', async () => {
  await run(['start', feature, 'S1', '--estimate', '20m'], claude);
  advance(10);
  await run(
    ['hook', '--harness', 'claude-code'],
    {},
    JSON.stringify({ hook_event_name: 'Stop', session_id: 'claude-session-1' }),
  );
  await run(['finish', feature, 'S1'], claude);
  const result = await run(['summary', join(root, 'docs', 'features'), '--json']);
  assert.equal(result.code, 0, result.err);
  const parsed = JSON.parse(result.out) as { calibration: { median: number; count: number } };
  assert.equal(parsed.calibration.count, 1);
  assert.equal(parsed.calibration.median, 0.5);
});

test('unknown commands print usage and fail', async () => {
  const result = await run(['frobnicate']);
  assert.equal(result.code, 1);
  assert.match(result.err, /usage/i);
});
