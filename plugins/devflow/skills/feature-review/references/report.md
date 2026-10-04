# Review report

Adapt to the host's required review format. Default to findings first, followed by a compact coverage
summary and the review conclusion. No report file is created unless requested.

## Finding quality

For a confirmed defect, provide:

- **Priority and title:** P1 for a serious failure requiring attention before release; P2 for a normal
  correctness defect; P3 for a minor actionable defect. Reserve P0 for an immediate, demonstrated
  critical failure. Severity follows impact and exposure, not merely a requirement's Must label.
- **Location:** Narrow file and line reference to the cause. Missing implementation can reference its
  intended interface or the unmet plan criterion rather than inventing a changed line.
- **Evidence:** Concrete input or conditions, actual versus required behavior, and affected requirement.
- **Impact and direction:** Why it matters and what behavior must change. Avoid prescribing a large
  redesign when a local correction is sufficient.

A finding must be actionable and grounded in current evidence. Label inference when reproduction was
not available. Do not claim a failure was introduced without comparison evidence; a pre-existing
defect can still be an unmet requirement if the plan explicitly promises to resolve it.

Keep verification gaps and open decisions separate from confirmed implementation defects. A missing
required check may be a release blocker without establishing a code bug. An old journal's stale path
or task is a record discrepancy; report its material effect without treating it as renewed product
scope. Recommend a journal correction when useful, but do not write it during read-only review.

## Coverage and conclusion

| Requirement                          | Assessment                                  | Evidence or gap                               |
| ------------------------------------ | ------------------------------------------- | --------------------------------------------- |
| Existing ID or stable step reference | Satisfied / Unmet / Unverified / Unresolved | File, check, observation, or missing decision |

Use compact bullets instead of a table for a small plan. Summarize each criterion once; link findings
to this coverage rather than repeating descriptions. Satisfied can be supported by direct inspection
when proportionate, but distinguish inspected from executed evidence. Split partially covered criteria
within a requirement so a passed subcase cannot conceal an unmet one.

Record the plan/revision and review boundary, checks actually run, failed or unavailable required
checks, and material exclusions. Classify the conclusion:

- **Changes needed:** Confirmed defects or unmet acceptance requirements. Also list verification gaps.
- **Verification incomplete:** No confirmed defect, but required evidence or consequential decisions
  remain unresolved. State the exact next check or decision.
- **No findings:** No actionable defects identified and no outstanding required verification within
  the reviewed scope. Include material limits; this is not blanket certification.

If the plan itself lacks an acceptance decision, identify it and the dependent coverage left unresolved.
Do not invent a requirement or approve an arbitrary implementation choice. If no plan is available,
request it; an ordinary code review can be offered as a separately scoped fallback.
