# copilot-developer → agent-station

## Context

The repo was built as a GitHub Copilot resource catalog. Copilot is no longer used; Claude Code and Codex are (maybe Gemini/Grok later). The goal is one place to manage skills, agents, hooks, MCP servers and CLIs, so that work is written once and **any project can be set up quickly with skills already built**, by any of those tools. Team use may come later.

**Today's problems (from inventory):**
- **Duplicated skills that have drifted.** research-memory and notebooklm each have two copies, in `~/.claude/skills` and `~/.agents/skills`, that differ only in "Claude" vs "Codex" wording, and neither copy is in a repo. `bugfix` exists twice in this repo with different content.
- **Claude and Codex see different sets.** Claude sees one set through `~/.claude/skills` (copies plus `devflow` and `jev` symlinks). Codex sees another through `~/.agents/skills` symlinks. The worklog and jev hooks were hand-copied into `~/.codex/hooks.json` with absolute paths.
- **ContentEngine leftovers.** `.claude/` holds 5 skills, 3 agents and a dead hook copied from ContentEngine.
- **About 82 Copilot files** plus the scripts and workflows that build their catalogs.
- **MCP servers configured separately** in `~/.claude.json`, `~/.codex/config.toml` and `.vscode/mcp.json`, with plaintext keys (context7, Obsidian).

**Key verified fact:** Codex 0.156 installs plugins directly from Claude-format git marketplaces. It has `claude-plugins-official` cached, reading `.claude-plugin/plugin.json`, and runs those plugins' `hooks/hooks.json` (trust entries for security-guidance and game-sounds). So **one plugin folder serves both tools**. Gemini can be added later with a `gemini-extension.json` beside `plugin.json`, as the Figma plugin already does.

**Decisions made:**
- The repo becomes a plugin marketplace.
- Copilot content is archived under a tag and converted on demand.
- The repo is renamed `agent-station`.
- ContentEngine leftovers are dropped, keeping only a de-hard-coded `feedback` skill.
- One global `AGENTS.md` is shared by all tools.

## Design

### Success looks like
- **New machine:** clone, then `station install`. Claude and Codex both have your plugins, `worklog` and `station` are on PATH, and global AGENTS.md is linked.
- **New project:** `station init web`. This commits `.claude/settings.json` so Claude, and teammates, get prompted to install the right plugins. It also sets the Codex equivalent and creates an AGENTS.md/CLAUDE.md pair.
- **Editing a skill:** you edit it once, and both tools pick it up after `station update`.
- **Secrets and drift:** no secrets in the repo or in tool configs, and `station doctor` catches drift, broken links and plaintext keys.

### Repo layout
```
agent-station/
├── .claude-plugin/marketplace.json  # one catalog, read by Claude + Codex
├── plugins/
│   ├── devflow/    # worklog CLI + hooks; skills: bugfix, feedback
│   ├── research/   # skills: research-memory, notebooklm; MCP: obsidian-vault
│   └── frontend/   # skills: frontend-craft (+ references, third-party licences)
├── profiles.json   # named plugin sets for projects (may reference official plugins)
├── global/AGENTS.md
├── station/        # station CLI: plain Node ESM, no build step, node --test
├── evals/          # skill eval harness + results (outside plugins → small installs)
├── secrets.env.example
├── docs/           # features/, plans/
└── .github/workflows/  # validate.yml, verify-no-crlf-line-endings.yml
```
`marketplace.json` also lists **jev** with a GitHub source (`ABilenduke/jev-agent-tools`). It stays its own repo.

### Plugin conventions
- **Layout.** Each plugin has `.claude-plugin/plugin.json` plus any of:
  - `skills/<name>/SKILL.md`: Agent Skills standard (`name` + `description`), with an optional `agents/openai.yaml` for Codex UI metadata.
  - `agents/*.md`
  - `hooks/hooks.json`
  - `.mcp.json`
- **Harness-neutral wording.** Skills say "the agent", not "Claude" or "Codex". That one rule removes the research-memory/notebooklm drift.
- **Hooks detect their harness** (`--harness auto`) instead of hard-coding `claude-code`.
- **MCP secrets** use `${VAR}` references only.
- **Compiled CLIs commit `dist/`.** Marketplace installs are git clones and no build step runs. CI fails if `dist/` is stale.

