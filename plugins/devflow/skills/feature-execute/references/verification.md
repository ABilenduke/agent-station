# Verification, failures, and resumption

## What proves completion

For each requirement, identify the observable outcome and the check that actually demonstrates it.
Inspect assertions and relevant code; test names and green output alone are insufficient. Verify
material API, schema, data-flow, compatibility, and failure behavior when the plan changes them.
Use existing test infrastructure. Add meaningful cases for changed behavior and risk; do not impose
fixed test counts or new tests for low-impact edits that inspection can verify.

Use two levels, scaled to the change:

1. During an increment, run the checks that exercise it and its dependencies.
2. Before handoff, inspect the full task diff and new files, reconcile acceptance coverage, and run
   required repository checks and relevant integration or end-to-end checks. Validate release and
   recovery measures if part of the requested scope.

If a relevant check already ran after the last affecting change, its result can be reused. Repeating
an unchanged successful suite provides little evidence; changes to dependencies, configuration, or
integration assumptions can justify a broader run. Record the actual environment and material limits.

## Failure decisions

| Evidence                                          | Response                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| New failure caused by this work                   | Diagnose the cause, fix it, rerun affected checks.                                                               |
| Same failure, new useful evidence                 | Continue with the evidence-driven hypothesis.                                                                    |
| Repetition without new evidence                   | Change the diagnostic approach; if no viable authorized path remains, record the precise blocker.                |
| Missing prerequisite or unresolved product choice | Keep it and dependent work incomplete; continue independent authorized work.                                     |
| Pre-existing failure outside scope                | Preserve it, record baseline evidence, verify changed behavior separately, report the required check as failing. |
| Required tool or environment unavailable          | Record the attempted check and limitation; do available verification without claiming equivalence.               |

Do not substitute a stub for a required verifier, skip a failing assertion, or relax acceptance to
obtain green output. An optional check's absence is a reported limitation; an unmet required check
prevents Complete. If verification needs unavailable credentials or an external environment, prepare
the concrete remaining check and identify what is needed. Do not invent access or successful output.

For migrations, inspect the target and derive a disposable database or environment from repository
guidance. Examples are not authorization to reset live data. Verify compatibility and recovery where
required, without deploying or changing external systems beyond existing user authorization.

## Resume with current evidence

Read the latest plan and journal, then inspect current files, relevant repository instructions,
working tree/index, and recorded check context. Resolve discrepancies before trusting completed ticks:

- A moved module needs verification at its current location; do not recreate the old path blindly.
- A changed requirement needs matching implementation and acceptance evidence. Preserve requirement
  identity; update affected pending steps and record the authorized change.
- Removed scope stays removed. Retain a brief history without leaving it as active work.
- Existing code may already satisfy a step. Confirm it and continue without duplicating implementation.
- Old successful checks prove the old state until relevant changes have been reconciled.
- Journal status and Git history do not replace code inspection. Commits may be absent by design.

Keep unrelated changes and staged contents intact. Resume the earliest unmet dependency, not simply
the next unchecked line. Update the current journal summary and next action once reconciled.
