import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTimes } from '../src/active.js';
import type { LedgerEvent } from '../src/ledger.js';

const T0 = Date.parse('2026-10-05T09:00:00-04:00');
const MIN = 60_000;

function at(minutes: number): string {
  return new Date(T0 + minutes * MIN).toISOString();
}

function ev(minutes: number, event: LedgerEvent['event'], extra: Partial<LedgerEvent> = {}): LedgerEvent {
  return { v: 1, ts: at(minutes), event, step: 'S1', session: 'a', harness: 'claude-code', ...extra };
}

function activeMinutes(events: LedgerEvent[], step = 'S1'): number | null {
  const row = computeTimes(events).steps.find((s) => s.step === step);
  assert.ok(row, `no row for ${step}`);
  return row.activeMs === null ? null : row.activeMs / MIN;
}

test('gaps inside a turn count in full', () => {
  const events = [ev(0, 'step-start'), ev(10, 'tool'), ev(20, 'stop'), ev(20, 'step-finish')];
  assert.equal(activeMinutes(events), 20);
});

test('a gap waiting on a person after a turn counts at most 5 minutes', () => {
  const events = [ev(0, 'step-start'), ev(10, 'stop'), ev(60, 'prompt'), ev(70, 'stop'), ev(70, 'step-finish')];
  assert.equal(activeMinutes(events), 25);
});

test('a single silent gap inside a turn counts at most 30 minutes', () => {
  const events = [ev(0, 'step-start'), ev(50, 'tool'), ev(50, 'stop'), ev(50, 'step-finish')];
  assert.equal(activeMinutes(events), 30);
});

test('waiting on a question counts at most 5 minutes', () => {
  const events = [ev(0, 'step-start'), ev(5, 'wait'), ev(65, 'tool'), ev(70, 'stop'), ev(70, 'step-finish')];
  assert.equal(activeMinutes(events), 15);
});

test('parallel sessions are not counted twice', () => {
  const events = [
    ev(0, 'step-start'),
    ev(0, 'join', { session: 'b', harness: 'codex' }),
    ev(5, 'tool'),
    ev(5, 'tool', { session: 'b', harness: 'codex' }),
    ev(10, 'stop'),
    ev(10, 'stop', { session: 'b', harness: 'codex' }),
    ev(10, 'step-finish'),
  ];
  assert.equal(activeMinutes(events), 10);
});

test('a window with no activity events has no active time', () => {
  const events = [ev(0, 'step-start'), ev(30, 'step-finish')];
  assert.equal(activeMinutes(events), null);
});

test('a step may have several windows', () => {
  const events = [
    ev(0, 'step-start'),
    ev(10, 'stop'),
    ev(10, 'step-finish'),
    ev(60, 'step-start'),
    ev(70, 'stop'),
    ev(70, 'step-finish'),
  ];
  const row = computeTimes(events).steps[0];
  assert.ok(row);
  assert.equal(row.wallMs, 20 * MIN);
  assert.equal(row.activeMs, 20 * MIN);
  assert.equal(row.started, at(0));
  assert.equal(row.finished, at(70));
});

test('activity outside every window is ignored', () => {
  const events = [ev(0, 'step-start'), ev(10, 'stop'), ev(10, 'step-finish'), ev(20, 'tool'), ev(25, 'stop')];
  assert.equal(activeMinutes(events), 10);
});

test('the feature total is the union over steps, not the sum', () => {
  const events = [
    ev(0, 'step-start'),
    ev(0, 'step-start', { step: 'S2', session: 'b' }),
    ev(10, 'stop'),
    ev(10, 'stop', { step: 'S2', session: 'b' }),
    ev(10, 'step-finish'),
    ev(10, 'step-finish', { step: 'S2', session: 'b' }),
  ];
  const times = computeTimes(events);
  assert.equal(times.total.activeMs, 10 * MIN);
  assert.equal(times.total.wallMs, 10 * MIN);
});

test('durations use absolute time when the local clock falls back', () => {
  const events: LedgerEvent[] = [
    { v: 1, ts: '2026-11-01T01:50:00-04:00', event: 'step-start', step: 'S1', session: 'a', harness: 'codex' },
    { v: 1, ts: '2026-11-01T01:10:00-05:00', event: 'stop', step: 'S1', session: 'a', harness: 'codex' },
    { v: 1, ts: '2026-11-01T01:10:00-05:00', event: 'step-finish', step: 'S1', session: 'a', harness: 'codex' },
  ];
  assert.equal(activeMinutes(events), 20);
});

test('an open step has no finish or wall time but counts activity so far', () => {
  const events = [ev(0, 'step-start'), ev(15, 'stop')];
  const row = computeTimes(events).steps[0];
  assert.ok(row);
  assert.equal(row.finished, null);
  assert.equal(row.wallMs, null);
  assert.equal(row.activeMs, 15 * MIN);
});

test('the estimate is frozen at the first start of a step', () => {
  const events = [
    ev(0, 'step-start', { estimateMin: 30 }),
    ev(10, 'stop'),
    ev(10, 'step-finish'),
    ev(20, 'step-start', { estimateMin: 90 }),
    ev(25, 'stop'),
    ev(25, 'step-finish'),
  ];
  assert.equal(computeTimes(events).steps[0]?.estimateMin, 30);
});

test('rows keep the order in which steps first started and list their sessions', () => {
  const events = [
    ev(0, 'step-start', { step: 'brief' }),
    ev(1, 'step-finish', { step: 'brief' }),
    ev(2, 'step-start'),
    ev(2, 'join', { session: 'b', harness: 'codex' }),
    ev(3, 'step-finish'),
  ];
  const times = computeTimes(events);
  assert.deepEqual(
    times.steps.map((s) => s.step),
    ['brief', 'S1'],
  );
  assert.deepEqual(times.steps[1]?.sessions, [
    { session: 'a', harness: 'claude-code' },
    { session: 'b', harness: 'codex' },
  ]);
});
