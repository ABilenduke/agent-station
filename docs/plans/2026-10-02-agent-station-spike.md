# agent-station: verification spike (2026-10-02)

Throwaway probes run against a temporary `CODEX_HOME` / `CLAUDE_CONFIG_DIR` with a one-plugin local
marketplace. Claude Code 2.1.287, codex-cli 0.156.1. Nothing from the probes is kept except this note.

## 1. Per-project plugin enablement in Codex: yes

A trusted project's `.codex/config.toml` overrides the user-level switch in both directions:

```toml
[plugins."probe@spike-station"]
enabled = false   # or true
```

`codex mcp list` inside the project reflected the project value; outside it reflected the user value.
The plugin still has to be installed (cached) at user level with `codex plugin add`; there is no
`--scope` flag. **Consequence:** `station init` writes `[plugins."<id>"] enabled = true` into the
project's `.codex/config.toml`, and `station install` installs agent-station plugins in Codex at user
level (they can stay disabled globally and be enabled per project).

## 2. Hook environment in Codex

Codex sets `CLAUDE_PLUGIN_ROOT` and `CLAUDE_PLUGIN_DATA` for plugin hooks (strings in the binary next to
the hook runtime), so `${CLAUDE_PLUGIN_ROOT}` commands work unchanged. Codex hook payloads carry
`session_id`, `turn_id`, `hook_event_name`, `tool_name` (same shape devflow already parses).

devflow's `hook` command already falls back to the harness recorded on the session binding
(`worklog start/join` detects `CLAUDE_CODE_SESSION_ID` vs `CODEX_THREAD_ID`/`CODEX_SESSION_ID`).
**Consequence:** no `--harness auto` code is needed; drop the hard-coded `--harness claude-code` from
`plugins/devflow/hooks/hooks.json` and the binding decides.

## 3. Plugin `.mcp.json` in Codex: loaded, `${VAR}` not expanded at config time

`codex mcp list` showed the plugin's server. `codex mcp get --json` showed `env.PROBE_KEY` stored as the
literal string `${PROBE_KEY}`; whether Codex expands it at launch is unverified (needs a live session).
Codex requires a stdio `command` to be a bare executable name or a contained `./` path.
**Consequence:** servers that need secrets use a bare `bash -c` wrapper that sources
`~/.config/agent-station/secrets.env` and `exec`s the server, which behaves the same in both tools,
instead of `${VAR}` env references.

## 4. Local-path marketplaces and refresh

|                                       | Claude Code                                                               | Codex                                                          |
| ------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Add local path                        | `claude plugin marketplace add <dir>` → source `directory`                | `codex plugin marketplace add <dir>` → `source_type = "local"` |
| Install copies to cache               | yes, `cache/<mkt>/<plugin>/<version>`                                     | yes, `plugins/cache/<mkt>/<plugin>/<version>`                  |
| Pick up edits, versioned plugin       | no (`update` says already latest)                                         | yes, re-running `codex plugin add` re-copies                   |
| Pick up edits, **no `version`**       | yes, `claude plugin update` "refreshed from source" (cache dir `unknown`) | yes, re-run `codex plugin add` (cache dir `local`)             |
| `marketplace upgrade/update` on local | `update` succeeds, does not refresh plugins                               | `upgrade` errors: Git marketplaces only                        |

A project whose `.claude/settings.json` declares `extraKnownMarketplaces.<same name>` with a GitHub
source did not conflict: Claude kept using the user-level folder registration.

**Consequences:**

- agent-station plugins omit `version` (Git installs then track the commit).
- `station install` registers the **local clone path** on this machine; projects declare the GitHub
  source for other machines and teammates.
- `station update` = `claude plugin update <id>` + `codex plugin add <id>` for each agent-station plugin.
