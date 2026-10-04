---
name: feature-plan
description: Use when a GitHub issue needs its spec, requirements, acceptance criteria, implementation plan, delivery steps or estimates, usually after its brief (and research) exist, when the user asks for a BRD, PRD or plan, or when an approved plan must change. Not for implementing the plan or reviewing delivered work.
---

# Feature Plan

Turn the issue's brief and research into a **spec** (WHAT: requirements a test can check) and a
**plan** (HOW and ORDER: steps with estimates, risks and the checklists that gate execution and
closing). The spec is approved once and stays stable; the plan may change during execution, with a
recorded reason. Read `references/feature-workflow.md` first; it is the contract for the issue, and
the repository's `AGENTS.md` wins over it.

## 1. Ground the plan

1. `worklog start issue-N plan --estimate <estimate>`.
2. Read the brief section, the research comment, the decisions section, the repository guidance and
   the code the plan will change. Re-check each research claim you rely on against the current
   commit; a claim that no longer holds goes in Decisions and the user hears about it.
3. Use what the brief and research settled. Ask only about consequential choices still open (scope,
   behaviour, compatibility, failure handling), as the contract's Asking the user describes.
   Routine details get visible, reversible defaults.

## 2. Estimate in the unit `worklog` measures

Estimates are **active time**: the agent's working time plus the person's attention while answering.

1. Write your judgement estimate for each step.
2. Run `worklog forecast S1=<estimate> S2=<estimate> … --labels type:<type>,track:<track>`. Each
   step's basis is its forecast: `P50 1h53m, P80 2h18m (build, 8 past steps)`. With no basis, it is
   `no baseline: judgement`, with a range.
3. Keep your estimate as written; the forecast is the correction, not a replacement. Never adjust
   estimates towards the forecast to look calibrated.
4. Put the **total with QA and fixes** next to the appetite in the status section, together with
   how long comparable past issues took. When the P80 does not fit the appetite, say so and offer a
   smaller scope; never shrink estimates to fit.

## 3. Write the spec section

`worklog issue section N spec --file -`:

```markdown
## Spec

| ID      | Requirement (source)   | Priority | Acceptance                                               |
| ------- | ---------------------- | -------- | -------------------------------------------------------- |
| REQ-001 | <one behaviour> (RQ-2) | Must     | When <trigger>, the <system> shall <observable response> |

**Quality requirements:** <only those that apply: performance, security, reliability, accessibility,
compatibility, maintainability; each measurable, or labelled a hypothesis>

**Non-goals:** …
```

- Write acceptance in EARS: `When <trigger>, the <system> shall …` (event), `While <state>, …`
  (state), `If <unwanted condition>, then the <system> shall …` (failure), `The <system> shall …`
  (always). Use Given/When/Then for a scenario with setup. Each criterion names something a test or
  observation can check; "fast", "robust" or "intuitive" without a measure is not acceptance.
- Every Must has acceptance. Priorities are Must, Should or Could; deferred work goes in Non-goals.

## 4. Write the plan section

`worklog issue section N plan --file -`, following `references/plan-sections.md`:

```markdown
## Plan

### Approach

<Affected code as `path:line`, proposed new paths labelled proposed, interfaces, data flow, failure
behaviour, and the alternative not chosen.>

### Steps

**S1: <capability> (REQ-001, REQ-002).** <change, depends on, the check that proves each criterion>
Estimate 1h30m · Basis: <calibration or "no baseline: judgement, 1h–2h">

### Tests

| Requirement | Test or check (planned) |
| ----------- | ----------------------- |

### Risks

| Risk (pre-mortem: "it failed because…") | Likelihood | Impact | Mitigation |
| --------------------------------------- | ---------- | ------ | ---------- |

### Rollout and rollback

<How it reaches users, migrations, how to undo it; or "None: <why it is trivially reversible>".>

### Definition of Ready

- [ ] Every Must has acceptance and a step that names it
- [ ] No blocking decision is Open
- [ ] Every step has an estimate and a basis, and the total fits the appetite
- [ ] Approved by @<user> on <date>

### Definition of Done

- [ ] Every in-scope acceptance check passes and is in the journal
- [ ] The repository's required checks pass
- [ ] The PR carrying `Closes #N` is merged
- [ ] ADRs and docs the change needs are updated
- [ ] Follow-ups are open issues, listed under Links
- [ ] Time posted and the retro written

### Revisions
```

- When the work touches authentication, secrets, user data or untrusted input, run a short STRIDE
  pass (spoofing, tampering, repudiation, information disclosure, denial of service, elevation of
  privilege) and put what applies under Risks.
- A decision that constrains the architecture beyond this issue gets an ADR in the repository's ADR
  folder (default `docs/adr/NNNN-<slug>.md`, MADR: context, drivers, options, outcome,
  consequences), written during execution with the code; Decisions links to it.

## 5. Decisions, approval and close

1. Decisions section: each choice as `D-n | decision | Confirmed / Default / Open | source`.
2. Tick the Definition of Ready only with evidence. The approval line is ticked only when the user
   approves; "Ready" describes completeness, not permission.
3. **Revising a plan:** keep requirement IDs stable, never reuse a removed one, and add a dated line
   under Revisions with the reason and the affected IDs. A change to a confirmed decision needs the
   user: record it as `Open`, mark the steps that wait on it, and untick the Definition of Ready.
4. `worklog finish issue-N plan`, `worklog post issue-N`; status section with the total estimate;
   swap `stage:plan` for `stage:execute` once approved.
5. Report the open decisions, the total estimate against the appetite, and the next skill:
   `feature-execute`, once the user approves.
