import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantile, summarize } from '../src/summary.js';
import type { LedgerEvent } from '../src/ledger.js';

const base = { v: 1 as const, session: 'a', harness: 'claude-code' as const };

function step(step: string, startMin: number, activeMin: number, estimateMin?: number): LedgerEvent[] {
  const t = (m: number): string => new Date(Date.parse('2026-10-05T09:00:00-04:00') + m * 60_000).toISOString();
  const work: LedgerEvent[] = [];
  for (let m = 20; m < activeMin; m += 20) work.push({ ...base, ts: t(startMin + m), event: 'tool', step });
  return [
    { ...base, ts: t(startMin), event: 'step-start', step, ...(estimateMin === undefined ? {} : { estimateMin }) },
    ...work,
    { ...base, ts: t(startMin + activeMin), event: 'stop', step },
    { ...base, ts: t(startMin + activeMin), event: 'step-finish', step },
  ];
}

test('quantile interpolates between ranked values', () => {
  const values = [0.5, 1, 1.5, 2];
  assert.equal(quantile(values, 0.5), 1.25);
  assert.equal(quantile(values, 0.25), 0.875);
  assert.equal(quantile(values, 0.75), 1.625);
});

test('calibration is the median of actual over estimate across finished, estimated, measured steps', () => {
  const summary = summarize([
    { name: 'f1', events: [...step('S1', 0, 30, 60), ...step('S2', 60, 60, 60)] },
    { name: 'f2', events: [...step('S1', 0, 90, 60), ...step('S2', 120, 120, 60), ...step('S3', 300, 10)] },
  ]);
  assert.ok(summary.calibration);
  assert.equal(summary.calibration.count, 4);
  assert.equal(summary.calibration.median, 1.25);
  assert.equal(summary.calibration.q1, 0.875);
  assert.equal(summary.calibration.q3, 1.625);
  assert.deepEqual(
    summary.features.map((f) => [f.name, f.estimateMin, f.activeMs === null ? null : f.activeMs / 60_000]),
    [
      ['f1', 120, 90],
      ['f2', 120, 220],
    ],
  );
});

test('without estimated and measured steps there is no calibration', () => {
  assert.equal(summarize([{ name: 'f1', events: step('S1', 0, 30) }]).calibration, null);
});
