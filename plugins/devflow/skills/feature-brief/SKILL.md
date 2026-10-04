---
name: feature-brief
description: Use when the user wants to start, scope or kick off a feature, enhancement, spike or product idea and keep its record on a GitHub issue, asks for a feature or research brief, or hands over an issue that has not been briefed yet. Not for bug fixes (bugfix), answering a question that is already briefed (feature-research), or writing the plan (feature-plan).
---

# Feature Brief

Open the work's GitHub issue and frame it: what it is for, how much process it needs, and what must
be learned before anyone plans it. The brief is short and grounded in the repository. Read
`references/feature-workflow.md` first; it is the contract for the issue, labels, tracks and time,
and the repository's `AGENTS.md` wins over it.

Even when the user asks to "research and plan it", the brief comes first. Research without a framed
outcome, scope and questions answers the wrong things, and later stages copy what this stage lays
down.

## 1. Ground yourself before asking

Read the repository guidance and the code closest to the idea, and search existing issues:
`gh issue list --state all --search "<topic>"`. Settle with evidence everything the repository can
answer.

## 2. Find or open the issue

| What exists                                         | Do                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------- |
| The user named an issue, or one covers exactly this | Adopt it: its text stays, the sections go below it                  |
| An issue covers this and more                       | Open a new issue for this piece and make it a sub-issue of that one |
| Nothing                                             | Open one                                                            |

Opening or adopting an issue publishes; ask first, and say so when the repository is public (one
question, with the rest of round one). Then:

1. `gh issue create --title "<outcome in a few words>" --body-file -`, with a short opening line
   and nothing else, or adopt the existing issue.
2. Write all six sections in contract order with `worklog issue section`: `status`, `brief`, then
   `spec`, `plan`, `decisions` and `links` holding `_Not written yet._`.
3. Labels: `type:feature` (or `type:spike` for a question without a feature) and `stage:brief`;
   the track label once it is picked. Create missing labels only when the user agrees.
4. `worklog start issue-N brief --estimate <estimate>`, after checking `.agent/` is ignored.

## 3. Interview

Ask what only the user can decide (contract: Asking the user): who it is for and what changes for
them, the scope boundary, what success looks like, and the **appetite**, the most active time the
work is worth. At most three questions per round, each with a recommendation. Unconfirmed
assumptions are recorded as assumptions, never as decisions.

## 4. Pick the track

Choose `quick`, `standard` or `full` from the contract's table and give the reason in one line.
Default to `full` when any research question needs a source outside the repository; to `quick` only
when there is nothing left to decide. Add its `track:` label.

When the user sets an appetite, check it against how long comparable work took:
`worklog history --labels type:<type>,track:<track>` gives the past issues' median and IQR when
there are enough of them. Mention it when the appetite sits below their lower quartile.

## 5. Write the brief section

```markdown
## Brief

**Idea:** <the request in the user's words>

**Problem and audience:** …

**Outcome:** <observable success; unmeasured benefits labelled hypotheses>

**Scope.** In: … Out: … Deferred: …

**Constraints:** <each cited: `AGENTS.md:12`, `path/to/file.ts:40`, a linked issue>

**Known in code:** `path/to/file.ts:10-24` — <what is there and why it matters>

**Track:** full — <one-line reason> · **Appetite:** 4h active (or "none set")

| ID   | Research question | Track | Why it matters to the plan |
| ---- | ----------------- | ----- | -------------------------- |
| RQ-1 |                   | code  |                            |

**Assumptions:** …
```

- Every statement about code cites a `path:line` you opened. What you could not verify becomes a
  research question, not a fact.
- Research questions: five to eight on the full track, each with one track (`code`, `technical`,
  `market` or `business`) and the plan decision its answer changes. The standard track keeps only
  `code` questions; the quick track has none and lists acceptance checks instead.
- One page. The investigation belongs to research, not here.

## 6. Close the stage

1. Status section: stage, track, next action, appetite.
2. `worklog finish issue-N brief`, then `worklog post issue-N`.
3. Swap `stage:brief` for the next stage's label: `stage:research` (full), `stage:plan`
   (standard) or `stage:execute` (quick).
4. Report the issue link, the track, open assumptions and the next skill: `feature-research`,
   `feature-plan` or `feature-execute`.

## Common mistakes

| Mistake                                              | Instead                                                     |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| Jumping to research or a plan because the user asked | Brief first; it is short                                    |
| Issue body written freehand, sections added later    | Six marked sections at once, in order                       |
| Research or plan text in the brief section           | Research is a comment; spec and plan are their own sections |
| Time started at research                             | `worklog start issue-N brief` before the interview          |
| Branch created now                                   | Branches come at execute, with `gh issue develop`           |
