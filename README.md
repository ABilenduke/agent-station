# agent-station

One place for the skills, agents, hooks, MCP servers and CLIs I use with coding agents. It is a plugin
marketplace that **Claude Code, Codex and GitHub Copilot CLI all install from directly**, plus a small `station` CLI that
sets up a machine or a project in one command.

Write a skill once, in the [Agent Skills](https://agentskills.io) format, and every tool gets the same
copy.

## Plugins

| Plugin     | Skills                          | Also                                                    |
| ---------- | ------------------------------- | ------------------------------------------------------- |
| `devflow`  | `bugfix`, `feedback`            | `worklog` CLI and time-ledger hooks for feature steps   |
| `research` | `research-memory`, `notebooklm` | `obsidian-vault` MCP server                             |
| `frontend` | `frontend-craft`                |                                                         |

Profiles in [`profiles.json`](profiles.json) group these with plugins from other marketplaces:

| Profile    | Plugins                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| `base`     | devflow, context7 (installed on every machine)                               |
| `web`      | base + frontend, playwright                                                  |
| `laravel`  | web + laravel-boost                                                          |
| `research` | research, obsidian (kepano/obsidian-skills)                                  |

`station list` prints the current set.

## Set up a machine

```bash
git clone git@github.com:ABilenduke/agent-station.git ~/code/abilenduke/agent-station
cd ~/code/abilenduke/agent-station
node station/station.mjs install --dry-run   # preview; anything replaced is backed up first
node station/station.mjs install
```

`install` is safe to re-run. It:

- adds this checkout as the `agent-station` marketplace in Claude Code, Codex and Copilot CLI (each
  one that is installed), and installs the `base` profile in each. Copilot CLI gets only the
  profile's `agent-station` plugins, not ones from other marketplaces such as `context7`;
- links `~/.local/bin/station` and `~/.local/bin/worklog`;
- points every tool at one global instructions file, [`global/AGENTS.md`](global/AGENTS.md):
  `~/.codex/AGENTS.md`, `~/.copilot/copilot-instructions.md` and `~/.gemini/GEMINI.md` link to it and `~/.claude/CLAUDE.md` imports it;
- creates `~/.config/agent-station/secrets.env` (mode 600) from
  [`secrets.env.example`](secrets.env.example). Fill in the keys there.

Then run `station doctor` to check for broken links, skills a tool would load twice, and API keys
left in plain text in `~/.claude.json` or `~/.codex/config.toml`.

## Set up a project

```bash
cd ~/code/some-project
station init web            # any profiles or plugins: station init laravel research
```

This writes, and you commit:

- `.claude/settings.json`: enables the plugins and declares their marketplaces, so Claude Code
  offers to install them for anyone who opens the project;
- `.github/copilot/settings.json`: the same, for Copilot CLI, which installs the plugins itself. It
  lists only the `agent-station` plugins, since Copilot CLI cannot read other marketplaces;
- `.codex/config.toml`: switches the plugins on for this project once Codex trusts it;
- `AGENTS.md` if it is missing, and a `CLAUDE.md` containing `@AGENTS.md`, so all tools share one
  set of project instructions. A project that already has its own `CLAUDE.md` is left alone.

Codex has no per-project install, so `init` also installs the plugins for your user. Plugins it
installs for the first time, unless they are in the `base` profile, are switched off everywhere
except projects that enable them. `init` works out every change first and writes nothing if any
file cannot be edited safely.

## Add or change a skill

1. Create `plugins/<plugin>/skills/<name>/SKILL.md` with `name` (matching the folder) and a
   `description` that says when to use it. Write "the agent", not "Claude" or "Codex". An optional
   `agents/openai.yaml` sets how Codex displays it.
2. `npm run validate`, then commit.
3. `station update`. Both tools keep their own copy of each plugin: Claude Code per commit, so it
   picks up committed changes, in every project that installed them; Codex re-copies the working
   tree. Plugins you had switched off in Codex stay off.

A new plugin is a folder with `.claude-plugin/plugin.json` (no `version`, so installs track commits),
an entry in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json), and usually a
place in a profile.

### MCP servers and secrets

Plugins declare MCP servers in `.mcp.json`. Secrets never go there: Codex does not expand `${VAR}`
in plugin MCP config. Instead the server is started through `bash`, which reads the secrets file,
exports only the values that server needs, and hands over to a pinned version of the real command:

```json
{
  "command": "bash",
  "args": [
    "-c",
    ". \"$HOME/.config/agent-station/secrets.env\" || exit 1; export OBSIDIAN_API_KEY OBSIDIAN_HOST OBSIDIAN_PORT; exec uvx mcp-obsidian@0.2.3"
  ]
}
```

`station validate` rejects `${...}` in `.mcp.json` and anything that looks like a credential in any
committed file.

## How it fits together

- **One catalog, three tools.** Codex and Copilot CLI read Claude Code's `.claude-plugin/` format: plugin manifests,
  `skills/`, `hooks/hooks.json` (with `CLAUDE_PLUGIN_ROOT` set) and `.mcp.json`. Agents in
  `agents/` load in Claude Code only. Copilot CLI loads a local marketplace's plugins live, so
  `station update` only refreshes its catalog. It reads `AGENTS.md` and `CLAUDE.md` in projects.
- **This machine vs others.** `install` registers the local checkout, so committed changes reach
  this machine with `station update` before they are pushed. Projects declare the GitHub source, so
  other machines and teammates install from GitHub. The two coexist under the same marketplace name.
- **Builds are committed.** Plugin installs copy the plugin folder and run no build, so compiled
  code such as `plugins/devflow/dist/` is committed and CI checks it matches the source. Build
  tooling lives at the repository root so plugin folders stay small.
- **Gemini, later.** A plugin becomes a Gemini CLI extension by adding a `gemini-extension.json`
  beside its `plugin.json`; `install` already links `~/.gemini/GEMINI.md` when `~/.gemini` exists.

## `station` commands

```text
install [--dry-run]                       set up this machine
init <profile|plugin>... [--dir <path>]   set up a project (--no-codex skips the Codex install)
update                                    pick up changes to agent-station plugins
list                                      profiles and what each plugin provides
doctor                                    check this machine for drift and loose secrets
validate                                  check this repository (CI runs it)
```

## Develop

```bash
npm ci
npm run check    # lint, format, station and devflow tests, validate, devflow build is current
```

Skill evals live in [`evals/`](evals), outside the plugins so installs stay small.

## History

This repository started as a GitHub Copilot resource catalog (prompts, instructions, agents and
toolkits). That catalog is preserved at the [`copilot-archive`](../../tree/copilot-archive) tag;
pieces come back as skills when they are needed.

## License

[MIT](LICENSE)
