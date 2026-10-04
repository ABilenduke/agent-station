import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli, type CliDeps } from '../src/cli-core.js';
import { parseLedger } from '../src/ledger.js';
import { FakeGitHub } from './fake-gh.js';
import { dataLine, parseDataLine } from '../src/history.js';

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
  github = new FakeGitHub();
});

interface Run {
  code: number;
  out: string;
  err: string;
}

let github: FakeGitHub;

async function run(argv: string[], env: Record<string, string> = {}, stdin = ''): Promise<Run> {
  let out = '';
  let err = '';
  const deps: CliDeps = {
    env,
    now: () => new Date(clock),
    stateDir,
    cwd: root,
    exec: (command, args, input) => github.exec(command, args, input),
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

test('a session still bound to another step cannot join, and keeps its binding', async () => {
  await run(['start', feature, 'S1'], claude);
  await run(['start', feature, 'S2'], codex);
  const before = readFileSync(join(stateDir, 'active.json'), 'utf8');
  const result = await run(['join', feature, 'S1'], codex);
  assert.equal(result.code, 1);
  assert.match(result.err, /still on S2/);
  assert.equal(readFileSync(join(stateDir, 'active.json'), 'utf8'), before);
  assert.equal(ledger().filter((e) => e.event === 'join').length, 0);
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

test('an issue-N ledger lives under .agent/worklog at the repository root, outside the code', async () => {
  mkdirSync(join(root, '.git'));
  const result = await run(['start', 'issue-9', 'S1'], claude);
  assert.equal(result.code, 0, result.err);
  assert.ok(existsSync(join(root, '.agent', 'worklog', 'issue-9', 'time.jsonl')));
  assert.equal((await run(['finish', 'issue-9', 'S1'], claude)).code, 0);
  assert.ok(existsSync(join(root, '.agent', 'worklog', 'issue-9', 'time.md')));
});

test('an issue-N ledger that was never started is reported, not created', async () => {
  const result = await run(['finish', 'issue-9', 'S1'], claude);
  assert.equal(result.code, 1);
  assert.match(result.err, /No ledger for issue-9/);
  assert.equal(existsSync(join(root, '.agent')), false);
});

test('post puts the rendered time.md, without frontmatter, in one marked comment on the issue', async () => {
  github.issue(9);
  await run(['start', 'issue-9', 'S1'], claude);
  await run(['finish', 'issue-9', 'S1'], claude);
  const result = await run(['post', 'issue-9'], claude);
  assert.equal(result.code, 0, result.err);
  const [comment] = github.comments(9);
  assert.ok(comment);
  assert.ok(comment.body.startsWith('<!-- devflow:comment time -->\n# Time: issue-9\n'));
  assert.doesNotMatch(comment.body, /doc: time/);
  assert.match(comment.body, /\n\n<sub>devflow · claude-code · \d{4}-\d\d-\d\d \d\d:\d\d<\/sub>\n$/);
  assert.match(result.out, /Created the time comment on #9/);
});

test('posting again updates the same comment instead of adding another', async () => {
  github.issue(9);
  await run(['start', 'issue-9', 'S1'], claude);
  await run(['finish', 'issue-9', 'S1'], claude);
  await run(['post', 'issue-9']);
  advance(10);
  await run(['start', 'issue-9', 'S2'], claude);
  await run(['finish', 'issue-9', 'S2'], claude);
  const again = await run(['post', 'issue-9']);
  assert.equal(again.code, 0, again.err);
  assert.equal(github.comments(9).length, 1);
  assert.match(github.comments(9)[0]?.body ?? '', /\| S2 /);
  assert.match(again.out, /Updated the time comment on #9/);
});

test('post refuses to replace a time comment that reports steps this ledger lacks, unless forced', async () => {
  github.issue(9);
  github.comment(
    9,
    'owner',
    '<!-- devflow:comment time -->\n# Time: issue-9\n\n| Step | Estimate |\n| ---- | -------- |\n| brief | 30m |\n| S1 | 1h |\n| **Total** | 1h30m |\n',
  );
  await run(['start', 'issue-9', 'S2'], claude);
  await run(['finish', 'issue-9', 'S2'], claude);
  const refused = await run(['post', 'issue-9']);
  assert.equal(refused.code, 1);
  assert.match(refused.err, /brief, S1/);
  assert.match(refused.err, /--force/);
  assert.match(github.comments(9)[0]?.body ?? '', /\| S1 /);
  const forced = await run(['post', 'issue-9', '--force']);
  assert.equal(forced.code, 0, forced.err);
  assert.doesNotMatch(github.comments(9)[0]?.body ?? '', /\| S1 /);
});

test('post fails clearly when gh fails, and only accepts issue-N refs', async () => {
  await run(['start', 'issue-9', 'S1'], claude);
  github.failure = 'no auth';
  const failed = await run(['post', 'issue-9']);
  assert.equal(failed.code, 1);
  assert.match(failed.err, /gh api .* failed: no auth/);
  const folder = await run(['post', feature]);
  assert.equal(folder.code, 1);
  assert.match(folder.err, /issue-N/);
});

test('post to an issue that does not exist fails without creating anything', async () => {
  await run(['start', 'issue-9', 'S1'], claude);
  const result = await run(['post', 'issue-9']);
  assert.equal(result.code, 1);
  assert.match(result.err, /404/);
  assert.equal(
    github.calls.some((c) => c.args.includes('POST')),
    false,
  );
});

test('summary reads .agent/worklog when no folder is given', async () => {
  await run(['start', 'issue-9', 'S1', '--estimate', '1h'], claude);
  advance(30);
  await run(['finish', 'issue-9', 'S1'], claude);
  const result = await run(['summary']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /issue-9/);
});

test('post refuses a missing, empty or malformed ledger and never calls gh', async () => {
  const folder = join(root, '.agent', 'worklog', 'issue-9');
  mkdirSync(folder, { recursive: true });
  const missing = await run(['post', 'issue-9']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /No time\.jsonl/);

  writeFileSync(join(folder, 'time.jsonl'), '');
  const empty = await run(['post', 'issue-9']);
  assert.equal(empty.code, 1);
  assert.match(empty.err, /no events/);

  await run(['start', 'issue-9', 'S1'], claude);
  writeFileSync(join(folder, 'time.jsonl'), `${readFileSync(join(folder, 'time.jsonl'), 'utf8')}not json\n`);
  const malformed = await run(['post', 'issue-9']);
  assert.equal(malformed.code, 1);
  assert.match(malformed.err, /line 1: not valid JSON|line 2: not valid JSON/);
  assert.match(malformed.err, /Fix the ledger/);

  assert.deepEqual(github.calls, []);
});

test('issue section replaces one marked section of the body and keeps the rest', async () => {
  github.issue(12, 'Edited by hand.\n\n<!-- devflow:section brief -->\nold\n<!-- /devflow:section brief -->\n');
  writeFileSync(join(root, 'brief.md'), 'new brief\n');
  const result = await run(['issue', 'section', '12', 'brief', '--file', 'brief.md']);
  assert.equal(result.code, 0, result.err);
  assert.equal(
    github.issues.get(12)?.body,
    'Edited by hand.\n\n<!-- devflow:section brief -->\nnew brief\n<!-- /devflow:section brief -->\n',
  );
  assert.match(result.out, /Updated section brief on #12/);
});

test('issue section adds a missing section, reading the content from stdin, even to an empty body', async () => {
  github.issue(12, null);
  const result = await run(['issue', 'section', '12', 'plan', '--file', '-'], {}, 'the plan\n');
  assert.equal(result.code, 0, result.err);
  assert.equal(
    github.issues.get(12)?.body,
    '<!-- devflow:section plan -->\nthe plan\n<!-- /devflow:section plan -->\n',
  );
  assert.match(result.out, /Added section plan to #12/);
});

test('issue section refuses empty content, a bad name and a body it cannot edit safely', async () => {
  github.issue(12, '<!-- devflow:section brief -->\nopen\n');
  assert.match((await run(['issue', 'section', '12', 'brief', '--file', '-'], {}, '  \n')).err, /empty/);
  assert.match((await run(['issue', 'section', '12', 'two words', '--file', '-'], {}, 'x')).err, /Invalid/);
  assert.match((await run(['issue', 'section', 'twelve', 'brief', '--file', '-'], {}, 'x')).err, /issue number/);
  const unsafe = await run(['issue', 'section', '12', 'brief', '--file', '-'], {}, 'x');
  assert.equal(unsafe.code, 1);
  assert.match(unsafe.err, /no end marker/);
  assert.equal(
    github.calls.some((c) => c.args.includes('PATCH')),
    false,
  );
});

test('issue comment creates this account’s marked comment, then edits it on later runs', async () => {
  github.issue(12);
  github.comment(12, 'stranger', '<!-- devflow:comment research -->\nplanted');
  const first = await run(['issue', 'comment', '12', 'research', '--file', '-'], codex, 'findings v1\n');
  assert.equal(first.code, 0, first.err);
  assert.match(first.out, /Created the research comment on #12/);
  for (let i = 0; i < 3; i++) github.comment(12, 'owner', 'chatter');
  const second = await run(['issue', 'comment', '12', 'research', '--file', '-'], codex, 'findings v2\n');
  assert.equal(second.code, 0, second.err);
  assert.match(second.out, /Updated the research comment on #12/);
  const mine = github
    .comments(12)
    .filter((c) => c.body.includes('devflow:comment research') && c.user.login === 'owner');
  assert.equal(mine.length, 1);
  assert.match(mine[0]?.body ?? '', /findings v2\n\n<sub>devflow · codex · /);
  assert.equal(github.comments(12)[0]?.body, '<!-- devflow:comment research -->\nplanted');
});

test('without --file, issue section and issue comment print the current content for editing', async () => {
  github.issue(12, 'Note.\n\n<!-- devflow:section plan -->\n## Plan\n\nS1\n<!-- /devflow:section plan -->\n');
  await run(['issue', 'comment', '12', 'research', '--file', '-'], claude, '## Research\n\nF1\n');
  const section = await run(['issue', 'section', '12', 'plan']);
  assert.equal(section.code, 0, section.err);
  assert.equal(section.out, '## Plan\n\nS1\n');
  const comment = await run(['issue', 'comment', '12', 'research']);
  assert.equal(comment.code, 0, comment.err);
  assert.equal(comment.out, '## Research\n\nF1\n');
  // Writing back what was read keeps a single marker and a single provenance line.
  await run(['issue', 'comment', '12', 'research', '--file', '-'], claude, comment.out);
  const body = github.comments(12)[0]?.body ?? '';
  assert.equal(body.match(/devflow:comment research/g)?.length, 1);
  assert.equal(body.match(/<sub>/g)?.length, 1);
  const missing = await run(['issue', 'section', '12', 'spec']);
  assert.equal(missing.code, 1);
  assert.match(missing.err, /no spec section/);
  assert.match((await run(['issue', 'comment', '12', 'review'])).err, /no review comment/);
});

test('issue commands pass --repo through to gh and refuse text over GitHub’s size limit', async () => {
  github.issue(12);
  await run(['issue', 'comment', '12', 'review', '--file', '-', '--repo', 'acme/widgets'], {}, 'ok');
  assert.ok(github.calls.some((c) => c.args.includes('repos/acme/widgets/issues/12/comments')));
  const big = await run(['issue', 'comment', '12', 'review', '--file', '-'], {}, 'x'.repeat(70_000));
  assert.equal(big.code, 1);
  assert.match(big.err, /65536/);
});

test('post leaves a data line in the time comment that history can read back', async () => {
  github.issue(9);
  await run(['start', 'issue-9', 'S1', '--estimate', '1h'], claude);
  advance(20);
  await run(['finish', 'issue-9', 'S1'], claude);
  await run(['post', 'issue-9']);
  const data = parseDataLine(github.comments(9)[0]?.body ?? '');
  assert.equal(data?.steps[0]?.step, 'S1');
  assert.equal(data?.steps[0]?.estimateMin, 60);
});

test('post --origin marks the work as fixing defects from other issues, and later posts keep it', async () => {
  github.issue(20);
  await run(['start', 'issue-20', 'fix'], claude);
  await run(['finish', 'issue-20', 'fix'], claude);
  assert.equal((await run(['post', 'issue-20', '--origin', '12,14'])).code, 0);
  assert.deepEqual(parseDataLine(github.comments(20)[0]?.body ?? '')?.origin, [12, 14]);
  assert.equal((await run(['post', 'issue-20'])).code, 0);
  assert.deepEqual(parseDataLine(github.comments(20)[0]?.body ?? '')?.origin, [12, 14]);
  assert.match((await run(['post', 'issue-20', '--origin', 'twelve'])).err, /--origin/);
});

/** Six closed issues whose time comments say build steps took 1.5 times their estimate. */
function seedHistory(): void {
  for (let n = 1; n <= 6; n++) {
    github.issue(n, '', { labels: ['type:feature', 'track:full', 'stage:done'], state: 'closed' });
    const steps = [{ step: 'S1', estimateMin: 40, activeMin: 60, finished: `2026-09-0${n}T10:00:00Z` }];
    github.comment(n, 'owner', `<!-- devflow:comment time -->\n# Time\n\n${dataLine({ v: 1, steps })}\n`);
  }
  github.issue(7, '', { state: 'closed' });
  github.comment(
    7,
    'stranger',
    `<!-- devflow:comment time -->\n${dataLine({ v: 1, steps: [{ step: 'S1', estimateMin: 1, activeMin: 999, finished: '2026-09-09T10:00:00Z' }] })}`,
  );
  github.issue(8, '', { pr: true });
}

test('history gathers your time data from the repository’s issues and caches closed ones', async () => {
  mkdirSync(join(root, '.git'));
  seedHistory();
  const result = await run(['history']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /6 issues/);
  assert.match(result.out, /build\s+6 steps\s+1\.50×/);
  assert.ok(existsSync(join(root, '.agent', 'worklog', 'history.json')));
  const json = JSON.parse((await run(['history', '--json'])).out) as { issues: Array<{ issue: number }> };
  assert.deepEqual(json.issues.map((i) => i.issue).sort(), [1, 2, 3, 4, 5, 6]);
  assert.match((await run(['history', '--labels', 'type:feature,track:full'])).out, /track:full: median 1h active/);
  github.calls = [];
  await run(['history']);
  assert.equal(github.calls.filter((c) => c.args.some((a) => a.endsWith('/comments'))).length, 0);
});

test('forecast turns step estimates into P50 and P80 from that history, with a reference class', async () => {
  mkdirSync(join(root, '.git'));
  seedHistory();
  const result = await run(['forecast', 'S1=1h', 'S2=30m', '--labels', 'type:feature,track:full']);
  assert.equal(result.code, 0, result.err);
  assert.match(result.out, /S1\s+1h\s+build \(6\)\s+1h 30m\s+1h 30m/);
  assert.match(result.out, /Total\s+1h 30m\s+2h 15m\s+2h 15m/);
  assert.match(result.out, /type:feature, track:full: median 1h active .*6 issues/);
  const json = JSON.parse((await run(['forecast', 'S1=1h', '--json'])).out) as {
    forecast: { total: { p50Min: number } };
  };
  assert.equal(json.forecast.total.p50Min, 90);
});

test('forecast says when there is no basis yet, and rejects malformed estimates', async () => {
  mkdirSync(join(root, '.git'));
  github.issue(1);
  const none = await run(['forecast', 'S1=1h']);
  assert.equal(none.code, 0, none.err);
  assert.match(none.out, /No basis yet/);
  const bad = await run(['forecast', 'S1']);
  assert.equal(bad.code, 1);
  assert.match(bad.err, /step=estimate/);
});
