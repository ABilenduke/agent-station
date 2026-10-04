---
name: feature-review
description: Use when checking delivered work against its GitHub issue's spec and plan before calling it done, when asked to review a feature implementation for acceptance coverage and completion claims, or when closing out an issue with its time and retro. Not for critiquing a plan, PR review comments (feedback), or general code review without a spec.
---

# Feature Review

Decide independently whether the delivered work meets the issue's spec, then close the issue out.
The journal's claims are evidence to check, not conclusions to inherit. Read
`references/feature-workflow.md` first; it is the contract for the issue, and the repository's
`AGENTS.md` wins over it.

## Stay independent

If you implemented this work in this session, dispatch a fresh read-only subagent to trace the
requirements (the steps below, with the issue number and diff range) and verify its findings
yourself before reporting them. A reviewer that wrote the code checks what it meant, not what it
did.

## Establish the boundary

1. Read what the work is held to, which depends on the track. On `standard` and `full`: the spec,
   plan and decisions sections; removed requirements stay removed, so use the plan's latest
   Revisions. On `quick`: the brief's Acceptance list and step S1. Then your `journal:*` comments
   and the `time` comment.
2. Review the PR's diff (`gh pr diff`) or the branch against its base, plus staged, unstaged and
   relevant untracked files, unless the user names another range. Read the resulting code and its
   callers, not only the diff: a missing implementation has no changed line.

## Trace every requirement

For each in-scope requirement (each `REQ`, or on the quick track each acceptance check), find the
implementation and the check that demonstrates its acceptance criterion. Read the assertions, not test names or green output; a test can encode the bug. Run
proportionate, non-mutating checks and record the commands and results. Separate introduced
failures, pre-existing failures and checks that could not run. Check journal statuses and skipped
steps against what exists. When there is a plan, check its quality requirements and rollback the
same way.

## Report

Lead with findings ordered by impact; each names the requirement, the triggering input, observed
against required behaviour, and `path:line`. Then a coverage table (REQ, verdict, evidence) and the
verification limits. Conclude with one verdict: **Changes needed**, **Verification incomplete** or
**No findings** (no actionable defect within the stated scope; not a guarantee). See
`references/report.md`.

Stay read-only: do not fix code, edit the plan or post anything unless the user asks. Timing is the
exception: `worklog start issue-N review` before and `worklog finish issue-N review` after, unless
the user asked for no writes at all. When the user asks to record the review, write it with
`worklog issue comment N review --file -`.

## Close out

Once the verdict is **No findings** and the user accepts the work, or after the PR merges:

1. Tick the Definition of Done only with evidence and name any item left open: the plan's, or on
   the quick track the contract's (Closing).
2. `worklog post issue-N`.
3. `worklog issue comment N retro --file -`:

   ```markdown
   ## Retro

   **Delivered:** … **Not delivered:** …

   **Time:** estimate <total> · active <total> · ratio <active/estimate> · appetite <appetite>
   (from the `time` comment)

   **Went well:** … **Went badly:** …

   | Lesson | Where it goes                                       |
   | ------ | --------------------------------------------------- |
   |        | `AGENTS.md`, a skill, a follow-up issue, or nowhere |
   ```

4. Propose each lesson's change to the user; make it, or open its issue, only when they agree.
5. Swap the stage label for `stage:done` and set the status section's next action to "Done". The
   issue closes when the PR carrying `Closes #N` merges; if it is still open after that, check the
   PR's `closingIssuesReferences` and close it by hand with the user's agreement.
