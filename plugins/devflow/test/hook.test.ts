import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyHook } from '../src/hook.js';

test('a prompt submission starts a turn', () => {
  assert.deepEqual(classifyHook({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'secret' }), {
    event: 'prompt',
    session: 's1',
  });
});

test('stop events end a turn', () => {
  assert.equal(classifyHook({ hook_event_name: 'Stop', session_id: 's1' })?.event, 'stop');
  assert.equal(classifyHook({ hook_event_name: 'StopFailure', session_id: 's1' })?.event, 'stop');
  assert.equal(classifyHook({ hook_event_name: 'SessionEnd', session_id: 's1' })?.event, 'stop');
});

test('ordinary tool use is activity', () => {
  assert.equal(classifyHook({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Bash' })?.event, 'tool');
  assert.equal(classifyHook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Read' })?.event, 'tool');
  assert.equal(classifyHook({ hook_event_name: 'SubagentStop', session_id: 's1' })?.event, 'subagent');
});

test('questions, plan approval, notifications and permission requests mean waiting on a person', () => {
  for (const tool of ['AskUserQuestion', 'ExitPlanMode', 'request_user_input']) {
    assert.equal(classifyHook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: tool })?.event, 'wait');
  }
  assert.equal(classifyHook({ hook_event_name: 'Notification', session_id: 's1' })?.event, 'wait');
  assert.equal(classifyHook({ hook_event_name: 'PermissionRequest', session_id: 's1' })?.event, 'wait');
});

test('a Codex payload is read the same way', () => {
  assert.deepEqual(
    classifyHook({ hook_event_name: 'PostToolUse', session_id: 'thread-9', turn_id: 't1', tool_name: 'exec_command' }),
    { event: 'tool', session: 'thread-9' },
  );
});

test('payloads it does not understand are ignored', () => {
  assert.equal(classifyHook({ hook_event_name: 'SessionStart', session_id: 's1' }), null);
  assert.equal(classifyHook({ hook_event_name: 'PostToolUse' }), null);
  assert.equal(classifyHook('not an object'), null);
  assert.equal(classifyHook(null), null);
});
