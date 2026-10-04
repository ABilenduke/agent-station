# Time ledger contract (`time.jsonl`)

Version 1, 2026-10-01. A ledger is a folder holding `time.jsonl` and the rendered `time.md`; by
convention `.agent/worklog/issue-N/` at the repository root, kept out of git, with `time.md` kept
in the issue's `time` comment by `worklog post`. `worklog` is the only writer. Every line is one JSON object; lines are only
ever appended. Nothing here comes from Claude Code or Codex transcripts.

## Fields

| Field         | Type              | On               | Meaning                                             |
| ------------- | ----------------- | ---------------- | --------------------------------------------------- |
| `v`           | `1`               | all              | Contract version.                                   |
| `ts`          | ISO 8601 + offset | all              | When it happened, local offset as recorded.         |
| `event`       | string            | all              | See below.                                          |
| `step`        | string            | all              | Step label, e.g. `brief`, `S3`. No `\|` or newline. |
| `session`     | string or `null`  | all              | Agent session id; `null` for a plain terminal.      |
| `harness`     | string            | all              | `claude-code`, `codex` or `shell`.                  |
| `estimateMin` | integer           | `step-start`     | Estimate in minutes, frozen at the first start.     |
| `note`        | string            | `step-*`, `join` | Optional free text.                                 |
| `source`      | string            | any              | Only on hand-seeded lines: `date` or `transcript`.  |

## Events

| Event         | Written by                                                                   | Meaning                                                |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| `step-start`  | `worklog start`                                                              | Opens a window for the step and binds the session.     |
| `join`        | `worklog join`                                                               | Another session or harness starts working on the step. |
| `step-finish` | `worklog finish`                                                             | Closes the step's open window.                         |
| `prompt`      | hook: UserPromptSubmit                                                       | A turn starts.                                         |
| `stop`        | hook: Stop, StopFailure, SessionEnd                                          | A turn ends; the agent waits for a person.             |
| `tool`        | hook: PostToolUse, PreToolUse                                                | The agent is working.                                  |
| `subagent`    | hook: SubagentStop                                                           | A subagent finished; the agent is working.             |
| `wait`        | hook: PreToolUse (questions, plan approval), Notification, PermissionRequest | The agent is waiting for a person.                     |

Activity events carry no prompt text, tool input, file paths or code.

## Counting active time

- Per session, events in the step's window are sorted by time. The session is in a turn from
  `step-start`, `join` or `prompt` until `stop`, and waiting after `wait` until its next event.
- A gap inside a turn counts up to 30 minutes. A gap after `stop` or `wait` counts up to 5 minutes.
- Counted spans are unioned across sessions and clipped to the window, so parallel sessions and
  subagents are never counted twice. A step's total is the union of its windows; the feature total
  is the union over all steps.
- A window with no activity events has no active time (`—` in `time.md`); it is never guessed.
