import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTimes } from '../src/active.js';
import type { LedgerEvent } from '../src/ledger.js';
import {
  dataLine,
  forecast,
  parseDataLine,
  referenceClass,
  seededRandom,
  stepKind,
  timeData,
  type IssueRecord,
} from '../src/history.js';

function event(ts: string, event: LedgerEvent['event'], step: string, extra: Partial<LedgerEvent> = {}): LedgerEvent {
  return { v: 1, ts, event, step, session: 's1', harness: 'claude-code', ...extra };
}

const ledger: LedgerEvent[] = [
  event('2026-10-05T09:00:00-04:00', 'step-start', 'S1', { estimateMin: 60 }),
  event('2026-10-05T09:01:00-04:00', 'prompt', 'S1'),
  event('2026-10-05T09:40:00-04:00', 'stop', 'S1'),
  event('2026-10-05T09:41:00-04:00', 'step-finish', 'S1'),
  event('2026-10-05T10:00:00-04:00', 'step-start', 'S2'),
];

test('timeData records each step’s estimate, measured active minutes and finish from the ledger', () => {
  const data = timeData(ledger);
  const times = computeTimes(ledger);
  assert.equal(data.v, 1);
  assert.deepEqual(data.steps[0], {
    step: 'S1',
    estimateMin: 60,
    activeMin: Math.round((times.steps[0]?.activeMs ?? 0) / 6_000) / 10,
    finished: '2026-10-05T09:41:00-04:00',
  });
  assert.deepEqual(data.steps[1], { step: 'S2', estimateMin: null, activeMin: null, finished: null });
});

test('the data line survives a round trip inside a comment and is ignored when absent or malformed', () => {
  const data = timeData(ledger);
  const body = `# Time\n\n| table |\n\n${dataLine(data)}\n\n<sub>devflow</sub>\n`;
  assert.deepEqual(parseDataLine(body), data);
  assert.equal(parseDataLine('# Time only'), null);
  assert.equal(parseDataLine('<!-- devflow:time-data {not json -->'), null);
  assert.equal(parseDataLine('<!-- devflow:time-data {"v":9,"steps":[]} -->'), null);
});

test('steps are grouped by kind: stages by name, S<n> as build', () => {
  assert.deepEqual(
    ['brief', 'research', 'plan', 'S1', 'S12', 'qa', 'review', 'feedback', 'fix', 'polish'].map(stepKind),
    ['brief', 'research', 'plan', 'build', 'build', 'qa', 'review', 'rework', 'fix', 'other'],
  );
});

function issue(
  number: number,
  labels: string[],
  steps: Array<[string, number | null, number]>,
  day = 1,
  origin?: number[],
): IssueRecord {
  return {
    issue: number,
    labels,
    ...(origin ? { origin } : {}),
    steps: steps.map(([step, estimateMin, activeMin], i) => ({
      step,
      estimateMin,
      activeMin,
      finished: `2026-09-${String(day).padStart(2, '0')}T10:${String(i).padStart(2, '0')}:00Z`,
    })),
  };
}

test('forecast scales each estimate by its kind’s past actual/estimate ratios', () => {
  const history = [
    issue(
      1,
      [],
      [
        ['S1', 60, 60],
        ['S2', 60, 60],
        ['S3', 60, 60],
        ['S4', 60, 120],
        ['S5', 60, 120],
        ['S6', 60, 120],
      ],
    ),
  ];
  const result = forecast([{ step: 'S1', estimateMin: 60 }], history, { runs: 2_000, random: seededRandom(1) });
  assert.deepEqual(result.steps[0], {
    step: 'S1',
    kind: 'build',
    estimateMin: 60,
    basis: 'build',
    samples: 6,
    p50Min: 90,
    p80Min: 120,
  });
});

