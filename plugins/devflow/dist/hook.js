/** Tools that hand control to a person: Claude Code questions and plan approval, Codex user input. */
const WAIT_TOOLS = new Set(['AskUserQuestion', 'ExitPlanMode', 'request_user_input']);
function eventFor(name, tool) {
    switch (name) {
        case 'UserPromptSubmit':
            return 'prompt';
        case 'Stop':
        case 'StopFailure':
        case 'SessionEnd':
            return 'stop';
        case 'SubagentStop':
            return 'subagent';
        case 'Notification':
        case 'PermissionRequest':
            return 'wait';
        case 'PreToolUse':
            return typeof tool === 'string' && WAIT_TOOLS.has(tool) ? 'wait' : 'tool';
        case 'PostToolUse':
            return 'tool';
        default:
            return null;
    }
}
/**
 * Maps a Claude Code or Codex hook payload (same shape in both) to an activity event. Only the event
 * kind and session id are read; prompts and tool inputs are never kept.
 */
export function classifyHook(payload) {
    if (typeof payload !== 'object' || payload === null)
        return null;
    const p = payload;
    const session = p['session_id'] ?? p['thread_id'];
    if (typeof session !== 'string' || session === '' || typeof p['hook_event_name'] !== 'string')
        return null;
    const event = eventFor(p['hook_event_name'], p['tool_name']);
    return event ? { event, session } : null;
}
