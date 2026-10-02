---
name: feedback
description: >-
  Handles a pull request review cycle: reads the PR's review comments, records them in an append-only
  feedback.md, applies each fix as its own commit, and replies on the PR with what changed. Use when
  the user says "feedback", "PR feedback", "address review comments", "handle the review", or has
  review comments on a GitHub pull request to work through.
---

# Feedback

Work through review comments on a GitHub pull request so that every comment ends up fixed, deferred
or declined, with a written record of which and why. Works in any repository with the `gh` CLI
authenticated; `gh` infers the repository from the current checkout.

## Find the PR and its context

1. Read the template: [templates/feedback-template.md](templates/feedback-template.md).
2. Identify the PR. Use the number the user gave; otherwise look for an open PR for the current
   branch:
   ```bash
   gh pr list --head "$(git branch --show-current)" --json number,title --jq '.[0]'
   ```
   If there is none, ask for the PR number.
3. Read the PR and every kind of review comment:
   ```bash
   repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
   gh pr view {number} --json title,body,reviews,comments,reviewDecision
   gh api "repos/$repo/pulls/{number}/comments" \
     --jq '.[] | {path: .path, line: .line, body: .body, user: .user.login}'
   gh api "repos/$repo/pulls/{number}/reviews" \
     --jq '.[] | {state: .state, body: .body, user: .user.login}'
   ```
4. Find the planning documents the PR came from, if any: paths in the PR description, a feature
   folder matching the branch (for example `docs/features/<date>-<slug>/`), or ask. Read them for
   what was intended. A PR without planning documents is fine.

## 1. Gather and categorise

Categorise each comment as **Logic** (bug, wrong behaviour, missed edge case), **Architecture**
(structure, pattern, abstraction), **Testing** (missing or weak tests), **Documentation** or
**Cosmetic** (naming, formatting, typos). Present the list and ask which items to defer or decline
before changing anything.

## 2. Record

Create `feedback.md` from the template next to the planning documents, or at
`docs/feedback/pr-{number}.md` when there are none. Record each item with its number, summary, type,
files, what was raised (quoted or closely paraphrased) and resolution `Pending`. Commit it:
`feedback: record review of #{number}`.

The record is append-only: add resolutions and corrections below the original text, never rewrite
what the reviewer raised.

## 3. Fix

Take items in order Logic, Architecture, Testing, Documentation, Cosmetic. For each:

1. Read the affected files and apply the fix.
2. Run the relevant tests; do not batch fixes and test once at the end.
3. Commit with `feedback: {short description}`.
4. Append the resolution and commit hash to the item in `feedback.md`.

Deferred items get `Deferred: {reason}` and declined ones `Declined: {rationale agreed with the user}`;
do not change code for them. Feedback that reveals a larger problem is a new piece of work, not a
bigger PR: defer it and say so.

## 4. Close the loop

1. Push the fix commits to the PR branch.
2. Reply on the PR so the reviewer sees what changed without reading every commit:

   ```bash
   gh pr comment {number} --body-file - <<'EOF'
   ## Feedback addressed

   | # | Type | Summary | Resolution |
   |---|------|---------|------------|
   | 1 | Logic | {summary} | Fixed in {hash} |
   | 2 | Architecture | {summary} | Deferred: {reason} |

   {N} items: {N} fixed, {N} deferred, {N} declined
   EOF
   ```

3. Add the summary section to `feedback.md` and commit: `feedback: finalise review of #{number}`.

Finish by telling the user how many items were fixed, deferred and declined, and listing deferred
items that could become follow-up issues.
