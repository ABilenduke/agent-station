# Frontend craft pilot

This suite compares rendered design, technical behavior, and workflow separately.
It does **not** establish improvement from a skill validator, source inspection,
model self-rating, or successful process exit. Read the actual results before
promoting a candidate.

The [2026-09-15 pilot findings](results/2026-09-15.md) record the actual outcomes.
Frontend Craft remains an experimental candidate; it has not earned global promotion.
Only dated findings summaries are versioned under `results/`. Raw logs, generated
applications, fonts, images, browser reports, run manifests, and galleries remain
Git-ignored local artifacts. The local gallery is at
`results/pilot-2026-09-15/index.html`; it is not included in a fresh checkout.
Reusable fixtures, their supplied assets, and evaluation tooling remain versioned.

## Fixed conditions and isolation

The four briefs cover a public workshop page, an existing dense Vue operations
interface, a booking form, and a public reading experience. Each includes fixed
content and starting code; the landing page includes original SVG assets. Private
rubrics and interaction scenarios live in [cases.json](cases.json).

The four conditions are native Codex, Anthropic plus Vercel guidance, Impeccable,
and `frontend-craft`. Each condition receives identical starting files, prompt
content, model, reasoning setting, tools, network policy, and wall-clock limit.
Every new trial gets a distinct, bind-tested server port recorded as `actor_port`.
Preparation and finalist selection skip occupied ports and all ports assigned to
earlier trials. Preflight checks pending trial ports; execution checks again
before setup and immediately before the model call. Existing manifests retain
their frozen prompts: the runner reads their assigned port from the prompt, with
the original `9000 + trial number` convention as a fallback.
Skill source trees and fixture bytes are frozen and hashed before execution.
Repetitions reuse these frozen copies. Start another comparison after editing a
candidate or fixture; never overwrite a trial to erase an unfavorable result.

This is a **skill-level comparison with automatic hooks disabled**, not a test of
the complete Impeccable plugin. Its genuine pinned Codex skill, references,
launcher, and engine must be supplied together. The Vercel adapter wraps its
unchanged pinned `command.md` as a local skill so the baseline does not fetch a
moving upstream version. Native has no additional skills. All conditions have
plugins, apps, automatic hooks, memories, multi-agent delegation, and image
generation disabled; Python Playwright and supplied assets are available equally.

The runner does not modify home configuration or repurpose `HOME`/`CODEX_HOME`.
It uses `--ignore-user-config`, `--ignore-rules`, per-process feature flags, and
`skills.config` disable entries. `project_doc_max_bytes=0` excludes file-discovered home
and ancestor instructions, so fixture requirements belong in the prompt/README.
Before **every** trial it uses `codex debug prompt-input` to discover external
skills and verify that only the expected fixture skill paths remain. This catches
global Cylinder and other competing design authorities. It fails on an unknown
catalog format or extra visible skill.

Every isolation check also makes a bounded, billable catalog-only model call with
the same `codex exec` flags, model/settings, workspace, and disable list used for
implementation. It asks for the catalog paths from the supplied context without
providing the expected answer or allowing tool use in the prompt. Missing, malformed,
or mismatched answers block execution. The command, response, timing, and usage
events are retained under `exec-catalog/`. This is a model-reported cross-check of
the actual execution path, not proof of filesystem confinement or of future tool reads.

The disable list also enumerates skill files in the normal home and system roots.
This matters because `debug` honors globally disabled skills while
`exec --ignore-user-config` may re-enable them; discovery output alone is
insufficient. A regression test covers that difference.

This provides skill discovery isolation, not an adversarial filesystem
security boundary. Trials run outside this repository in individual Git roots.
Rubrics, scores, competing conditions, mappings, and traces are never copied into
their workspaces or sent as prompts. Keep those files away from the implementing
agent and share only the blind render directory with a visual reviewer.

Inspect the retained full prompt as well as its skill catalog. This hosting
environment still injects common Cylinder project instructions and a delegation
mandate even when local project documents and multi-agent tooling are disabled.
Those shared instructions are a limitation of the recorded pilot; the runner
does not claim a blank native prompt or successful removal of host-injected
instructions. The explicit fixture brief remains the same across conditions.

## Run the comparison

