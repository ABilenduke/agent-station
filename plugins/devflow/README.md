# devflow

Development workflow plugin for Claude Code and Codex:

- **Skills:** `bugfix` (reproduce, find the cause, fix, verify) and `feedback` (work through PR review
  comments with an append-only record).
- **`worklog`:** a time ledger that measures how long each stage and step of feature work really took,
  and the hooks that feed it. The feature workflow skills (`feature-brief` … `feature-review`) and the
  document contract live in the repositories that use them (for Cylinder, the parent's
  `.agents/skills/` and `docs/features/README.md`, synced into each child).

- Time ledger contract: [contract/time-ledger.md](contract/time-ledger.md)

`worklog` never reads Claude Code or Codex transcripts. It writes its own ledger, `time.jsonl`, into
the feature folder, where it is committed with the other documents.

## Install

devflow ships in the agent-station marketplace; `station install` adds it to Claude Code and Codex and
links `~/.local/bin/worklog` (see the repository README). The same `hooks/hooks.json` runs in both
tools: Codex provides `CLAUDE_PLUGIN_ROOT` to plugin hooks, and each event is recorded under the
harness the session was bound with at `worklog start`/`join`.

## Develop

```bash
npm install
npm run check   # typecheck, tests, and a check that the committed dist/ matches src/
npm run build   # after changing src/: dist/ is committed because plugin installs do not build
```

## How time is measured

`worklog start <folder> <step> --estimate 1h30m` stamps the start and binds the current Claude Code
or Codex session; `worklog finish <folder> <step>` stamps the end and renders `time.md`. While a step
is open, the hooks append activity events (prompt, stop, tool, wait) carrying only a timestamp,
step, session and harness. Active time counts agent turns plus up to 5 minutes of each wait for a
person, with no single gap counting more than 30 minutes; see the ledger contract. Session bindings
live in `/tmp/worklog-<uid>/` because Codex's sandbox can write there; they are transient, and the
ledger is the record.
