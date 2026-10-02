# Investigation when the cause is uncertain

## Select the next useful observation

Trace the reported input through the relevant boundary and failing operation. Identify the first
point where actual state diverges from the intended contract. For each plausible cause, ask what
observation would distinguish it from another cause; run that check before editing implementation.
Keep the working hypothesis and disconfirming evidence explicit. Avoid broad refactors as experiments.

For intermittent failures, compare failing and successful runs: ordering, concurrency, environment,
input shape, dependency version, and external response. Use deterministic controls where available.
Repeated passing runs do not establish that an intermittent defect is fixed. Record the conditions
actually exercised and what remains uncertain.

If a reported failure cannot be reproduced, inspect existing regression coverage and relevant changes.
Evidence may show the issue is already fixed or depends on an unavailable environment. Report that
finding without inventing a correction. A plausible defensive patch is not proof of the reported cause;
if made within authorized scope, clearly identify it as a candidate correction pending verification.

## Verification and blockers

- A failing test must exercise the intended path; import failures and unavailable fixtures are setup
  problems until shown otherwise.
- Prefer a regression test before the fix. If verification is added later, demonstrate sensitivity to
  the defect using a safe isolated copy of the faulty implementation when useful. Never reset or stash
  unrelated user changes just to obtain a red result.
- Inspect repository check commands for auto-fixes, generated files, network calls, and database writes.
  Use an appropriate disposable environment for destructive or stateful verification. Do not inherit
  destructive commands from examples.
- When checks fail, identify whether the cause is introduced, pre-existing, or environmental. Fix
  introduced failures while making progress. Keep required unavailable or failing checks incomplete.
- Preserve a concrete blocker: missing input, unresolved expected behavior, unavailable dependency,
  or check that cannot run. State the next diagnostic action, not a generic request for more context.
- Do not expand a localized repair into architecture work without resolving consequential scope choices.
  A broad cause may justify a separately planned correction, independent of how many files it affects.
