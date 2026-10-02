# Awesome GitHub Copilot Resources 🚀

[![GitHub license](https://img.shields.io/github/license/abilenduke/copilot-developer)](./LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/abilenduke/copilot-developer?style=social)](https://github.com/abilenduke/copilot-developer/stargazers)
[![GitHub last commit](https://img.shields.io/github/last-commit/abilenduke/copilot-developer)](https://github.com/abilenduke/copilot-developer/commits/main)
[![All Contributors](https://img.shields.io/badge/all_contributors-0-orange.svg?style=flat-square)](#contributors-)

A curated list of high-quality instructions, agents, prompts, and toolkits for mastering GitHub Copilot.

---

## Table of Contents

- [What Are These Resources?](#what-are-these-resources)
- [How to Use](#how-to-use)
- [Codex Skills](#codex-skills)
- [Repository Structure](#repository-structure)
- [Resources](#resources)
  - [Prompts](#prompts)
  - [Instructions](#instructions)
  - [Agents](#agents)
  - [Toolkits](#toolkits)
- [Contributing](#contributing)
- [License](#license)
- [Contributors](#contributors)

## What Are These Resources?

This repository contains a toolkit of configuration files that enhance and customize your GitHub Copilot experience.

- **Instructions (`.instructions.md`)**: Provide contextual guidance for Copilot's behavior. They are perfect for setting project-specific rules, like code style or review guidelines.
- **Prompts (`.prompt.md`)**: Reusable, shareable prompts that can be invoked with a `/` command in Copilot Chat. They help you perform common tasks quickly and consistently.
- **Agents (`.agent.md`)**: Custom "personalities" or expert agents for Copilot Chat. You can create agents like a "Security Expert" or a "Refactoring Specialist" to get more focused answers.
- **Toolkits (`.toolkit.yml`)**: Bundles of prompts, instructions, and agents that can be shared and used together.

## How to Use

To use any of the resources from this toolkit in your own project, start with these steps:

1. **Browse the catalog** below and pick the prompts, instructions, agents, or toolkits that fit your workflow.
2. **Copy the file** into your repository's `.github/copilot/` directory (create it if it doesn't exist yet).
3. **Customize the front matter** and any placeholder content so the resource matches your project or team guidelines.
4. **Commit and push** the changes, then reopen Copilot Chat to start using your new configuration.

The directory structure should look like this:

```plaintext
.github/
└── copilot/
    ├── prompts/
    │   └── example.prompt.md
    ├── instructions/
    │   └── style-guide.instructions.md
    ├── agents/
    │   └── refactoring-specialist.agent.md
  └── toolkits/
    └── team-starter.toolkit.yml
```

## Repository Structure

- `prompts/` – Shareable prompt files ready to drop into Copilot Chat.
- `instructions/` – Behavioral guardrails that tune Copilot for specific projects or workflows.
- `agents/` – Persona definitions that transform Copilot into focused specialists.
- `toolkits/` – Bundles of prompts, instructions, and agents for quick onboarding.
- `scripts/` – Helper scripts for generating README overviews and validating toolkits.
- `skills/` – Standalone Codex skills maintained here and installable globally.
- `plugins/devflow/` – `worklog`, a time ledger for feature work, and the Claude Code and Codex hooks
  that feed it. See its [README](plugins/devflow/README.md).

Each top-level directory includes (or will include) focused README files with extra guidance and examples.

## Codex Skills

> **Being replaced (2026-10-01).** BRD Plan, Execute Plan, Review Plan and Research Spike are
> superseded by the `feature-brief`, `feature-research`, `feature-brd`, `feature-execute` and
> `feature-review` skills, which live in the Cylinder Software repositories. Implicit invocation of
> the four is switched off; they will be removed after the new workflow's pilot.

[BRD Plan](skills/brd-plan/SKILL.md) turns planning and requirements requests into one business
requirements document (BRD) with technical approach, acceptance criteria, and delivery steps. It
inspects existing context, then asks small rounds of consequential follow-up questions. It works
across repositories without a feature catalog, companion skill, or connector.

[Execute Plan](skills/execute-plan/SKILL.md) implements an existing BRD, chat plan, ordinary Markdown
plan, or usable legacy plan. It checks the resulting behavior and maintains a concise journal for
review and resumption. Both skills are standalone; neither requires the other to be installed.

### Install globally

Run this from the root of this checkout. The command refuses to replace an existing installation,
including a dangling symlink:

```bash
brd_source="$(pwd -P)/skills/brd-plan"
brd_target="$HOME/.agents/skills/brd-plan"
if [ ! -f "$brd_source/SKILL.md" ]; then
  echo "Run this from the copilot-developer repository root."
elif [ -e "$brd_target" ] || [ -L "$brd_target" ]; then
  echo "An installation already exists at $brd_target; inspect it before changing it."
else
  mkdir -p "$HOME/.agents/skills"
  ln -s "$brd_source" "$brd_target"
fi
```

Install Execute Plan from the same checkout with its own collision check:

```bash
execute_source="$(pwd -P)/skills/execute-plan"
execute_target="$HOME/.agents/skills/execute-plan"
if [ ! -f "$execute_source/SKILL.md" ]; then
  echo "Run this from the copilot-developer repository root."
elif [ -e "$execute_target" ] || [ -L "$execute_target" ]; then
  echo "An installation already exists at $execute_target; inspect it before changing it."
else
  mkdir -p "$HOME/.agents/skills"
  ln -s "$execute_source" "$execute_target"
fi
```

Codex supports [personal skills and symlinked skill directories](https://learn.chatgpt.com/docs/build-skills).
The symlink uses this checkout as the source: updates take effect here, and moving or deleting the
checkout breaks the link. To uninstall, remove only the symlink after checking its target.

### Use BRD Plan

```text
Use $brd-plan to plan project search. Investigate the current implementation and clarify the scope.

Use $brd-plan to revise docs/plans/2026-09-15-project-search.md: remove CSV export.
```

The skill is eligible for automatic selection on planning, BRD, and requirements-discovery requests;
explicit `$brd-plan` invocation is the reliable way to select it. It complements Codex's native Plan
Mode and does not change modes or replace `/plan`.

In native Plan Mode, the plan stays in chat and follows the host's required plan format. When file
writes are allowed, a planning request authorizes saving to your explicit destination or an existing
repository convention, falling back to `docs/plans/YYYY-MM-DD-<topic>.md`. An explicit chat-only request
takes precedence. Planning status is **Draft**, **Ready**, or **Discovery needed**; Ready describes a
complete handoff, and approval is recorded only when actually given.

Check `/skills` or type `$brd-plan` in a fresh Codex session from another repository. Restart Codex if
the skill is not listed after installation. The original `.claude/skills/plan` and its execution
workflow remain separate; the single BRD is not a drop-in input to that legacy executor.

See the [evaluation protocol and results](tests/skills/brd-plan/README.md) for the regression scenarios
and the limits of the checks performed.

### Use Execute Plan

```text
Use $execute-plan to implement docs/plans/2026-09-15-project-search.md.

Use $execute-plan to resume that plan. Reconcile its journal with the current code and scope.

Use $execute-plan to implement the plan we agreed on in this conversation.
```

The BRD is a direct handoff: requirement IDs and delivery steps carry through into implementation and
verification. No conversion into a feature catalog or split documents is needed. The executor inspects
actual readiness; a Ready label alone is neither sufficient evidence nor permission to implement.

Execution uses the current workspace and preserves unrelated staged and unstaged edits. By default,
it leaves verified changes ready for review. Commits, pushes, PRs, ticket updates, and deployments
follow explicit user instructions, including authorization already given. Checks scale to the change;
failed prerequisites remain incomplete while independent authorized work continues.

For a file plan, the journal is saved beside it as `<plan-stem>.execution.md`. Chat-only plans use the
repository convention or `docs/plans/YYYY-MM-DD-<topic>.execution.md`. Resume requests reuse the journal
and reconcile current plan, code, working tree, and evidence. Execution status is **In progress**,
**Blocked**, **Verification incomplete**, or **Complete**, separate from BRD planning status. Required
checks that fail or cannot run prevent a Complete claim.

In native Plan Mode, the skill provides a read-only readiness assessment and execution proposal, with
no source, journal, or Git changes. Implicit selection targets implementing or resuming an existing
plan; ordinary coding and plan-review requests retain their workflow. Explicit `$execute-plan` selects
the skill reliably. Check discovery from a fresh Codex session in another repository after installation.

The original `.claude/skills/execute` and `.claude/agents/plan-executor.md` remain available separately.
See [Execute Plan evaluation methods and evidence](tests/skills/execute-plan/README.md) for actual
fixture outcomes and native-client coverage limits.

### Use Review Plan

[Review Plan](skills/review-plan/SKILL.md) checks delivered work against its current plan, including
acceptance coverage, regressions, and claims in an execution journal. It accepts BRDs and ordinary
plans without requiring either planning or execution skill to be installed.

```text
Use $review-plan to review the current implementation against docs/plans/project-search.md.
Include staged, unstaged, and relevant new files. Report findings without fixing them.
```

The default output is a chat review with findings, requirement coverage, actual verification evidence,
and a conclusion: **Changes needed**, **Verification incomplete**, or **No findings**. The skill
preserves source files, plans, journals, and Git state; it saves a report only when requested and
permitted by the active mode. A review does not authorize fixes or publishing PR comments.

Install globally from this repository root:

```bash
review_source="$(pwd -P)/skills/review-plan"
review_target="$HOME/.agents/skills/review-plan"
if [ ! -f "$review_source/SKILL.md" ]; then
  echo "Run this from the copilot-developer repository root."
elif [ -e "$review_target" ] || [ -L "$review_target" ]; then
  echo "An installation already exists at $review_target; inspect it before changing it."
else
  mkdir -p "$HOME/.agents/skills"
  ln -s "$review_source" "$review_target"
fi
```

The workflow is `$brd-plan` → `$execute-plan` → `$review-plan`, with each skill independently usable.
Implicit selection targets reviewing implementation against an existing plan. Reviewing only a plan's
design or doing a general code review without a plan retains its original workflow. See the
[review evaluation evidence](tests/skills/review-plan/README.md).

### Use Bugfix

[Bugfix](skills/bugfix/SKILL.md) investigates a reported defect, establishes its cause, applies a
focused correction, and verifies the regression. It discovers the repository's actual contracts and
checks without requiring a feature catalog, ticket, or companion skill.

```text
Use $bugfix to fix retries=0 being replaced by the default retry count.

Use $bugfix to diagnose this intermittent failure only. Do not change code yet.
```

It uses the current workspace, preserves unrelated edits and staged state, and leaves changes ready
for review. Branches, commits, tickets, PRs, and deployment follow explicit instructions. Diagnosis-only
requests and native Plan Mode remain read-only. It distinguishes **Fixed and verified**, **Verification
incomplete**, and **Blocked**, and reports when the behavior was already correct.

Small fixes need no extra document. A requested durable report follows the explicit destination or
repository convention, falling back to `docs/bugs/YYYY-MM-DD-<topic>.md`. The legacy Claude bugfix
workflow remains separate. See [evaluation evidence](tests/skills/bugfix/README.md).

Install from this repository root:

```bash
bugfix_source="$(pwd -P)/skills/bugfix"
bugfix_target="$HOME/.agents/skills/bugfix"
if [ ! -f "$bugfix_source/SKILL.md" ]; then
  echo "Run this from the copilot-developer repository root."
elif [ -e "$bugfix_target" ] || [ -L "$bugfix_target" ]; then
  echo "An installation already exists at $bugfix_target; inspect it before changing it."
else
  mkdir -p "$HOME/.agents/skills"
  ln -s "$bugfix_source" "$bugfix_target"
fi
```

### Use Research Spike

[Research Spike](skills/research-spike/SKILL.md) resolves a focused technical uncertainty before
implementation. It investigates repository evidence, consults authoritative sources when needed, and
runs small disposable experiments that can change the decision.

```text
Use $research-spike to investigate whether our current import parser supports quoted multiline fields.

Use $research-spike to compare these integration options against our existing authentication constraints.

Use $research-spike to resume docs/spikes/import-parser.md after the dependency upgrade.
```

The output records the question and constraints, traceable findings, recommendation and tradeoffs,
remaining uncertainty, and next steps. Outcomes are **Answered**, **Conditional**, or **Unresolved**;
successful prototypes do not imply production readiness. Supplied time/cost limits are honored, but
invented estimates and mandatory interview rounds are avoided.

When writes are allowed, the report follows an explicit destination or repository convention, falling
back to `docs/spikes/YYYY-MM-DD-<topic>.md`. Chat-only requests and native Plan Mode keep the report in
chat. Experiments preserve production source, dependency files, and Git state. No tickets, commits,
PRs, deployments, or implementation changes happen automatically. Reports can inform `$brd-plan`
without requiring it, another research tool, or a connector. The original Claude research workflow
remains available separately. See [evaluation evidence](tests/skills/research-spike/README.md).

Install globally from this repository root:

```bash
spike_source="$(pwd -P)/skills/research-spike"
spike_target="$HOME/.agents/skills/research-spike"
if [ ! -f "$spike_source/SKILL.md" ]; then
  echo "Run this from the copilot-developer repository root."
elif [ -e "$spike_target" ] || [ -L "$spike_target" ]; then
  echo "An installation already exists at $spike_target; inspect it before changing it."
else
  mkdir -p "$HOME/.agents/skills"
  ln -s "$spike_source" "$spike_target"
fi
```

### Use Frontend Craft

[Frontend Craft](skills/frontend-craft/SKILL.md) designs, builds, refines, and critiques web interfaces.
It is framework agnostic, with HTML, CSS, accessibility, and applicable public-page SEO treated as
core concerns. It distinguishes expressive sites, content pages, operational interfaces, and reusable
components, preserves existing systems, and iterates autonomously from rendered evidence.

```text
Use $frontend-craft to improve this Vue settings screen while preserving its tokens and behavior.

Use $frontend-craft to build a distinctive public page from this brief and the supplied assets.

Use $frontend-craft to review this interface. Report visual and technical findings without editing.
```

The skill separates visual critique from technical verification. It uses available browser tooling
and reports unverified behavior honestly. It adds no runtime or hooks, requires no particular CSS
library, and makes imagery or alternative directions conditional on the task. Purely functional fixes
do not require a design workflow. Automatic discovery is enabled by default; explicit invocation
selects the skill reliably when it is installed.

**Adoption status:** evaluated, not promoted. The [recorded pilot](tests/skills/frontend-craft/results/2026-09-15.md)
did not demonstrate the required advantage across expressive sites and product interfaces. The
candidate's Vue result was unfinished at the execution limit. Keep existing global defaults;
this skill remains available for isolated experiments. See [the benchmark protocol](tests/skills/frontend-craft/README.md)
for repeatable comparisons and the adoption rule.

For a trial, copy or symlink only this skill into a disposable project's `.agents/skills/` and exclude
other general design skills from that evaluation session. Do not assume identically named skills
override one another. After adoption, install globally from this checkout using the same collision
check as the other skills:

```bash
craft_source="$(pwd -P)/skills/frontend-craft"
craft_target="$HOME/.agents/skills/frontend-craft"
if [ ! -f "$craft_source/SKILL.md" ]; then
  echo "Run this from the copilot-developer repository root."
elif [ -e "$craft_target" ] || [ -L "$craft_target" ]; then
  echo "An installation already exists at $craft_target; inspect it before changing it."
else
  mkdir -p "$HOME/.agents/skills"
  ln -s "$craft_source" "$craft_target"
fi
```

Retain one general design authority in the active configuration. Preserve competing installations
for comparison; use Codex's per-skill configuration to disable their exact entrypoints when needed,
then check discovery in a fresh session. Cylinder belongs in its owning project's `.agents/skills/`,
with its project conventions; it should not impose Cylinder tokens on unrelated work. Preserve its
files when removing global discovery and do not relocate it into this resource repository.

See [pinned source provenance and notices](skills/frontend-craft/references/sources.md) for upstream
influences. The comparison protocol covers native Codex, Anthropic plus Vercel, Impeccable, and this
candidate with fixed fixtures, consistent resources, and separate visual and technical judgments.

## Resources

### Prompts

Reusable `/slash` commands for Copilot Chat. Browse the `prompts/` folder to copy existing prompts or submit your own via the [contribution guidelines](#contributing).

### Instructions

Project or domain-specific rules that keep Copilot aligned with your standards. Drop files from `instructions/` into `.github/copilot/` to make them active.

### Agents

Custom personas—like "Security Expert" or "Refactoring Specialist"—that reshape Copilot’s responses. Find them in `agents/`.

### Toolkits

Curated bundles of prompts, instructions, and agents you can import all at once. Explore the `toolkits/` folder as it grows.

### Featured Starting Points

- **[![Copilot Prompts](https://img.shields.io/badge/Copilot-Prompts-228B22?style=for-the-badge&logo=githubcopilot&logoColor=white)](README.prompts.md)** – Focused, task-specific prompts for generating code, documentation, and solving specific problems.
- **[![Copilot Instructions](https://img.shields.io/badge/Copilot-Instructions-00BFA6?style=for-the-badge&logo=githubcopilot&logoColor=white)](README.instructions.md)** – Comprehensive coding standards and best practices that apply to specific file patterns or entire projects.
- **[![Copilot Agents](https://img.shields.io/badge/Copilot-Agents-FFB400?style=for-the-badge&logo=githubcopilot&logoColor=white)](README.agents.md)** – Specialized AI personas and conversation modes for different roles and contexts.
- **[![Copilot Toolkits](https://img.shields.io/badge/Copilot-Toolkits-FF6FA5?style=for-the-badge&logo=githubcopilot&logoColor=white)](README.toolkits.md)** – Curated toolkits of related prompts, instructions, and agents organized around specific themes and workflows.

Need inspiration?

- Browse `README.prompts.md`, `README.instructions.md`, and `README.agents.md` for curated highlights as the catalog expands.
- Check the `toolkits/` directory for ready-to-use bundles when onboarding new teammates.
- Run `npm run toolkit-validate` to confirm toolkit manifests stay in sync after edits.

## Contributing

We welcome new resources, improvements, and documentation updates:

1. Read the [Code of Conduct](./CODE_OF_CONDUCT.md) to keep contributions friendly and inclusive.
2. Review existing resource conventions (front matter, naming, formatting) before proposing changes.
3. Open an issue or submit a pull request with your new prompt, instruction, agent, or toolkit.
4. Update the relevant README files or scripts if your change adds new capabilities.

If you’re unsure where to start, check open issues or propose a new idea—maintainers are happy to help.

## License

This project is licensed under the [MIT License](./LICENSE).

## Contributors

Thanks to everyone contributing new Copilot superpowers! This project follows the [all-contributors](https://allcontributors.org/) specification—run `npx all-contributors add` to recognize new collaborators.
