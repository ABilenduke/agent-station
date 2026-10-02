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