### profiles.json (starting point; you edit freely)
```json
{
  "base":     ["devflow@agent-station", "context7@claude-plugins-official"],
  "web":      ["@base", "frontend@agent-station", "playwright@claude-plugins-official"],
  "laravel":  ["@web", "laravel-boost@claude-plugins-official"],
  "research": ["research@agent-station"]
}
```
context7, playwright and laravel-boost already exist as official plugins, so they are referenced rather than re-wrapped. Project-specific MCP commands, such as laravel-boost through `docker compose exec`, stay in that project's `.mcp.json`.

### station CLI
Lives in `station/station.mjs` with `station/lib/*.mjs`. All commands are idempotent, back up before replacing anything, and merge JSON instead of overwriting it.
- **`install`**
  - Registers the marketplace in Claude (`claude plugin marketplace add`) and Codex (`codex plugin marketplace add`), and installs the `base` profile at user scope in both.
  - Links `~/.local/bin/{station,worklog}`.
  - Links `global/AGENTS.md` to `~/.codex/AGENTS.md` and `~/.gemini/GEMINI.md`. Writes `~/.claude/CLAUDE.md` as `@<repo>/global/AGENTS.md`, backing up the stale file.
  - Creates `~/.config/agent-station/secrets.env` (chmod 600) from the example if it's missing, and prints the `.bashrc` source line rather than editing `.bashrc`.
- **`init <profile|plugin…> [--dir .]`**
  - Resolves the profile, then merges `extraKnownMarketplaces` (the agent-station GitHub source) and `enabledPlugins` into `<dir>/.claude/settings.json`.
  - Codex: per Phase 0 result 1.
  - Creates `AGENTS.md` plus `CLAUDE.md` (`@AGENTS.md`) only when neither exists.
  - Prints what changed.
- **`update`** refreshes the marketplace and plugins in both tools.
- **`list`** shows plugins (skills, hooks, MCP) and profiles.
- **`doctor`** checks for:
  - broken symlinks in `~/.claude/skills`, `~/.agents/skills` and `~/.local/bin`
  - the same skill name in more than one location
  - plaintext key-like values in `~/.claude.json` and `~/.codex/config.toml` MCP entries
  - the marketplace missing from either tool
  - a missing or stale devflow `dist/`
- **`validate`** (also run in CI) checks:
  - marketplace and plugin manifests parse, and every listed local plugin exists
  - each SKILL.md `name` matches its directory and has a description
  - profile references resolve
  - no secret-looking strings are committed

## Implementation

**Phase 0: verification spike.** This is throwaway and nothing is committed. Results go in `docs/plans/2026-10-02-agent-station-spike.md`.
1. Does Codex honour per-project plugin enablement, for example `[plugins."x@y"] enabled` in a trusted project's `.codex/config.toml`? If not, Codex installs profile plugins at user scope and `init` says so.
2. What environment does Codex give plugin hooks (`CLAUDE_PLUGIN_ROOT`? a Codex marker?)? The answer drives devflow's `--harness auto`. superpowers' `hooks/session-start` shows the env-sniffing pattern.
3. Does Codex load a plugin's `.mcp.json`, and does it expand `${VAR}`?
4. Local-path marketplace in both tools: does `marketplace update` pick up local edits? Does a same-named local registration conflict with a project's GitHub-source `extraKnownMarketplaces`? The answer decides whether `install` registers the local clone path or `ABilenduke/agent-station`.

**Phase 1: archive and clear.** Work on branch `feat/agent-station`, cut from the current committed HEAD.
1. Save this plan as `docs/plans/2026-10-02-agent-station.md`.
2. Tag `copilot-archive` at the pre-deletion HEAD and push the tag.
3. Delete the Copilot material:
   - `agents/`, `prompts/`, `instructions/`, `toolkits/`, `.schemas/`, `scripts/`, `README.{agents,instructions,prompts,toolkits}.md`
   - `.github/copilot-instructions.md`, `.github/pull_request_template.md`, `.github/workflows/{validate-readme,contributors}.yml`
   - `.all-contributorsrc`, `.vscode/{settings,tasks,mcp}.json`
   - the all-contributors dependencies and scripts in `package.json`
4. Delete the ContentEngine leftovers:
   - `.claude/skills/{ai-agent-patterns,bugfix,documentation-maintenance,skill-builder}`
   - `.claude/agents/*`, `.claude/hooks/`
   - the PostToolUse hook in `.claude/settings.json` (keep the attribution settings)
5. Delete `tests/skills/{brd-plan,execute-plan,research-spike,review-plan}`, `docs/runbooks/skills-guide.md`, and the empty `.agents/` and `.codex/`.

