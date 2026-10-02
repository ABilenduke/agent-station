import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinutes, parseEstimate } from '../src/duration.js';

test('parseEstimate accepts hours, minutes and combined forms', () => {
  assert.equal(parseEstimate('1.5h'), 90);
  assert.equal(parseEstimate('90m'), 90);
  assert.equal(parseEstimate('1h30m'), 90);
  assert.equal(parseEstimate('2h'), 120);
  assert.equal(parseEstimate('0.25h'), 15);
});

test('parseEstimate rejects text it cannot read', () => {
  assert.throws(() => parseEstimate('soon'), /estimate/);
  assert.throws(() => parseEstimate(''), /estimate/);
  assert.throws(() => parseEstimate('-1h'), /estimate/);
});

test('formatMinutes rounds to whole minutes and drops empty parts', () => {
  assert.equal(formatMinutes(0), '0m');
  assert.equal(formatMinutes(45), '45m');
  assert.equal(formatMinutes(90), '1h 30m');
  assert.equal(formatMinutes(120), '2h');
  assert.equal(formatMinutes(59.6), '1h');
});
