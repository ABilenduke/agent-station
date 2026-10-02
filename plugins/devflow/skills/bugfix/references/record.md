# Bug record and worked example

For a durable record, follow an explicit destination or repository convention. If the user asks for a
record without specifying either, use `docs/bugs/YYYY-MM-DD-<topic>.md`. Inspect the destination first;
reuse the record for the same defect and preserve unrelated files. No record is required for every fix.

Keep these fields concise:

- **Status and scope:** Fixed and verified, Verification incomplete, or Blocked; affected behavior.
- **Reproduction:** Trigger, expected/actual result, relevant environment and starting code state.
- **Cause:** Observed causal path, evidence, and any remaining hypothesis.
- **Correction:** Files and behavior changed, relevant compatibility constraints.
- **Verification:** Actual checks and results, baseline failures, limitations, and next action.

On resumption, reconcile the report, current code, working tree/index, and tests before acting. Replace
stale current-state claims and retain consequential history with brief dated corrections. Never treat
a previous Fixed status as proof that the current checkout still satisfies the regression.

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
