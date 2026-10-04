---
doc: journal
status: In progress
created: 2026-10-01
updated: 2026-10-01
---

# Journal: Feature documentation workflow

- **Plan:** [brd.md](brd.md), approved 2026-10-01; see its Revisions section.
- **Branch:** `feat/devflow-feature-workflow` in `~/code/abilenduke/copilot-developer`, from `dd57f75`
  (`main`). Cylinder parent at `33c17f7`.
- **Also touched:** the Cylinder parent and children, and the CylinderSoftware vault (steps 6–7).
- **Existing work preserved:** design-system's uncommitted `chore/plain-docker` changes; the parent's
  pre-existing `design-system` gitlink drift.
- **Time:** [time.md](time.md), generated from [time.jsonl](time.jsonl). The planning and S0 entries
  were seeded by hand from the session transcript and `date -Iseconds`, before `worklog` existed;
  their `source` field says so.

## Plan: brief, research and BRD

Ran in Claude Code plan mode. Read both generations of Andrew's skills and surveyed the three
children and the vault. Asked eight design questions in two rounds; Andrew took every
recommendation. A Plan agent pressure-tested packaging and timing.

**Findings**

- The legacy Claude skills (2,600 lines) were hardcoded to another Laravel app. Their research brief
  packaged context for an external AI tool, and nothing read the results back into planning.
- The newer Codex skills are evidence-first but have no brief, research or feature folder, and
  forbid time data.
- Packaging: a plugin manifest at the copilot-developer root would also load the old skills and the
  Copilot agents, so the plugin gets its own directory.

**Status:** Approved.

## Step 0: Prep

- Branched copilot-developer to `feat/devflow-feature-workflow`.
- Anchored the `references` ignore to the root in `.gitignore`, `.prettierignore` and
  `.eslintignore`; added the devflow build output to the ignores; widened the Prettier `SKILL.md`
  override to `**/skills/*/SKILL.md`.
- Deleted the legacy Claude skills `research-brief`, `research`, `plan`, `feature`, `execute` and the
  `plan-executor` agent, with Andrew's confirmation.
- Added `Bash(worklog:*)` to the user allowlist.
- Deferred to step 4: switching off implicit invocation of the old Codex skills, because nothing
  replaces them until the new ones are installed.

**Findings**

- `.gitignore` had ignored every `references` directory, so only the six listed skills had their
  references tracked; any new skill's templates would have been silently dropped.
- Claude Code transcripts log local commands (`/clear`, `/effort`) and background-task
  notifications as user entries, and write timestamps out of order.
- README.md, `docs/runbooks/skills-guide.md` and the remaining legacy skills (`bugfix`, `feedback`,
  `documentation-maintenance`) still mention the deleted skills; the README is rewritten in step 4,
  the rest is out of scope.

**Decisions and deviations**

- Andrew rejected measuring time from Claude Code or Codex transcripts: they expire after 30 days
  by default and are another tool's internal format, so data could be lost. `worklog` keeps its own
  ledger, `time.jsonl`, committed with the feature and fed by hooks in both harnesses plus explicit
  start/finish stamps. The 365-day `cleanupPeriodDays` change made earlier in this step was reverted.
- The narrative log is `journal.md`, modelled on Andrew's legacy execute-skill journal; time lives
  in `time.jsonl` and the generated `time.md`.
- Codex 0.156 has stable hooks in the same `hooks.json` format as Claude Code, and its binary
  references `CODEX_THREAD_ID` and `CODEX_SESSION_ID`; which one shell commands receive is still to
  be checked live.

**Status:** Complete.

## Steps 1 and 2: Ledger contract and `worklog`, test-first

Wrote `plugins/devflow/contract/time-ledger.md` and the `worklog` CLI (`start`, `join`, `finish`,
`hook`, `render`, `check`, `status`, `summary`) under `plugins/devflow/src/`. Hand-written ledgers
and hook payloads in the tests replace transcript fixtures. Done together inside S1's window.

**Findings**

- Codex 0.156 exposes `CODEX_THREAD_ID` and `CODEX_SESSION_ID` (equal for a main thread) to shell
  commands, checked live with `codex exec`.
- Codex's default workspace-write sandbox can write `/tmp` but not `~/.local/state` ("Read-only file
  system", checked live), so session bindings moved to `/tmp/worklog-<uid>/active.json`. They are
  transient; the ledger is the record.

**Verification**

