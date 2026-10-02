---
doc: brd
status: Ready
created: 2026-10-01
updated: 2026-10-01
---

# BRD: Feature documentation workflow: brief → research → BRD → execute, with measured time

> Approved by Andrew on 2026-10-01 in Claude Code plan mode (session
> `ccf62fb7-c6a9-4cb2-8d82-359d84a30c73`). The brief and research happened in that planning
> conversation; their findings are summarised under Context.

## Context

Andrew wants one documentation-driven process for building features, built on industry-standard
artefacts (research brief, research report, BRD, execution log), that he can use in Claude Code
and Codex.

**Why now.** His two existing skill generations both fall short:

- **Legacy Claude set** (`copilot-developer/.claude/skills/{research-brief,research,plan,feature,execute}`):
  - 2,600 lines, hardcoded to a different Laravel app.
  - The brief is a "context packager… NEVER do research yourself" for an external AI tool, which is
    where hallucinations crept in.
  - There is no return path from research into planning.
  - Journal timestamps are typed by the model, so they can't support estimates.
- **Newer Codex set** (`copilot-developer/skills/{brd-plan,execute-plan,review-plan,research-spike}`):
  - Tight and evidence-first; its BRD format is already used by the vault's _Design System First Release Plan_.
  - No brief or research stage, no feature folder.
  - Explicitly forbids time data.
  - Not installed in Claude Code; the parent and child `CLAUDE.md` files map it to superpowers skills.

**Outcome.**

- Every feature moves through **brief → in-code research → business-ready research document → BRD
  → execution**.
- Findings are grounded in the repo (`path:line @ sha`) or an opened, cited source.
- Each repo keeps the historical record in `docs/features/`. The CylinderSoftware vault holds each
  feature's current state on a board.
- A ledger measures **active time** per stage and step, so later BRD estimates rest on real data.

**Accepted in this session (2026-10-01)**, all as recommended:

- flat dated folders;
- a thin vault feature note plus a Base;
- measured active time via a TypeScript CLI;
- skills in `copilot-developer` as a Claude Code plugin, plus Codex symlinks;
- research is code + web, with the tracks picked in the brief;
- skills named as a `feature-*` family;
- `research-spike` folded into `feature-research`;
- the vault-held release plan and its log stay where they are; the new flow applies to new work only.

## 1. Document contract (repo, historical)

**Folder.** One folder per piece of work: `<repo>/docs/features/YYYY-MM-DD-<slug>/`, dated by the brief.

**Where the folder goes.**

- A question-only research run creates a folder holding only `research.md`. A brief and BRD can be
  added to it later.
- A cross-repo feature lives in the repo whose code changes most; the other repos link to it.

**Frontmatter.** Minimal YAML on every document: `doc`, `status`, `created`, `updated`.
`research.md` adds `repo` and `commit`.

| File          | Purpose                                        | Status                                                             |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `brief.md`    | Research brief                                 | `Draft` · `Ready for research`                                     |
| `research.md` | Business-ready research report                 | `Answered` · `Conditional` · `Unresolved`                          |
| `brd.md`      | BRD: WHY / WHAT / HOW / ORDER / Decisions      | `Draft` · `Discovery needed` · `Ready`                             |
| `journal.md`  | Narrative work log, created at the brief stage | `In progress` · `Blocked` · `Verification incomplete` · `Complete` |
| `time.jsonl`  | Raw time ledger written only by `worklog`      | —                                                                  |
| `time.md`     | Time summary generated from the ledger         | —                                                                  |

**`brief.md`**

- Contents:
  - the idea in Andrew's words;
  - the problem and who it is for;
  - the outcome and success signals;
  - scope in and out;
  - constraints, each cited to guidance, code or a vault note;
  - what is already known in code, as file:line pointers;
  - research questions `RQ-n`, each tagged with a track: `code`, `technical`, `market` or `business`;
  - the tracks selected, with reasons.
- The `code` track is always on.

**`research.md`**

- The top half is readable by a non-engineer:
  - executive summary;
  - an answer per RQ;
  - recommendation, with the options and their trade-offs;
  - risks;
  - "What this means for the BRD".
