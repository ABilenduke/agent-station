# devflow

Development workflow plugin for Claude Code and Codex. A piece of work lives on its GitHub issue,
from idea to merged code: the issue body is its current state, its comments are its history, and
nothing about the process is committed.

| Skill              | Stage    | Writes on the issue                                                  |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `feature-brief`    | brief    | Opens or adopts the issue, picks the track, writes the brief         |
| `feature-research` | research | The `research` comment: answers with cited evidence, go/no-go        |
| `feature-plan`     | plan     | The spec (requirements with EARS acceptance) and the plan            |
| `feature-execute`  | execute  | One `journal:S<n>` comment per step, on the issue's linked branch    |
| `feature-review`   | review   | The review on request, then the close-out `retro`                    |
| `bugfix`           | —        | Reproduce, find the cause, fix, verify; a bug issue when one is kept |
| `feedback`         | —        | Works through PR review comments; one summary comment on the PR      |

Tracks keep small work light: `quick` skips research and the plan, `standard` skips research, and
`full` runs every stage. The contract the feature skills share is
[contract/feature-workflow.md](contract/feature-workflow.md); each skill carries a copy
(`npm run sync:contract`, checked by the tests). `station init` with devflow adds issue forms, a PR
template and `.agent/` in `.gitignore` to a project, from [scaffold/](scaffold).

## worklog

`worklog` measures how long each stage and step really took, keeps that on the issue, and turns it
into forecasts. It never reads Claude Code or Codex transcripts; the time ledger contract is
[contract/time-ledger.md](contract/time-ledger.md).

- **Time:** `worklog start issue-N <step>` and `worklog finish issue-N <step>` write the ledger,
  `.agent/worklog/issue-N/time.jsonl`, which stays out of git. `worklog post issue-N` keeps the
  rendered table in one `time` comment on the issue, with a hidden data line for history. It refuses
  to replace a comment that reports steps the local ledger lacks. `--origin 12` marks a bug fix's
  time as caused by #12.
- **Issue records:** `worklog issue section <N> <name>` and `worklog issue comment <N> <key>` print,
  or with `--file` write, one part of an issue without touching the rest. A section is the text
  between `<!-- devflow:section NAME -->` markers in the body; a comment is the one your account
  posted that opens with `<!-- devflow:comment KEY -->`. Comments by anyone else never match. Both
  go through `gh api` and work on pull requests.
- **Estimates:** `worklog history` reads every issue's `time` comment (cached for closed issues in
  `.agent/worklog/history.json`) and reports actual/estimate by kind of step, plus the unplanned QA,
  review-fix and bug-fix time on top of plans. `worklog forecast S1=1h30m S2=45m` (with
  `--labels type:feature,track:full`) gives each step's P50 and P80, a Monte Carlo total with and
  without that allowance, and how long comparable past issues took.

## Install

devflow ships in the agent-station marketplace; `station install` adds it to Claude Code and Codex and
links `~/.local/bin/worklog` (see the repository README). The same `hooks/hooks.json` runs in both
tools: Codex provides `CLAUDE_PLUGIN_ROOT` to plugin hooks, and each event is recorded under the
harness the session was bound with at `worklog start`/`join`.

## Develop

The TypeScript toolchain is installed at the repository root (`npm ci` there), so this folder has
nothing to install when a tool copies the plugin.

```bash
npm run check   # typecheck, tests, and a check that the committed dist/ matches src/
npm run build   # after changing src/: dist/ is committed because plugin installs do not build
```

## How time is measured

`worklog start <ledger> <step> --estimate 1h30m` stamps the start and binds the current Claude Code
or Codex session; `worklog finish <ledger> <step>` stamps the end and renders `time.md`. While a step
is open, the hooks append activity events (prompt, stop, tool, wait) carrying only a timestamp,
step, session and harness. Active time counts agent turns plus up to 5 minutes of each wait for a
person, with no single gap counting more than 30 minutes; see the ledger contract. Session bindings
live in `/tmp/worklog-<uid>/` because Codex's sandbox can write there; they are transient, and the
ledger is the record.
