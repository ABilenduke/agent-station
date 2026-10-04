# Feedback: PR #6 — Turn the repo into agent-station: one plugin marketplace for Claude Code and Codex

**Date**: 2026-10-03
**Branch**: feat/agent-station
**Reviewer(s)**: Copilot (copilot-pull-request-reviewer)
**Planning documents**: docs/plans/2026-10-02-agent-station.md

## Items

### 1. Project init is not all-or-nothing when instruction files fail

**Type**: Logic
**File(s)**: station/lib/cli.mjs
**Raised**: "These project files are written before `ensureInstructions` runs. If creating `AGENTS.md` or `CLAUDE.md` then fails, `init` returns an error after settings and TOML have already changed, contradicting the documented all-or-nothing behavior. Preflight or stage every target before committing any project write, with rollback on failure."
**Resolution**: Pending
**Commit**: —

### 2. `worklog join` skips the busy-session guard

**Type**: Logic
**File(s)**: plugins/devflow/src/cli-core.ts
**Raised**: "`join` does not apply the busy-session guard used by `start`. If a session bound to S1 joins S2, `bind()` removes its S1 binding and adds S2, leaving S1 open while subsequent hooks are attributed to S2. Reject joins when any session ID is already bound to a different directory or step."
**Resolution**: Pending
**Commit**: —

### 3. Worklog state directory is trusted without ownership or permission checks

**Type**: Logic
**File(s)**: plugins/devflow/src/state.ts
**Raised**: "The predictable `/tmp/worklog-<uid>` path is trusted without ownership or symlink checks, and the directory/file are created with default modes (commonly 0755/0644). On a shared host, another user can pre-create this path or read `active.json`, exposing workspace paths and session IDs and potentially redirecting state writes. Use a trusted per-user runtime directory or verify ownership/no symlinks and enforce 0700/0600 permissions."
**Resolution**: Pending
**Commit**: —

### 4. Ledger timestamps are not validated against the documented ISO 8601 format

**Type**: Logic
**File(s)**: plugins/devflow/src/ledger.ts
**Raised**: "`Date.parse` accepts timestamps outside the documented `ISO 8601 + offset` contract, such as `2026-10-05` or locale-style dates. `worklog check` therefore accepts malformed ledger data, while the renderer's fixed slicing can emit incorrect timestamps. Require an exact ISO timestamp with `Z` or an explicit offset before parsing it."
**Resolution**: Pending
**Commit**: —

## Summary

Pending.