| Iteration | Checks run                       | Result                                                        | Fix                                        |
| --------- | -------------------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| 1         | `npm test`                       | Compile errors: modules missing (RED)                         | Implemented duration, ledger, active       |
| 2         | `npm test`                       | 15/16; DST test wrong (40m gap > cap)                         | Test rewritten to a fall-back case of 20m  |
| 3         | `npm test` with new suites       | RED, then 41/41                                               | Summary helper given tool events every 20m |
| 4         | Mutation: idle cap 5m to 10m     | 3 tests fail as intended; restored                            | None                                       |
| 5         | `npm run check`                  | Typecheck, 43/43 tests, build pass                            | None                                       |
| 6         | Real hook command, piped payload | `tool` event appended, no payload text kept; guard path 40 ms | None                                       |

**Status:** Complete.

## Step 4: Plugin skeleton and installs (moved ahead of step 3)

- `plugins/devflow/.claude-plugin/plugin.json` and `hooks/hooks.json` (9 events). Linked
  `~/.claude/skills/devflow`; `claude plugin validate --strict` passes and `claude plugin details
devflow@skills-dir` lists the 9 hooks. Hooks load from the next Claude Code session.
- `worklog` built and linked to `~/.local/bin/worklog`.

**Decisions and deviations**

- Codex hooks were not installed: Claude Code's auto-mode classifier blocked editing the global
  `~/.codex/hooks.json` as unauthorized persistence. Left for Andrew; the snippet is in the plugin
  README.
- The classifier then also blocked the `worklog finish S4` / `worklog start S3` stamps, so S4 is
  still open in the ledger until Andrew decides how stamps should be authorized.
- The synthetic hook test at 22:27:33 left one real `tool` event in this ledger; it matches actual
  activity at that moment.

**Status:** Blocked on Andrew (Codex hooks, stamp authorization).

## Step 3: Contract, sync script and skills (with S6 and S7 inside the same window)

Andrew moved the skills into the Cylinder repositories. The parent is the source:
`.agents/skills/feature-{brief,research,brd,execute,review}/` with `.claude/skills/` symlinks, the
contract at `docs/features/README.md`, and `scripts/sync-feature-skills.ts` (sync and `--check`),
type-checked and tested from `scripts/`. Skills were written baseline-first: five fresh subagents
did each stage's task without any skill, on clones of design-system and a tiny TypeScript fixture.

**Findings**

- Codex discovers `.agents/skills` only up to the nearest Git root (`codex debug prompt-input`
  probe: a parent sees only its own skills, a child only its own), and follows symlinked skill
  folders. Claude Code reads only `.claude/skills`, loads a relative symlink to a skill folder
  (checked with a headless run), and in a parent session loads nested child skills only lazily.
  Hence one real copy per repository plus links.
- Baselines without skills: the **brief** cited no `path:line` and asked 20 questions in a flat
  `docs/` file; the **research** document (4,495 words) had zero `path:line` citations, no commit
  stamp and no per-finding evidence labels, though its web sources were dated; the **BRD** had no
  REQ ids, wrote `plan.md`, and estimated in ambiguous human hours; **execute** used real `date`
  stamps but kept durations as prose with no estimate or active time; **review** caught every
  planted defect and stayed read-only, so `feature-review` only adds the folder plumbing.
- The old `execute-plan`, `brd-plan` and `research-spike` references were reused where they were
  already evaluated (verification and resumption, question menu, experiments, BRD sections).

**Verification**

| Iteration | Checks run                                                     | Result                                                                 | Fix  |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ---- |
| 1         | `npm run check` in `scripts/` (RED first)                      | Module missing, then 7/7 pass, typecheck clean                         | None |
| 2         | Sync `--only content-engine --only blockchain`, then `--check` | 49 files synced; check reports in sync                                 | None |
| 3         | GREEN `claude -p` runs: execute, review                        | Both triggered their skill from a plain request; both met the contract | None |
| 4         | Vault: YAML of changed notes and base, wikilinks               | All parse; no unresolved links                                         | None |

**Decisions and deviations**

- S6 (adoption) and S7 (vault) ran inside this window for content-engine, blockchain and the
  parent; design-system waits for its uncommitted `chore/plain-docker` work.
- Vault: D-010 accepted, `type: feature` and its properties in the vault `CLAUDE.md`,
  `Templates/Feature.md`, `Bases/Features.base`, the Tooling note's skill routing, and the MOC.

