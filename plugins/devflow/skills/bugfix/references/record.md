# Bug record and worked example

For a durable record, follow an explicit destination or repository convention. If the user asks for a
record without specifying either, keep it in a GitHub issue, not in a file in the repository: reuse the
issue for the same defect (`gh issue list --state all --search "<topic>"`, so a closed record for a recurring defect is found), otherwise create one with
`gh issue create` after the user agrees, since that publishes the text. Without `gh` access or a
GitHub remote, keep the record in chat. No record is required for every fix.

Keep these fields concise:

- **Status and scope:** Fixed and verified, Verification incomplete, or Blocked; affected behavior.
- **Reproduction:** Trigger, expected/actual result, relevant environment and starting code state.
- **Cause:** Observed causal path, evidence, and any remaining hypothesis.
- **Correction:** Files and behavior changed, relevant compatibility constraints.
- **Verification:** Actual checks and results, baseline failures, limitations, and next action.

When the record is a GitHub issue B, find or open it before fixing so the work can be timed. With
`worklog` on the `PATH`, time it as step `fix`: `worklog start issue-B fix` before the work,
`worklog finish issue-B fix` and `worklog post issue-B` after. When the cause traces back to the
change made for another issue N (the commit or PR that introduced it, found with `git log` or
`git blame`), write "Caused by #N in `<commit>`" under Cause and post with
`worklog post issue-B --origin N`. The fix's time then counts against that work when later estimates
are forecast. An origin is evidence, not blame; record it only when the causal path shows it.

On resumption, read the existing record where it lives (the issue and its comments, the file, or the
chat), then reconcile its report with the current code, working tree/index, and tests before acting.
Replace stale current-state claims in place (for an issue, edit its body) and retain consequential
history with brief dated corrections (for an issue, as a comment). Never treat a previous Fixed status
as proof that the current checkout still satisfies the regression.

## Example: zero retries becomes the default

Illustrative only; obtain actual evidence for each real defect.

The contract permits `retries=0` to disable retries; only an absent key should use the default of 3.
The implementation uses `settings.get("retries") or 3`, so a supplied zero becomes 3.

**Reproduction:** A focused test asserts `retry_count({"retries": 0}) == 0`. It fails with actual 3;
the missing-key test already passes. This demonstrates the reported failure, not a setup error.

**Cause:** Truthiness fallback treats an explicit zero as if no setting were supplied.

**Correction:** Use key absence to choose the default, preserving explicit zero. Inspect the existing
contract for other values; do not silently redefine how `None`, negative values, or strings behave.

**Verification:** Rerun the regression, missing-key behavior, and required repository checks. Report
Fixed and verified only when the required checks pass. If an unrelated baseline test still fails,
report the correction and passing targeted coverage with Verification incomplete for required checks.

The final record can stay in chat for this small fix. No branch, commit, ticket, or PR is implied.
