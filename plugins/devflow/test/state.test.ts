import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultStateDir } from '../src/state.js';

test('bindings live in /tmp so a sandboxed Codex shell can write them', () => {
  assert.equal(defaultStateDir({}, 1000), '/tmp/worklog-1000');
});

test('WORKLOG_STATE_DIR overrides the default', () => {
  assert.equal(defaultStateDir({ WORKLOG_STATE_DIR: '/srv/wl' }, 1000), '/srv/wl');
});
