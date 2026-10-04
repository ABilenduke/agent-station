---
name: bugfix
description: 'Investigate and fix reported defects or regressions through reproduction, causal diagnosis, and proportionate verification, keeping diagnosis-only requests read-only and leaving feature work or existing-plan execution to their own workflows.'
---

# Bugfix

Restore the intended behavior with an evidence-backed correction and meaningful verification. Work in
any repository without requiring a feature catalog, companion skill, connector, model, or ticket.

## Establish intended behavior and scope

Read the report, prior decisions, applicable repository instructions, relevant code and tests, and
working tree/index before editing. Discover commands and environment from the repository. Use the
current checkout or existing worktree, preserving unrelated staged, unstaged, and untracked work.
A dirty tree alone is not a blocker; resolve specific overlap or isolate work deliberately if needed.

Identify the trigger, expected versus observed behavior, affected interface, and constraints. Inspect
existing contracts and callers before asking questions. Ask only for missing information that changes
the diagnosis, intended behavior, compatibility, or authorization. Do not ask the user to repeat facts
already available. If competing product behaviors are equally plausible, investigate first and ask
for that decision before changing behavior. An absent feature is not automatically a bug.

A request to fix authorizes relevant local implementation and verification. A request only to diagnose
authorizes investigation. In native Plan Mode, remain read-only and provide diagnosis and a proposed
fix in the host's required format; do not edit source, reports, tests, or Git state. Preserve previous
authorization and explicit review checkpoints without adding routine approval rounds.

## Reproduce and establish the cause

Run the smallest useful reproduction in an appropriate local or disposable environment. Prefer a
focused regression test that fails for the reported reason before editing implementation. Inspect
assertions and failure output: a setup or import error does not demonstrate the defect. Record relevant
baseline failures so later verification can distinguish introduced failures from existing ones.

If reproduction is unavailable or intermittent, trace the failing path using available logs, state,
versions, and callers. Separate confirmed facts from hypotheses. Use targeted observations or controlled
experiments to distinguish plausible causes. Do not log secrets or operate on live data just to reproduce
a failure. Read [investigation guidance](references/investigation.md) for intermittent or blocked cases.

Explain how the observed cause produces the symptom. Five Whys is optional; do not invent deeper
organizational causes or require a fixed number of why questions. Do not patch each symptom or combine
unrelated speculative fixes. Repeated attempts without new evidence call for a different diagnostic
approach or a precise blocker, not a fixed retry count followed by a success claim.

## Correct the behavior and verify it

Implement the smallest coherent correction that addresses the supported cause and preserves relevant
contracts. Follow repository conventions. Add or update regression coverage that exercises the reported
trigger and asserts the intended outcome, including relevant boundary, failure, or permission behavior.
Do not weaken assertions or silently change the expected contract to fit the implementation.

Scale verification to the risk. For code defects, demonstrate that meaningful regression coverage fails
on the faulty behavior and passes with the correction where feasible. If the fix is already present,
verify it instead of creating unnecessary edits. For documentation, configuration, or unavailable test
infrastructure, use an appropriate inspection or repeatable check and state its limits; do not invent
a test suite or fabricate a red/green result. Avoid reverting user changes to obtain baseline evidence.

Run affected checks after the correction and required repository checks before declaring completion.
Broaden testing when changed dependencies or evidence warrant it. Inspect the complete task diff,
including new files, for scope and compatibility. Reuse current results when no relevant changes have
occurred. Distinguish a verified fix from a candidate correction with missing verification. Pre-existing
failures outside scope remain visible and are not silently fixed, skipped, or described as passing.

If investigation reveals an architectural or product decision, explain the concrete choices and impact.
Continue independent authorized work; keep dependent work blocked. Recommend planning when useful,
without requiring another skill or imposing file-count or time-estimate thresholds.

## Report and hand off

Return a concise record: symptom and trigger, confirmed cause or remaining hypothesis, changed behavior,
actual verification and limitations, and any next action. Use **Fixed and verified**, **Verification
incomplete**, or **Blocked** accurately. Fixed and verified requires the intended behavior and required
checks to be satisfied. If behavior was already correct, say no fix was needed and report what was checked.

Keep simple fixes in chat. Update a supplied bug record when authorized, or save one when requested or
required by repository convention. Use [record guidance and example](references/record.md) for durable
handoffs. Reuse the same record on resumption; reconcile its claims with current code and evidence.
Do not invent severity, owners, deadlines, issue numbers, or commits.

Leave changes ready for review by default. Branch creation, staging, commits, pushes, tickets, PRs,
comments, and deployment follow explicit user instructions, including earlier authorization. A bugfix
does not automatically authorize external publication or closing a ticket.
