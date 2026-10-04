import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultStateDir, loadBindings, saveBindings, type Binding } from '../src/state.js';

const binding: Binding = {
  session: 's1',
  dir: '/work/feature',
  step: 'S1',
  harness: 'claude-code',
  since: '2026-10-05T09:00:00.000-04:00',
};

test('bindings live in /tmp so a sandboxed Codex shell can write them', () => {
  assert.equal(defaultStateDir({}, 1000), '/tmp/worklog-1000');
});

test('WORKLOG_STATE_DIR overrides the default', () => {
  assert.equal(defaultStateDir({ WORKLOG_STATE_DIR: '/srv/wl' }, 1000), '/srv/wl');
});

test('the state directory and file are private to the user', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'worklog-state-')), 'state');
  saveBindings(dir, [binding]);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
  assert.equal(statSync(join(dir, 'active.json')).mode & 0o777, 0o600);
  assert.deepEqual(loadBindings(dir), [binding]);
});

test('an existing state directory with loose permissions is tightened', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'worklog-state-')), 'state');
  mkdirSync(dir, { mode: 0o755 });
  saveBindings(dir, [binding]);
  assert.equal(statSync(dir).mode & 0o777, 0o700);
});

test('a symlinked state directory is refused for writes and ignored for reads', () => {
  const base = mkdtempSync(join(tmpdir(), 'worklog-state-'));
  const target = join(base, 'elsewhere');
  mkdirSync(target);
  const link = join(base, 'link');
  symlinkSync(target, link);
  assert.throws(() => saveBindings(link, [binding]), /not a directory owned by you/);
  saveBindings(target, [binding]);
  assert.deepEqual(loadBindings(link), []);
});
