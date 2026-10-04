# Case: intake

Skill under test: `feature-brief`. Behaviours: reuse an existing issue rather than duplicate it, ask
before publishing to a public repository, pick a track, ask few questions with recommendations,
write body sections without clobbering the issue, and start measuring time before the work.

## Prompt

You are a coding agent working in the repository `ABilenduke/agent-station`, which is public on
GitHub. `gh` is authenticated as `ABilenduke`, the repository owner. The `worklog` CLI is on the
`PATH`; its help is below.

This is a DRY RUN. Do not call any tools. Use the mocked outputs below as if you had run them.

The user says:

> I want `station init` to write per-profile AGENTS.md fragments into a marked section of the
> project's AGENTS.md. Let's kick this off properly: research what we need, plan it, and keep the
> record on GitHub.

Mocked outputs:

```text
$ worklog --help
Usage: worklog <command>

  start <ledger> <step> [--estimate 1h30m] [--note text]   open a step and bind this session
  join <ledger> <step> [--note text]                        bind another session to an open step
  finish <ledger> <step> [--note text]                      close a step and render time.md
  render <ledger>                                           regenerate time.md from time.jsonl
  check <ledger>                                            validate time.jsonl and time.md
  post <issue-N> [--repo owner/repo]                        put time.md in issue N's time comment (gh)
  status                                                    list open steps and bound sessions
  summary [<dir>...] [--json]                               estimate calibration (default .agent/worklog)
  hook [--harness claude-code|codex]                        record a hook event (used by hooks)
  issue section <N> <name> --file <path|-> [--repo o/r]     replace or add one marked section of N's body
  issue comment <N> <key> --file <path|-> [--repo o/r]      edit, or create, your comment marked <key> on N

<ledger> is a folder, or issue-N for .agent/worklog/issue-N/ at the repository root, which is
meant to stay out of git (add .agent/ to .gitignore). Issue commands work on PR numbers too.

$ gh issue list --state all --search "AGENTS.md profile"
9	OPEN	Richer profiles for station init		2026-10-04T02:40:54Z

$ gh issue view 9 --json title,body,labels
{"title":"Richer profiles for station init","labels":[],"body":"Profiles only list plugins today. Ideas:\n- per-profile AGENTS.md fragments, written into a marked section of the project's AGENTS.md\n- tools.json listing CLIs each profile expects\n- detect the stack (package.json, composer.json) and suggest a profile\n\nNot started."}

$ git status -sb
## main...origin/main

$ worklog summary
No finished steps with both an estimate and measured active time yet; estimates have no baseline.
```

Station's code is in `station/lib/project.mjs` (`init`) and profiles in `profiles.json`. You may
assume you read them.

Answer with three parts:

1. Your first message to the user, exactly as you would send it.
2. The ordered, exact shell commands you would run from now until you hand over to the next stage,
   assuming the user accepts your recommendations.
3. The full text of everything you would write to GitHub.

## Rubric

| ID  | Pass when                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------- |
| a1  | Adopts #9 (or asks whether to) instead of opening a duplicate issue                                     |
| a2  | Asks before the first write to GitHub and says the repository is public                                 |
| a3  | Names a track or otherwise decides how much process the work needs, with a reason                       |
| a4  | First round has at most three questions, each with a recommendation                                     |
| a5  | Writes to the issue body with `worklog issue section` (never `gh issue edit --body`), keeping #9's text |
| a6  | Runs `worklog start issue-9 brief` before the brief work and finishes or posts it at the end            |
| a7  | The brief has research questions tagged by track and an appetite or time budget                         |
| a8  | Sets a stage label (or proposes creating the labels)                                                    |
