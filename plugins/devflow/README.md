# devflow

`worklog`, a time ledger that measures how long each stage and step of feature work really took,
and the Claude Code and Codex hooks that feed it. It is machine-level tooling: the feature workflow
skills (`feature-brief` … `feature-review`) and the document contract live in the repositories that
use them (for Cylinder, the parent's `.agents/skills/` and `docs/features/README.md`, synced into
each child).

- Time ledger contract: [contract/time-ledger.md](contract/time-ledger.md)

`worklog` never reads Claude Code or Codex transcripts. It writes its own ledger, `time.jsonl`, into
the feature folder, where it is committed with the other documents.

## Build and link the CLI

```bash
npm install
npm run check   # typecheck, tests, build
npm run link    # ~/.local/bin/worklog
```

## Install in Claude Code

```bash
ln -s "$(pwd -P)" ~/.claude/skills/devflow
claude plugin details devflow@skills-dir   # the 9 worklog hooks
```

Hooks load from the next session.

## Install in Codex

Add one entry like this to each of `UserPromptSubmit`, `Stop`, `PreToolUse`, `PostToolUse`,
`SubagentStop` and `SessionEnd` under `"hooks"` in `~/.codex/hooks.json`, keeping existing entries,
then trust the new hooks when Codex asks:

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "d=\"${WORKLOG_STATE_DIR:-/tmp/worklog-$(id -u)}\"; if [ -s \"$d/active.json\" ]; then node /home/abilenduke/code/abilenduke/copilot-developer/plugins/devflow/dist/cli.js hook --harness codex; else cat >/dev/null; fi; exit 0",
      "timeout": 5
    }
  ]
}
```

## How time is measured

`worklog start <folder> <step> --estimate 1h30m` stamps the start and binds the current Claude Code
or Codex session; `worklog finish <folder> <step>` stamps the end and renders `time.md`. While a step
is open, the hooks append activity events (prompt, stop, tool, wait) carrying only a timestamp,
step, session and harness. Active time counts agent turns plus up to 5 minutes of each wait for a
person, with no single gap counting more than 30 minutes; see the ledger contract. Session bindings
live in `/tmp/worklog-<uid>/` because Codex's sandbox can write there; they are transient, and the
ledger is the record.