Requirements: Git, Python 3, Node/npm for the pinned Vue fixture, authenticated
Codex CLI with `debug prompt-input`, Python Playwright, and its Chromium browser.
Version 0.154.0 supports the flags used here. Supply complete baseline directories
from the revisions in [evaluate.py](evaluate.py); preserve their license notices.
The pinned sources and adaptations are documented in the skill's provenance.
The manifest records expected upstream revisions and hashes of the actual supplied
trees. The runner does not infer or verify a Git commit from an arbitrary supplied
directory; retain the download/check-out provenance alongside the results.

```bash
python3 evals/frontend-craft/evaluate.py prepare \
  --root /tmp/frontend-craft-pilot \
  --anthropic /tmp/frontend-craft-upstream/anthropic/skills/frontend-design \
  --vercel /tmp/frontend-craft-upstream/vercel-skill \
  --impeccable /tmp/frontend-craft-upstream/impeccable/.agents/skills/impeccable \
  --model gpt-6-astra --reasoning ultra --timeout 720

python3 evals/frontend-craft/evaluate.py run \
  --root /tmp/frontend-craft-pilot --dry-run

python3 evals/frontend-craft/evaluate.py preflight \
  --root /tmp/frontend-craft-pilot --probe

python3 evals/frontend-craft/evaluate.py run \
  --root /tmp/frontend-craft-pilot --stage initial --workers 4

python3 evals/frontend-craft/evaluate.py render \
  --root /tmp/frontend-craft-pilot --stage initial --verify-behavior
```

`prepare` creates 16 randomized, anonymously named trial workspaces and retains a
private mapping in `manifest.json`. `preflight` checks all four skill catalogs and
the browser. `--probe` additionally makes a small billable model call that runs
Chromium **inside the same Codex sandbox policy used by the trials**. The runner
requires this probe to pass before spending on the comparison. Merely finding a
browser executable is insufficient.

Restricted hosting environments may prevent Codex from writing its normal runtime
or connecting to the model, or prevent Chromium from starting. Use the host's
normal approval mechanism for these evaluation commands when authorized. Do not
bypass the child sandbox, change global configuration, or count blocked preflight
as evidence against a skill. All trial agents use `workspace-write` with network
access enabled and no interactive approvals.

Local bind probes may also need that host approval. A port check cannot reserve a
socket throughout an agent's implementation work: an unrelated service can start
after the check and before the agent starts its server. Preserve any affected run
as an infrastructure confound, including retries and timing; do not treat that
cost as evidence against the skill or terminate the unrelated service. The
renderer separately verifies ownership through a unique content sentinel before
capturing screenshots.

The model is explicitly selected at preparation; it is never silently substituted.
The 720-second wall limit applies equally to implementation execution. Each
dependency setup command has 180 seconds; each post-run validation command has
120 seconds. Catalog-only exec probes and behavior-probe subprocesses each have
120 seconds. These separate budgets are identical across configurations, and their
commands and timings are retained separately from implementation timing. The CLI
does not expose a verified total-token cap here: report actual observed token
usage, rather than claiming a token-controlled experiment. Parallelism can affect
latency; use the same worker count across both stages.

You can select `--variant candidate --case harbor-vue-operations` on `run` or
`render` while diagnosing infrastructure. Do not omit other conditions from the
final comparison. Completed and failed trial records are preserved on rerun.

## Review, repeat, and decide

`render` starts each completed workspace locally, captures the prescribed desktop
and mobile widths, and writes images to `blind/<case>/<trial-id>/`. Each width has
a full-page image (`1440.png`, for example) and a legible top-of-page viewport
image (`1440-viewport.png`). It also records
page errors, horizontal dimensions, landmark counts, and broken images. These
observations are **not** an accessibility audit or a design score. Inspect agent
screenshots and operate each flow described in the private scenarios as well.
`--verify-behavior` additionally runs the independent [browser probes](verify_browser.py)
against each served result and saves their raw observations privately. A selector
that cannot locate a redesigned control requires manual review, not an invented
pass. Inspect these records before assigning technical scores.
Server, screenshot, and behavior-probe execution errors retain `render-error.json`
and cause a nonzero render exit after cleanup. A completed behavior report can still
contain failing or manual-review checks; process completion never means quality acceptance.
Booking checks require observed validation feedback and visible announced/focused
service-error feedback with a usable retry action, without prescribing error wording.

For automated accessibility evidence, add `--axe-script /absolute/path/to/axe.min.js`
alongside `--verify-behavior`. Use the same pinned script across every condition.
The verifier records its version, file hash, violations, and incomplete checks;
incomplete checks require review and are not passes. The script is external test
tooling, not a dependency shipped with the skill.