**Status:** Complete.

## Step 5: GREEN verification of the five skills

Each skill was run headlessly (`claude -p`) in a fresh fixture with the baseline's exact request and
no mention of the skill, plus discovery smoke tests in both harnesses.

**Findings**

| Skill              | Triggered from plain request | Result against its baseline                                                                   |
| ------------------ | ---------------------------- | --------------------------------------------------------------------------------------------- |
| `feature-brief`    | Yes                          | 24 `path:line` citations (was 0), 7 RQs (was 20), dated folder, journal and time files, Draft |
| `feature-research` | Yes                          | 78 citations (was 0), every finding tagged, commit stamped, honest Conditional status         |
| `feature-brd`      | Yes                          | `brd.md` with 12 REQ rows (was 0), 4 steps (was 13), every step estimated with a stated basis |
| `feature-execute`  | Yes                          | `worklog` stamps under its own session, journal blocks with RED/GREEN iterations              |
| `feature-review`   | Yes                          | Same defects found as the baseline, read-only apart from its own `time.*` stamps              |

- Codex (`codex debug prompt-input`) lists all five skills in the parent, content-engine and
  blockchain; Claude Code lists all five in the parent and content-engine.
- The research run's web, Context7 and `command -v worklog` calls were refused by the test
  harness's allowlist, not by the skill; it recorded the refusals and labelled affected claims
  `inference`.

**Decisions and deviations**

- The brief test wrote a real feature note into the vault, because design-system's
  `.claude/settings.json` grants vault access to a clone. The note claimed Andrew had asked for a
  Badge, so it was removed with its folder. Future fixture clones need that settings file removed.
- Fixes from the runs: the contract now spells out the stage-to-status mapping (the test note used
  `proposed` for `brief`); research probes must be TypeScript (a run wrote a `.mjs` probe).
- Old Codex skills set to `allow_implicit_invocation: false` while both sets are installed.
- Parent `scripts/` gained Prettier (design-system's options), so `npm run check` there also
  checks the skills and contract that get synced into design-system's `pnpm check`.

**Status:** Complete.

## Step 6: design-system adoption

Andrew committed the plain-Docker work (`43b2f9d` on `chore/plain-docker`, not yet merged to
`main`). `feat/feature-workflow` was branched from it, so the guidance edits stack on his
`CLAUDE.md` and `README.md` changes instead of conflicting with them. The sync script copied the
skills and contract in; `AGENTS.md`, `CLAUDE.md` and `README.md` now route feature work to the
`feature-*` skills.

**Verification**

| Iteration | Checks run                                             | Result                                                                   | Fix  |
| --------- | ------------------------------------------------------ | ------------------------------------------------------------------------ | ---- |
| 1         | `prettier --check .agents/skills docs/features`        | Clean                                                                    | None |
| 1         | `pnpm check` (native)                                  | Pass: format, lint, typecheck, 9 tooling tests, 199 package tests, build | None |
| 1         | `node scripts/sync-feature-skills.ts --check` (parent) | All three children in sync                                               | None |

**Decisions and deviations**: the branch is stacked; when `chore/plain-docker` merges, rebase it
onto `main`. Vault D-010 and the MOC were corrected (design-system adopted; plain-Docker work
committed).

**Status:** Complete.

## Step 9: Retire the old Codex skills, commit and push

On Andrew's instruction (2026-10-01, before the pilot), deleted `brd-plan`, `execute-plan`,
`review-plan` and `research-spike` with their evaluation folders, `~/.agents/skills` links, README
sections and ignore negations. Their history stays in Git.

**Findings**: `tests/skills/bugfix/evaluate.py` imported its Git, snapshot and temporary-root helpers
from `review-plan`'s evaluator, so those three functions now live in the bugfix driver itself. The
shared `test_workflow_evaluators.py` keeps only the bugfix path guards.

**Verification**

| Iteration | Checks run                                                     | Result                   | Fix  |
| --------- | -------------------------------------------------------------- | ------------------------ | ---- |
| 1         | `python3 -m unittest tests/skills/test_workflow_evaluators.py` | 1 test passes            | None |
| 1         | `tests/skills/bugfix/evaluate.py prepare` in a temp dir        | Exit 0, fixtures created | None |
| 1         | `prettier --check README.md tests/skills`                      | Clean                    | None |

**Status:** Complete. Pushes are recorded in the commit messages and the vault.
