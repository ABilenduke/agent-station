# Case: revise-research

Skills under test: `feature-research` and `feature-plan`. Behaviours: check the user's new claim
against a source, update the research comment in place with a dated correction, revise only the
plan's sections, keep requirement IDs stable, and keep the person's own edits.

## Prompt

You are a coding agent working in the repository `ABilenduke/agent-station`, which is public on
GitHub. `gh` is authenticated as `ABilenduke`, the repository owner. The `worklog` CLI is on the
`PATH` (`worklog --help` is below).

This is a DRY RUN. Do not call any tools. Use the mocked outputs below as if you had run them.

The user says:

> I just found out Codex reads AGENTS.override.md before AGENTS.md, so our RQ-3 answer is wrong.
> Update the research and the plan for #12.

Mocked outputs:

```text
$ worklog --help
  start <ledger> <step> [--estimate 1h30m] [--note text]   open a step and bind this session
  finish <ledger> <step> [--note text]                      close a step and render time.md
  post <issue-N> [--repo owner/repo]                        put time.md in issue N's time comment (gh)
  issue section <N> <name> --file <path|-> [--repo o/r]     replace or add one marked section of N's body
  issue comment <N> <key> --file <path|-> [--repo o/r]      edit, or create, your comment marked <key> on N

$ gh issue view 12 --json labels,body
{"labels":[{"name":"type:feature"},{"name":"stage:plan"}],
"body":"Andrew's note: keep this small, I want it before the 0.2 tag.\n\n<!-- devflow:section status -->\n## Status\n| plan | full | Approve the plan | — | — |\n<!-- /devflow:section status -->\n\n<!-- devflow:section brief -->\n## Brief\n... RQ-3 (technical): Which instruction files does Codex read, and in what order? ...\n<!-- /devflow:section brief -->\n\n<!-- devflow:section spec -->\n## Spec\n| REQ-001 | ... |\n| REQ-002 | init writes the fragment into AGENTS.md | Must | ... |\n| REQ-003 | idempotent | Must | ... |\n<!-- /devflow:section spec -->\n\n<!-- devflow:section plan -->\n## Plan\n### S1 ... ### S2 ... ### S3 ...\n## Revisions\n(none)\n<!-- /devflow:section plan -->\n\n<!-- devflow:section decisions -->\n## Decisions\n| D-1 | Write only to AGENTS.md | Confirmed | @ABilenduke 2026-10-02 |\n<!-- /devflow:section decisions -->\n\n<!-- devflow:section links -->\n## Links\n- Research: comment 611\n<!-- /devflow:section links -->\n"}

$ gh api 'repos/{owner}/{repo}/issues/12/comments' --paginate --slurp --jq '.[][] | {id, user: .user.login, body: .body[0:200]}'
{"id":611,"user":"ABilenduke","body":"<!-- devflow:comment research -->\n## Research: per-profile AGENTS.md fragments\n\n**Summary:** ... RQ-3: Codex reads only AGENTS.md from the repository root down to the working directory (F7, sourced: Codex docs, accessed 2026-10-02) ..."}
{"id":612,"user":"ABilenduke","body":"<!-- devflow:comment time -->\n# Time: issue-12 ..."}
```

Codex's documentation page on AGENTS.md, if you opened it, would say: "In each directory, Codex
checks for `AGENTS.override.md` first and uses it instead of `AGENTS.md` when present." (Treat this
as the content you would see after opening
`https://developers.openai.com/codex/guides/agents-md`, accessed today.)

Answer with three parts:

1. What you tell the user.
2. The ordered, exact shell commands you would run.
3. The full text of everything you would write to GitHub.

## Rubric

| ID  | Pass when                                                                                           |
| --- | --------------------------------------------------------------------------------------------------- |
| c1  | Opens the source to check the user's claim and cites it (URL, access date)                          |
| c2  | Updates comment 611 with `worklog issue comment 12 research` instead of posting a new comment       |
| c3  | Keeps a dated correction in the research (what changed, why), not a silent rewrite                  |
| c4  | Writes only the affected sections with `worklog issue section`; leaves "Andrew's note" untouched    |
| c5  | Keeps REQ IDs stable, adds a dated line to the plan's Revisions, and reopens D-1 or adds a decision |
| c6  | Asks the user about the product decision the correction raises (support the override file or not)   |
| c7  | Times the work (`worklog start/finish issue-12 research` or `plan`) and posts time                  |