- The bottom half holds the evidence:
  - findings per RQ, each tagged `verified-code`, `sourced`, `experiment` or `inference`, with a confidence level;
  - a current-state code map;
  - a sources appendix.
- Each finding cites `path:line @ sha`, or a URL with access date and version.
- The document is stamped with the repo, commit and dirty flag.

**`brd.md`**

- Keeps the brd-plan five-section contract: `REQ-###` IDs, observable acceptance, and a
  requirement → acceptance → step link.
- The brief and research are its inputs; it does not re-ask anything they already answer.
- Every step carries an **active-hours estimate with a basis**: either the `worklog summary`
  calibration or "no baseline — judgement", given as a range.

**`journal.md`** (modelled on Andrew's legacy execute-skill journal)

- A header with the plan link, branch, base commit and verification stack.
- One `## Step N: <task>` block per step: what was done, findings, decisions and deviations, each
  verify-and-fix iteration (checks run, failures, fix, result), the commit once it exists, and a
  status.
- Early stages (brief, research, BRD) get their own short blocks, so their work is recorded too.
- A closing `## Summary`: delivered, deviations, open items, lessons learned. Durations come from
  `time.md`, never from the model.
- Append corrections instead of rewriting history.

**`time.jsonl` and `time.md`** — see §3. Both are committed with the feature, so nothing expires.

- Estimates freeze when execution starts; re-estimates are new `step-start` notes, not edits.
- Without the tool, a repo still makes sense: the journal stands alone, and the time files are simply
  absent. Child repos must not depend on personal tooling (parent `AGENTS.md`).

## 2. Skills and packaging (personal tooling, `copilot-developer`)

A dedicated plugin directory serves as both the plugin root and the TypeScript package root, on the
`~/code/abilenduke/jev-agent-tools` pattern. A root manifest is ruled out because it would also load
`bugfix`, the old skills, and the Copilot `agents/*.agent.md` files as subagents.

```
copilot-developer/plugins/devflow/
  .claude-plugin/plugin.json      name/version/description/author; no "skills" key (default scan)
  contract/feature-folder.md      canonical document contract
  skills/feature-{brief,research,brd,execute,review}/
    SKILL.md (≤ ~120 lines) · agents/openai.yaml · references/{template.md, example.md, feature-folder.md}
  src/ test/ hooks/hooks.json    worklog CLI (TypeScript) and its activity hooks
  scripts/sync-contract.ts        copies contract → each skill's references/ and the repo README template
  evals/                          claude plugin eval cases
  package.json (bin: worklog) · tsconfig.json · tsconfig.test.json · README.md · CHANGELOG.md
```

**The contract.**

- `contract/feature-folder.md` is canonical.
- Copies are synced into each skill's `references/`, because Codex symlinks each skill dir on its
  own, so `../` paths don't work. A drift test in `npm test` keeps the copies identical.
- Each repo's `docs/features/README.md` is generated from the contract and wins on conflict.

**Rules for every skill.**

- Read `docs/features/README.md` when the repo has one; otherwise use the bundled contract and offer
  to add the README.
- End by naming the next stage. Invoking the next skill is the gate between stages.
- Run a generic **mirror step**: "If repository guidance names a knowledge base that tracks feature
  state, update it at this stage boundary as that guidance specifies; otherwise use its fallback."
  This keeps Cylinder specifics out of the personal plugin.
- Keep each description under 500 characters, naming the artefact path and stage-specific exclusions.

| Skill (Claude Code: `devflow:<name>`) | Replaces                            | Does                                                                                                                                                                                                                                                                                                                                                                                                         | Writes                                         |
| ------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `feature-brief`                       | legacy `research-brief`, `feature`  | Grounds itself in the code, then interviews (≤3 questions per round, structured tool). Selects the tracks and drafts the RQs.                                                                                                                                                                                                                                                                                | folder, `brief.md`, `journal.md`, `time.jsonl` |
| `feature-research`                    | `research-spike`, legacy `research` | Answers each RQ inside the repo first, fanning out to read-only subagents when available. Then covers the external tracks via context7, official docs and web, with each source opened (a snippet alone is not enough). Runs experiments only in scratch dirs. Synthesises the report and self-checks that every claim has evidence or is labelled inference. **Question-only mode** when there is no brief. | `research.md`                                  |
| `feature-brd`                         | `brd-plan`                          | Builds the BRD from the brief and research, asking only about the remaining decisions. Estimates come from `worklog summary`.                                                                                                                                                                                                                                                                                | `brd.md`                                       |
| `feature-execute`                     | `execute-plan`                      | Executes in dependency order: `worklog start`, implement and verify, `worklog finish`. Journals each step: work, findings, verify-fix iterations, commits.                                                                                                                                                                                                                                                   | `journal.md`, `time.*`                         |
| `feature-review`                      | `review-plan`                       | Read-only review against the BRD and log. Findings go in chat. Appends a `Review` section to `journal.md` only on request.                                                                                                                                                                                                                                                                                   | nothing by default                             |

The evidence discipline of the newer Codex skills carries over almost verbatim:

- facts vs inference;
- no invented metrics, owners or deadlines;
- honest statuses;
- preserving the user's work;
- following plan mode.

**Repo fixes in `copilot-developer`, done first:**

- `.gitignore` ignores `references` everywhere: anchor it to `/references`.
- Make sure `docs/features/` is not ignored.
- Add `plugins/devflow/dist*` to `.gitignore`, `.eslintignore` and `.prettierignore`.
- Widen the Prettier `singleQuote` override to `**/skills/*/SKILL.md`.

**Install.**

- Claude Code: `ln -s …/copilot-developer/plugins/devflow ~/.claude/skills/devflow`. It loads as
  `devflow@skills-dir`.
- Codex: one symlink per skill into `~/.agents/skills/`, using the README's collision check.
- CLI: `npm run check && npm run link` puts `~/.local/bin/worklog` on the path.
- Hooks: Claude Code loads them from the plugin; Codex gets the same events in
  `~/.codex/hooks.json`, which Andrew trusts once in Codex.
- User-scope `~/.claude/settings.json`: add `Bash(worklog:*)` to the allowlist.

## 3. `worklog` CLI (TypeScript, test-first)

`worklog` never reads Claude Code or Codex transcripts. It records its own data as the work happens,
in files committed with the feature.

**Files in the feature folder.**

- `time.jsonl`: the raw, append-only ledger, one JSON event per line.
  - `step-start` (step, estimate, session, harness) and `step-finish`;
  - activity events (`prompt`, `stop`, `tool`, `wait`, `subagent`) carrying only the timestamp,
    step, session and harness. No prompt text, tool input or code.
- `time.md`: generated by `worklog render` from the ledger, never hand-edited.
  `Step | Estimate | Started | Finished | Wall | Active | Sessions`, plus totals.

**Commands.**

- `worklog start <dir> <step> [--estimate 1.5h]` appends `step-start` with the current time and
  binds the current session to the step. The session comes from `CLAUDE_CODE_SESSION_ID`, or
  `CODEX_THREAD_ID`/`CODEX_SESSION_ID` (to be checked live).
- `worklog join <dir> <step>` binds another session or harness to an open step.
- `worklog finish <dir> <step>` appends `step-finish`, unbinds the step's sessions and renders
  `time.md`.
- `worklog hook` is called by the hooks in both harnesses, which share the `hooks.json` format. It
  reads the event payload from stdin; if that session is bound, it appends one activity event to the
  feature's ledger; otherwise it does nothing. It always exits 0 silently.
- `worklog render <dir>`, `worklog check <dir>` (ledger valid, `time.md` current), and
  `worklog status` (open steps and bound sessions).
- `worklog summary <docs/features…> [--json]` reads ledgers only. It leads with a calibration
  figure, the median of actual/estimate with its IQR, then per-feature totals.

**Hooks.**

- Claude Code: the plugin's `hooks/hooks.json` registers UserPromptSubmit, Stop, SubagentStop,
  Notification, PostToolUse, and PreToolUse for `AskUserQuestion`/`ExitPlanMode`.
- Codex: the same events in `~/.codex/hooks.json`.
- A shell guard skips Node entirely when no step is open.
- Binding state lives in `${XDG_STATE_HOME:-~/.local/state}/worklog/active.json`. It is transient;
  the ledger is the record.

**How active time is counted, from the ledger only.**

- Per session, events are sorted. The session is _in a turn_ from `prompt` to `stop`, and _waiting_
  after a `wait` until its next event.
- A gap inside a turn counts up to 30 minutes: a long tool run is work, but a longer silence is
  probably an unanswered permission prompt.
- A gap spent waiting on the human (after `stop` or `wait`) counts up to 5 minutes.
- Counted spans are unioned across sessions, so parallel sessions and subagents are not counted
  twice, and clipped to the step's window. The total is the union over all steps.
- With no bound session (a stamp from a plain terminal), Active shows `—`. It is never guessed.

**Tests** use `node --test` with hand-written ledgers and hook payloads. They cover the turn/wait
state machine, both caps, parallel sessions, several windows per step, the 2026-11-01 DST change,
unbound sessions, malformed payloads, concurrent appends, Prettier stability of `time.md` and the
contract drift check.

## 4. Vault integration (current state, company process)

The skills are personal tooling and stay out of the vault, apart from the Tooling note's existing
skill routing.

**`CLAUDE.md` amendment:**

- add `type: feature`;
- feature properties:
  - `stage: brief | research | planning | executing | review | done | abandoned`;
  - `repo: design-system | content-engine | blockchain | parent`;
  - `folder: docs/features/<dir>`.
- `status` keeps the vault enum and maps from `stage`:

  | stage              | status     |
  | ------------------ | ---------- |
  | brief              | idea       |
  | research, planning | proposed   |
  | executing, review  | active     |
  | done               | documented |
  | abandoned          | archived   |

**`Templates/Feature.md`:**

- opens with an `[!abstract]` callout giving the current state in one line;
- sections: Current state, Accepted decisions, Open questions, Records (repo paths and commit),
  Time (estimate against active).

**Notes.**

- Location: `Projects/<Project>/Features/YYYY-MM-DD <Title>.md`.
- The date prefix keeps filenames unique and matches the repo folder.

**`Bases/Features.base`:**

- filter `type == "feature"`, excluding `Templates/`;
- a Board view grouped by stage, plus a Cards view;
- embedded in the MOC's **Projects** section next to `![[Projects.base#Pillars]]`.

**`Decisions/D-010 Feature documentation workflow.md`:**

- `decision-status: accepted`, dated 2026-10-01;
- records exactly the choices Andrew selected in this session;
- notes that the vault-held release plan and its log are unchanged.

**`Projects/Design Suite/Design System Tooling and Workflow.md`:** update "Skills supporting the
work" and "Agent harness equivalents" to the `feature-*` family.

**Stage-boundary updates** follow each repo's `docs/features/README.md`, using the existing
`vault-sync` ritual and the `docs/vault-sync-pending.md` fallback.

## 5. Cylinder repository adoption (one sweep)

**Each child**:

- add the generated `docs/features/README.md`;
- in `AGENTS.md`, replace `brd-plan`, `execute-plan` and `review-plan` with the bare `feature-*`
  names, still noting that standalone clones must not depend on them;
- in `CLAUDE.md`, replace the superpowers mapping line with "Claude Code: `devflow:<name>`";
- add a README planning-section pointer.

**Order:**

1. content-engine and blockchain first; both are clean on `main`.
2. **design-system after `chore/plain-docker` lands.** That branch has uncommitted edits to the
   same `CLAUDE.md`, `README.md` and `docs/`. Then work in a worktree off `main`; `pnpm check`
   (Prettier at printWidth 100) must pass.

**Parent:**

- update the `CLAUDE.md` skill table and the `AGENTS.md` skill names;
- add a short "Feature records" section to `docs/ecosystem-development.md`: child `docs/features/`
  is historical, vault feature notes are current;
- one gitlink commit after the child commits.

**Git:** staging, branching and commits stay prompted. Children are committed before the parent,
and only when Andrew says so.

## Build order (each step ends at a checkpoint)

0. **Prep.**
   - Apply the copilot-developer ignore/Prettier fixes.
   - Start the dogfood record `copilot-developer/docs/features/2026-10-01-feature-workflow/`:
     `brd.md` is this plan, `journal.md` is the narrative, and `time.jsonl` is seeded from
     `date -Iseconds` stamps until `worklog` is installed and recording.
   - Set `allow_implicit_invocation: false` on the old Codex skills while both sets coexist.
   - Remove the legacy Claude skills (`.claude/skills/{research-brief,research,plan,feature,execute}`
     and `.claude/agents/plan-executor.md`), with **confirmation before deleting**; git history keeps them.
1. **Ledger contract and fixtures.** The `time.jsonl` field contract plus hook-payload fixtures for
   both harnesses → Andrew reviews.
2. **`worklog`, test-first** → `npm run check` is green; a live Claude Code session and a live
   Codex session each append events while a step is open.
3. **Contract and templates, plus the sync script** → drift test is green; the generated README is
   Prettier-clean under design-system's config.
4. **Plugin skeleton and installs** → `claude plugin validate --strict` passes;
   `claude plugin details devflow@skills-dir` shows 5 skills, 0 agents and the hook config; a fresh Codex
   session lists the `feature-*` skills.
5. **Skills in workflow order**, using `superpowers:writing-skills` (baseline first, then with the
   skill) → `claude plugin eval` shows the baseline-vs-skill delta, the Codex smoke results are
   recorded under `tests/skills/feature-*/`, and every SKILL.md is ≤ ~120 lines.
6. **Cylinder adoption** (§5) → `/submodule-status` is clean, design-system `pnpm check` passes, and
   the guidance greps show no stale `brd-plan` mapping.
7. **Vault** (§4) → frontmatter, wikilinks, Base filter and MOC embed are validated; Andrew eyeballs
   the board in Obsidian.
8. **Pilot** on a small real design-system feature that Andrew picks: brief and research in Codex,
   BRD and execute in Claude Code → the documents land in the folder, the vault note moves through
   its stages, and the `worklog` numbers are sanity-checked against Andrew's sense of the time spent.
9. **Retire the old Codex skills.** Delete `brd-plan`, `execute-plan`, `review-plan` and
   `research-spike`, their `~/.agents/skills` symlinks and README sections; move their test results
   to `tests/skills/_retired/`. **Confirm before deleting.**

## Verification

- **`worklog`:** `npm run check` (typecheck, `node --test`, build). Once installed, the rest of this
  build is recorded by `worklog` itself, and `time.md` is checked against the stamps.
- **Skills:**
  - `claude plugin validate --strict` and `claude plugin details`;
  - `claude plugin eval` per skill, against a no-plugin baseline;
  - Codex fresh-session discovery plus explicit invocation;
  - pressure scenarios checking that research cites `path:line @ sha`, never hands off to an
    external tool, and labels inference, and that execute never types times.
- **Repos:**
  - design-system `pnpm exec prettier --check docs` and `pnpm check`;
  - `/submodule-status` before and after;
  - a grep for stale skill names across the parent, the 3 children and the vault.
- **Vault:** validate frontmatter enums, wikilinks, the Base filter and the MOC embed; Andrew checks
  the board visually.
- **End-to-end:** the pilot feature goes through all four documents and its vault note.

## Out of scope / still open

- Migrating the vault-held _Design System First Release Plan_ and its log; revisit after the pilot.
- Other legacy copilot-developer items: `feedback`, `documentation-maintenance`, `skill-builder`,
  and the dead `doc-sync-hint.sh` hook.
- A repo-side feature index or GitHub issue creation.
- The pilot feature; Andrew chooses it at that step.

## Revisions

- 2026-10-01, Andrew, after approval: nothing may depend on Claude Code or Codex transcripts, which
  expire (30 days by default) and are another tool's internal format. `worklog` keeps its own
  ledger, `time.jsonl`, committed in the feature folder and fed by hooks plus explicit start/finish
  stamps; `time.md` is generated from it. The narrative log is `journal.md`, modelled on Andrew's
  legacy execute-skill journal. The `cleanupPeriodDays` change was reverted.
- 2026-10-01, Andrew: the skills live in the Cylinder repositories, not the personal plugin, because
  he works both in each child and from the parent. The parent is the source: `.agents/skills/feature-*`
  (Codex) linked from `.claude/skills/` (Claude Code), with the contract at `docs/features/README.md`;
  `scripts/sync-feature-skills.ts` copies both into each child, where they are committed. `devflow`
  keeps only `worklog` and its hooks, installed for both harnesses (Codex hooks added to
  `~/.codex/hooks.json` on Andrew's explicit instruction).