**Phase 2: plugins.**
1. Write `.claude-plugin/marketplace.json` (devflow, research, frontend, and jev from GitHub).
2. **devflow**
   - Move `skills/bugfix` into `plugins/devflow/skills/`.
   - Move `.claude/skills/feedback` there too. Replace the hard-coded `--repo ABilenduke/content-engine` with `gh repo view --json nameWithOwner`, and drop references to deleted skills.
   - Add `--harness auto` to the hook path in `src/cli.ts` and `src/hook.ts` (per spike item 2), and switch `hooks/hooks.json` to it.
   - Stop ignoring `dist/` in `.gitignore`/`.prettierignore` and commit it (`dist-test/` stays ignored).
   - Bump to 0.2.0.
3. **research**
   - Import research-memory and notebooklm from `~/.claude/skills`, using harness-neutral wording.
   - Leave out the `*-workspace` eval output.
   - Add `.mcp.json` for `obsidian-vault` (`uvx mcp-obsidian`, `${OBSIDIAN_API_KEY}`/`HOST`/`PORT`).
4. **frontend:** move `skills/frontend-craft` with its references and licences.
5. **evals:** move `tests/skills/{bugfix,frontend-craft}` and `test_workflow_evaluators.py` to `evals/`, and fix the paths inside `evaluate.py`.
6. **jev prerequisite:** in the jev-agent-tools repo, commit `dist/`, because its hook runs `dist/hooks/skill-suggest.js`. That is a separate commit in that repo.

**Phase 3: station CLI.**
1. Implement the commands above with `node --test` tests. Each test uses a temporary HOME and stubbed `claude`/`codex` binaries on PATH.
2. Root `package.json`:
   - name `agent-station`, `bin.station`
   - scripts: `test` (station + devflow), `validate`, `lint`, `format`
3. Update `.prettierrc.json`, `.eslintrc.cjs` and the ignore files for the new paths.
4. Add `global/AGENTS.md` (starter content for you to fill in) and `secrets.env.example`.

**Phase 4: rename and migrate this machine.** Each step backs up first. The outward-facing steps are confirmed with you at the time.
1. Rename the repo:
   - `gh repo rename agent-station` (GitHub redirects the old URL)
   - `git remote set-url`
   - move the checkout to `~/code/abilenduke/agent-station`
   - move the Claude project memory directory to the new path key
2. Remove the hand-made wiring that plugins replace:
   - `~/.claude/skills/{devflow,jev,notebooklm,research-memory}`
   - `~/.agents/skills/{bugfix,jev-tools,notebooklm,research-memory}`
   - the worklog and jev entries in `~/.codex/hooks.json`
   - `~/.local/bin/worklog` (relinked by `install`)
   - Leave the `*-workspace` eval directories and third-party skills alone.
3. Move secrets into `secrets.env`:
   - context7 key: from `~/.claude.json` args. Replace that user-level server with `context7@claude-plugins-official` from the `base` profile.
   - Obsidian key: from `~/.codex/config.toml`.
   - `OPENAI`/`TYPESAFE` exports: from `.bashrc`.
4. Run `station install`, then pilot `station init laravel` in content-engine on a branch.

**Phase 5: docs and CI.**
1. Rewrite `README.md` with:
   - what agent-station is
   - quick starts for a new machine, a new project, and adding a skill
   - the plugin catalog and profiles
   - how to add Gemini later
2. Add `.github/workflows/validate.yml`: `station validate`, devflow tests, and the `dist/` freshness check. Keep the CRLF workflow.

## Verification
- `npm test` passes (station and devflow). `node station/station.mjs validate` and `claude plugin validate .` pass.
- **Claude:**
  - a new session's `/plugin` lists devflow, research, frontend and jev from agent-station
  - `claude plugin details devflow@agent-station` shows the bugfix and feedback skills and the hooks
- **Codex:**
  - `codex plugin list` shows the agent-station plugins
  - a "fix this bug" prompt surfaces the bugfix skill
  - start a worklog, run one prompt, and `time.jsonl` records `harness: codex`
- **Project:**
  - in a scratch directory, `station init web` writes the marketplace and `enabledPlugins`, plus AGENTS.md and CLAUDE.md
  - opening Claude there prompts to install
  - re-running produces no duplicates or diffs
- **Doctor:**
  - clean on this machine after migration
  - a test with a temporary HOME flags a planted broken symlink, a duplicate skill and a plaintext key
- **GitHub:**
  - the `copilot-archive` tag exists on the remote
  - the old `ABilenduke/copilot-developer` URL redirects to `agent-station`
