# Feedback: PR #7 — Support GitHub Copilot CLI

**Date**: 2026-10-03
**Branch**: feat/copilot-cli-support
**Reviewer(s)**: Copilot (copilot-pull-request-reviewer)
**Planning documents**: none

## Items

### 1. Copilot machine-scope commands pick up repository settings from the working directory

**Type**: Logic
**File(s)**: station/lib/machine.mjs
**Raised**: "Run Copilot's machine-scope commands from a neutral working directory. Current Copilot CLI includes repository-level `extraKnownMarketplaces` from `.github/copilot/settings.json` in this list, so invoking `station install`, `update`, or `doctor` inside an initialized project can mistake that project declaration for the user-level local marketplace. Installation may then skip registering `catalog.repo`, while update/doctor can report a machine setup that only exists in the current project. Ensure all Copilot marketplace/plugin queries and mutations use a cwd without repository settings, such as `deps.home`."
**Resolution**: Pending
**Commit**: —

### 2. README overstates Copilot support

**Type**: Documentation
**File(s)**: README.md
**Raised**: "This overstates Copilot support: `provide` filters every non-`agent-station` plugin for Copilot, while the `base` profile includes `context7@claude-plugins-official`. Clarify that Copilot installs only the profile's local `agent-station` plugins. This issue also appears on line 62 of the same file."
**Resolution**: Pending
**Commit**: —
