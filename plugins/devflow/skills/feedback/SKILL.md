---
name: feedback
description: >-
  Handles a pull request review cycle: reads the PR's review comments, applies each fix as its own
  commit, and records what changed on the PR itself, without adding files to the repository. Use when
  the user says "feedback", "PR feedback", "address review comments", "handle the review", or has
  review comments on a GitHub pull request to work through.
---

# Feedback

Work through review comments on a GitHub pull request so that every comment ends up fixed, deferred
or declined, with a record of which and why kept on the pull request, not in the repository. Works in
any repository with the `gh` CLI authenticated; `gh` infers the repository from the current checkout.

## Find the PR and its context

1. Identify the PR. Use the number the user gave; otherwise look for an open PR for the current
   branch:
   ```bash
   gh pr list --head "$(git branch --show-current)" --json number,title --jq '.[0]'
   ```
   If there is none, ask for the PR number.
2. Read the PR and every kind of review comment:
   ```bash
   repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
   gh pr view {number} --json title,body,reviews,comments,reviewDecision
   gh api "repos/$repo/pulls/{number}/comments" \
     --jq '.[] | {id: .id, in_reply_to_id: .in_reply_to_id, path: .path, line: .line, body: .body, user: .user.login}'
   gh api "repos/$repo/pulls/{number}/reviews" \
     --jq '.[] | {state: .state, body: .body, user: .user.login}'
   ```
3. Find the issue the PR came from, if any. GitHub's closing references come first, then a
   `Part of #N` or `Related to #N` in the PR description. Read it for what was intended:
   ```bash
   gh pr view {number} --json closingIssuesReferences --jq '.closingIssuesReferences[].number'
   gh issue view {issue} --comments
   ```
   A PR without an issue is fine.
4. When the PR has an issue and `worklog` is on the `PATH`, time the review cycle on it as unplanned
   rework: `worklog start issue-{issue} feedback` now (no estimate), and
   `worklog finish issue-{issue} feedback` and `worklog post issue-{issue}` once the loop is closed.

## 1. Gather and categorise

Categorise each comment as **Logic** (bug, wrong behaviour, missed edge case), **Architecture**
(structure, pattern, abstraction), **Testing** (missing or weak tests), **Documentation** or
**Cosmetic** (naming, formatting, typos). Present the list and ask which items to defer or decline
before changing anything.

## 2. Track

Keep the numbered list in the session's task list, with each item's summary, type, files and what was
raised (quoted or closely paraphrased), starting as pending. For an inline comment also keep its thread
root: `in_reply_to_id` when it is set, otherwise its own `id`. Do not write it to a file in the
repository. The record is the reply posted on the PR in step 4. Never reword what the reviewer raised
when you quote it there.

## 3. Fix

Take items in order Logic, Architecture, Testing, Documentation, Cosmetic. For each:

1. Read the affected files and apply the fix.
2. Run the relevant tests; do not batch fixes and test once at the end.
3. Commit with `feedback: {short description}`.
4. Note the resolution and commit hash against the item.

Deferred items get `Deferred: {reason}` and declined ones `Declined: {rationale agreed with the user}`;
do not change code for them. Feedback that reveals a larger problem is a new piece of work, not a
bigger PR: defer it and say so.

## 4. Close the loop

1. Push the fix commits to the PR branch.
2. Reply on the PR so the reviewer sees what changed without reading every commit. Keep one
   summary for the whole PR: with `worklog` on the `PATH`, read the previous round's summary
   (`worklog issue comment {number} feedback`), keep its rows, add this round's under a new
   numbered heading, and write it back, which edits the same comment. Without `worklog`, post it
   with `gh pr comment {number} --body-file -`.

   ```bash
   worklog issue comment {number} feedback --file - <<'EOF'
   ## Feedback addressed

   | # | Type | Summary | Resolution |
   |---|------|---------|------------|
   | 1 | Logic | {summary} | Fixed in {hash} |
   | 2 | Architecture | {summary} | Deferred: {reason} |
   | 3 | Cosmetic | {summary} | Declined: {rationale agreed with the user} |

   {N} items: {N} fixed, {N} deferred, {N} declined
   EOF
   ```

3. For each inline review comment, reply in its thread with the resolution so the reviewer can resolve
   it where they raised it. Use the thread root's ID, since a reply cannot be the parent of another:
   ```bash
   gh api "repos/$repo/pulls/{number}/comments/{root_comment_id}/replies" -f body="Fixed in {hash}"
   ```

Finish by telling the user how many items were fixed, deferred and declined. Offer to open each
deferred item as an issue (`gh issue create`) and do it only when they agree.
