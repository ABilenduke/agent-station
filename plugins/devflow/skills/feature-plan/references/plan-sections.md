# Spec and plan sections

Scale every section to the work: a small change fits in a few lines per section. Omit subtopics that
do not apply instead of writing filler.

## Why (in the brief)

The problem, who it affects, current and desired behaviour, and intended value live in the brief.
The plan does not repeat them; when planning changes them, update the brief section and say so under
Revisions. Use supplied or measured targets only. A benefit without a baseline is a hypothesis with
the measurement that would test it. Never invent a percentage, budget, owner, deadline or response
time.

## Spec: WHAT

What is included, excluded and constrained. Give each distinct required behaviour a stable ID,
priority, source (an RQ, the brief, a decision) and observable acceptance:

| ID      | Requirement (source)                                    | Priority | Acceptance                                |
| ------- | ------------------------------------------------------- | -------- | ----------------------------------------- |
| REQ-001 | One behaviour, tied to a stated user need or constraint | Must     | EARS sentence or Given/When/Then scenario |

The row describes the format; replace it with real requirements. A Must has at least one acceptance
criterion. Cover the alternate and failure paths that matter (an EARS `If … then` sentence each).
Quality requirements come from the project's real needs, not an imported checklist: name only those
that apply, each with a measure or labelled a hypothesis.

## Plan: Approach (HOW)

Connect the requirements to the inspected code and the proposed change. Cite meaningful paths or
symbols; label proposed new paths. Specify API, schema, data-flow, integration, compatibility and
failure-handling changes the implementation needs. Explain the chosen approach and the material
alternatives with their trade-offs. Prefer the affected subsystems and a focused file list to an
exhaustive speculative manifest. Name decisions that block readiness.

## Plan: Steps (ORDER)

Order steps by dependency and useful deliverable, starting with the smallest end-to-end slice, and
put any investigation of a blocking unknown before the work that depends on it. Each step names its
REQ IDs, the concrete change, its dependencies, and the test or observation that verifies each
acceptance criterion. Use the repository's real commands; mark suggested new ones as proposed. Each
step carries an active-time estimate and its basis. Steps a subagent could do in parallel are marked
`independent`.

## Plan: Tests, risks, rollout

- **Tests:** one row per requirement with the planned test or check. Planned is not done; the
  journal records what ran.
- **Risks:** run a pre-mortem ("it is a month later and this failed; why?"). Keep the risks that
  change what you build or check, each with a mitigation. Add the STRIDE items that apply when the
  work touches authentication, secrets, user data or untrusted input.
- **Rollout and rollback:** how the change reaches users, data migrations, feature flags, and how to
  undo it. "None" is a valid answer only with the reason it is trivially reversible.

## Decisions and readiness

Decisions record confirmed user choices, consequential evidence, defaults and unresolved assumptions
without repeating requirements. Each Open item names the missing decision or evidence, its effect on
delivery, and the next question or investigation. Do not invent an owner.

The Definition of Ready is ticked only with evidence. While an Open item blocks a Must, the plan is
not ready: say which steps can still run (discovery) and which wait. A ready plan may hold an
unmeasured future benefit or a reversible default; it may not hide an undecided required behaviour.

## Revisions

On revision, record the changed decision and affected IDs with a date. Removed IDs stay retired;
remaining IDs stay stable. Reconcile requirements, acceptance, steps, tests and decisions so the
current sections can be handed over without reading a superseded version.
