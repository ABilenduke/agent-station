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

Standalone skills maintained here and installable globally for Codex (`~/.agents/skills`):
[Bugfix](skills/bugfix/SKILL.md) and [Frontend Craft](skills/frontend-craft/SKILL.md).

The feature workflow skills that replaced BRD Plan, Execute Plan, Review Plan and Research Spike
(removed 2026-10-01) live in the Cylinder Software repositories: `feature-brief`,
`feature-research`, `feature-brd`, `feature-execute` and `feature-review`. Their time ledger,
`worklog`, is in [plugins/devflow](plugins/devflow/README.md).

### Install globally

Run this from the root of this checkout, naming the skill. It refuses to replace an existing
installation, including a dangling symlink:

```bash
skill=bugfix
source="$(pwd -P)/skills/$skill"
target="$HOME/.agents/skills/$skill"
if [ ! -f "$source/SKILL.md" ]; then
  echo "Run this from the copilot-developer repository root with an existing skill name."
elif [ -e "$target" ] || [ -L "$target" ]; then
  echo "An installation already exists at $target; inspect it before changing it."
else
  mkdir -p "$HOME/.agents/skills"
  ln -s "$source" "$target"
fi
```

Codex supports [personal skills and symlinked skill directories](https://learn.chatgpt.com/docs/build-skills).
The symlink uses this checkout as the source: updates take effect here, and moving or deleting the
checkout breaks the link. To uninstall, remove only the symlink after checking its target.

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
