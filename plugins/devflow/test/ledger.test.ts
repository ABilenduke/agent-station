import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLedger } from '../src/ledger.js';

const good =
  '{"v":1,"ts":"2026-10-05T09:00:00-04:00","event":"step-start","step":"S1","session":null,"harness":"shell"}';

test('valid lines are kept in order and blank lines skipped', () => {
  const { events, problems } = parseLedger(`${good}\n\n${good.replace('step-start', 'step-finish')}\n`);
  assert.deepEqual(
    events.map((e) => e.event),
    ['step-start', 'step-finish'],
  );
  assert.deepEqual(problems, []);
});

test('timestamps must be full ISO 8601 with an offset or Z', () => {
  const withTs = (ts: string): string => good.replace('2026-10-05T09:00:00-04:00', ts);
  for (const ts of ['2026-10-05', '2026-10-05T09:00:00', 'Oct 5, 2026 9:00 AM', '2026-10-05 09:00:00-04:00']) {
    assert.deepEqual(parseLedger(withTs(ts)).problems, [{ line: 1, message: 'bad ts' }], ts);
  }
  for (const ts of ['2026-10-05T09:00:00Z', '2026-10-05T09:00:00.123+05:30']) {
    assert.deepEqual(parseLedger(withTs(ts)).problems, [], ts);
  }
});

test('bad lines are reported by line number with the reason', () => {
  const lines = [
    good,
    'not json',
    good.replace('"step-start"', '"lunch"'),
    good.replace('"S1"', '"S1|S2"'),
    good.replace('"shell"', '"vim"'),
    good.replace('2026-10-05T09:00:00-04:00', 'yesterday'),
  ];
  const { events, problems } = parseLedger(lines.join('\n'));
  assert.equal(events.length, 1);
  assert.deepEqual(problems, [
    { line: 2, message: 'not valid JSON' },
    { line: 3, message: 'unknown event lunch' },
    { line: 4, message: 'bad step' },
    { line: 5, message: 'bad harness' },
    { line: 6, message: 'bad ts' },
  ]);
});