1. Give the blind images and user brief to a reviewer without the condition key or
   skill texts. Rate each design criterion in `cases.json` from 1 (fails the brief)
   to 5 (strong execution), recording concrete visual evidence. Compare desktop
   and mobile together. Preserve ties and uncertainty.
2. Independently exercise the technical scenarios: keyboard paths, errors,
   loading, recovery, filtering, navigation, overflow, zoom/reflow, motion, and
   applicable indexing/metadata. Record pass/fail/unverified per scenario with
   evidence. Check source maintainability separately. A screenshot cannot prove
   a working interaction or WCAG conformance.
3. Review the raw traces for unnecessary questions, unrequested redesign, stack
   changes, unsupported completion claims, actual screenshot inspection, time,
   and observed tokens. Keep process failures and verification gaps visible.
4. Reveal the key only after design ratings are fixed. Choose the two strongest
   initial configurations based on results across both public and product UI;
   a critical functional regression prevents promotion. Save the reasoning in a
   Markdown file, then create the eight finalist repetitions:

```bash
python3 evals/frontend-craft/evaluate.py finalists \
  --root /tmp/frontend-craft-pilot \
  --variants candidate anthropic-vercel \
  --rationale /tmp/frontend-craft-finalists.md

python3 evals/frontend-craft/evaluate.py run \
  --root /tmp/frontend-craft-pilot --stage repeat --workers 4

python3 evals/frontend-craft/evaluate.py render \
  --root /tmp/frontend-craft-pilot --stage repeat --verify-behavior
```

The two example finalists above are placeholders, not a predetermined winner.
Repeat blind review with fresh implementations from the same starters. Promote
the custom candidate only when repeated comparisons show a design advantage in
both expressive and operational work without material technical regressions. If
the result is equivalent or uncertain, retain the simpler upstream combination
and keep the custom skill as an opt-in candidate. This small pilot supplies
practical evidence, not statistical proof.

Each trial retains `prompt.md`, exact command arguments, raw stdout JSONL, stderr,
final response, process status, token usage, build output, Git diff, untracked-file
listing, file hashes, and the actual workspace. `completed` means only that Codex
finished a turn successfully; review determines acceptance. `timed_out`, `failed`,
and `blocked` are separate outcomes. Archive those artifacts before `/tmp` is
cleaned. Keep the full run archive local or in an external artifact store; commit
only the dated findings summary. Check raw logs for local paths or sensitive accidental output before
publishing them; never publish authentication files.

## Activation checks and harness verification

The `activation` entries in `cases.json` are separate from design scoring. Run
each request in a fresh workspace with only the candidate discoverable:

```bash
python3 evals/frontend-craft/evaluate.py activation \
  --root /tmp/frontend-craft-pilot --timeout 180 --workers 4
```

The command passes the actual request and shared tool availability, without the
expected result or rubric. It supplies the matching frozen starter, inserts a
local typo/import defect or a query case-sensitivity defect for the narrow repair
requests, and creates a small SQL-only
fixture for the backend request. No actual PostgreSQL server is assumed. Do not ask the
model whether it _would_ invoke the skill: inspect actual invocation/read events
and subsequent actions. The four initial candidate implementation traces also
supply positive activation evidence.

For negative cases, preserve the named restriction (backend-only, functionality
only, typo only, or import repair). Confirm the skill was not read and no design
workflow or styling changes occurred. A timeout before a decision is unverified,
not a successful non-activation. Record the exact prompt, environment, raw trace,
and observed changes; expected activation and reasons remain reviewer-only.
`activation-observations.json` gathers successful shell commands mentioning the
skill entry point as review evidence. It does not turn a missing read event into
an automatic pass; inspect the retained trace and changes.

```bash
python3 -m unittest discover -s evals/frontend-craft -p 'test_*.py' -v
```

These tests protect the runner's catalog parsing, private-rubric separation,
complete condition matrix, free/distinct actor ports and legacy port handling,
blocking occupied ports before model spend, frozen inputs, and observed
usage accounting. They do not evaluate aesthetic quality.

Run the Chromium regressions for actual validation, retry, alternate error wording,
hidden errors, and stale progress states separately:

```bash
python3 -B evals/frontend-craft/browser_regressions.py -v
python3 -B -m unittest discover -s evals -p 'test_workflow_evaluators.py' -v
```

The second command covers workflow evaluator path guards under optimized Python,
symlink escapes, and scenario-specific research output requirements. Neither suite
launches comparison agents; catalog capability probes are a separate billable check.