test('a kind with too little history falls back to all steps, and too little history at all gives no forecast', () => {
  const six = issue(
    1,
    [],
    [
      ['S1', 30, 45],
      ['S2', 30, 45],
      ['S3', 30, 45],
      ['S4', 30, 45],
      ['S5', 30, 45],
      ['research', 30, 45],
    ],
  );
  const pooled = forecast([{ step: 'research', estimateMin: 60 }], [six], { runs: 100, random: seededRandom(1) });
  assert.equal(pooled.steps[0]?.basis, 'all');
  assert.equal(pooled.steps[0]?.p50Min, 90);

  const few = issue(2, [], [['S1', 30, 45]]);
  const none = forecast([{ step: 'S1', estimateMin: 60 }], [few], { runs: 100, random: seededRandom(1) });
  assert.equal(none.steps[0]?.basis, 'none');
  assert.equal(none.steps[0]?.p50Min, null);
  assert.equal(none.total.p50Min, null);
  assert.equal(none.total.estimateMin, 60);
});

test('the total is simulated from sampled ratios, and only the latest 50 samples of a kind count', () => {
  const old = Array.from({ length: 10 }, (_, i): [string, number, number] => [`S${i + 1}`, 10, 100]);
  const recent = Array.from({ length: 50 }, (_, i): [string, number, number] => [`S${i + 1}`, 10, 15]);
  const history = [issue(1, [], old, 1), issue(2, [], recent, 20)];
  const result = forecast(
    [
      { step: 'S1', estimateMin: 60 },
      { step: 'S2', estimateMin: 30 },
    ],
    history,
    { runs: 500, random: seededRandom(7) },
  );
  assert.equal(result.steps[0]?.samples, 50);
  assert.equal(result.total.estimateMin, 90);
  assert.equal(result.total.p50Min, 135);
  assert.equal(result.total.p80Min, 135);
});

test('referenceClass summarises past issues carrying all the given labels', () => {
  const history = [
    issue(1, ['type:feature', 'track:full'], [['S1', 60, 60]]),
    issue(2, ['type:feature', 'track:full'], [['S1', 60, 120]]),
    issue(
      3,
      ['type:feature', 'track:full', 'stage:done'],
      [
        ['S1', 60, 100],
        ['S2', 60, 80],
      ],
    ),
    issue(4, ['type:feature', 'track:quick'], [['S1', 60, 999]]),
  ];
  assert.deepEqual(referenceClass(history, ['type:feature', 'track:full']), {
    count: 3,
    medianActiveMin: 120,
    q1ActiveMin: 90,
    q3ActiveMin: 150,
  });
  assert.equal(referenceClass(history, ['type:spike']), null);
});

test('unplanned QA, review fixes and bug fixes traced to an issue become an allowance on the total', () => {
  const planned: Array<[string, number, number]> = [
    ['S1', 60, 60],
    ['S2', 60, 60],
  ];
  const history = [
    issue(1, ['type:feature'], [...planned, ['feedback', null, 30]]),
    issue(2, ['type:feature'], planned),
    issue(3, ['type:feature'], [...planned, ['qa', null, 120]]),
    issue(10, ['bug'], [['fix', 30, 30]], 2, [1]),
  ];
  const result = forecast(
    [
      { step: 'S1', estimateMin: 60 },
      { step: 'S2', estimateMin: 60 },
    ],
    history,
    { runs: 3_000, random: seededRandom(3) },
  );
  assert.equal(result.total.p50Min, 120);
  assert.deepEqual(result.withAllowance, { issues: 3, medianRatio: 0.5, p50Min: 180, p80Min: 240 });
  assert.equal(
    forecast([{ step: 'S1', estimateMin: 60 }], [], { runs: 10, random: seededRandom(1) }).withAllowance,
    null,
  );
});

test('referenceClass counts bug-fix time against the issue it traces to', () => {
  const history = [
    issue(1, ['type:feature'], [['S1', 60, 60]]),
    issue(2, ['type:feature'], [['S1', 60, 60]]),
    issue(3, ['type:feature'], [['S1', 60, 60]]),
    issue(10, ['bug'], [['fix', 30, 60]], 2, [3]),
  ];
  assert.equal(referenceClass(history, ['type:feature'])?.q3ActiveMin, 90);
});
