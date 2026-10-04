import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { marketplaceOf, resolve } from './catalog.mjs';
import { setCodexPlugins } from './project.mjs';

export const SECRETS = '.config/agent-station/secrets.env';
const SOURCE_SECRETS = `set -a; . ~/${SECRETS}; set +a`;

export function codexHome(deps) {
  return deps.env.CODEX_HOME || join(deps.home, '.codex');
}

export function claudeHome(deps) {
  return deps.env.CLAUDE_CONFIG_DIR || join(deps.home, '.claude');
}

export function tilde(deps, path) {
  return path.startsWith(`${deps.home}/`) ? `~${path.slice(deps.home.length)}` : path;
}

function stamp(deps) {
  return deps.now().toISOString().replace(/[-:]/g, '').slice(0, 15);
}

/** Runs a tool command, failing loudly on a non-zero exit. */
function call(deps, tool, args, options = {}) {
  const result = deps.run(tool, args, options);
  if (result.code !== 0) throw new Error(`${tool} ${args.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

/** The Claude Code and Codex commands station needs, over each tool's JSON output. */
export const TOOLS = {
  claude: {
    marketplaces: (deps) =>
      JSON.parse(call(deps, 'claude', ['plugin', 'marketplace', 'list', '--json'])).map((m) => m.name),
    plugins: (deps) =>
      JSON.parse(call(deps, 'claude', ['plugin', 'list', '--json'])).map((p) => ({
        id: p.id,
        enabled: p.enabled,
        scope: p.scope,
        projectPath: p.projectPath,
      })),
    addMarketplace: ['plugin', 'marketplace', 'add'],
    install: ['plugin', 'install'],
  },
  codex: {
    marketplaces: (deps) =>
      JSON.parse(call(deps, 'codex', ['plugin', 'marketplace', 'list', '--json'])).marketplaces.map((m) => m.name),
    plugins: (deps) =>
      JSON.parse(call(deps, 'codex', ['plugin', 'list', '--json'])).installed.map((p) => ({
        id: p.pluginId,
        enabled: p.enabled,
      })),
    addMarketplace: ['plugin', 'marketplace', 'add'],
    install: ['plugin', 'add'],
  },
};

export function available(deps, tool) {
  return deps.run(tool, ['--version']).code === 0;
}

/** Where a marketplace is added from: this checkout for agent-station, GitHub for the rest. */
function sourceOf(catalog, market) {
  return market === catalog.name ? catalog.repo : catalog.marketplaces[market];
}

function act(deps, lines, dryRun, description, action) {
  if (dryRun) {
    lines.push(`would: ${description}`);
    return;
  }
  action();
  lines.push(description);
}

function toolCommand(deps, lines, dryRun, tool, args, options = {}) {
  act(deps, lines, dryRun, `${tool} ${args.join(' ')}`, () => call(deps, tool, args, options));
}

/** Adds missing marketplaces and installs missing plugins in one tool, recording each id it installs. */
function provide(catalog, deps, lines, dryRun, tool, ids, added = []) {
  const t = TOOLS[tool];
  const markets = t.marketplaces(deps);
  for (const market of [catalog.name, ...ids.map(marketplaceOf)].filter((m, i, all) => all.indexOf(m) === i)) {
    if (markets.includes(market)) lines.push(`ok: ${tool} has marketplace ${market}`);
    else toolCommand(deps, lines, dryRun, tool, [...t.addMarketplace, sourceOf(catalog, market)]);
  }
  const installed = new Set(t.plugins(deps).map((p) => p.id));
  for (const id of ids) {
    if (installed.has(id)) {
      lines.push(`ok: ${tool} has ${id}`);
      continue;
    }
    toolCommand(deps, lines, dryRun, tool, [...t.install, id]);
    added.push(id);
  }
  return added;
}

function backup(deps, lines, path) {
  const base = `${path}.bak-${stamp(deps)}`;
  let saved = base;
  for (let n = 2; exists(saved); n++) saved = `${base}-${n}`;
  renameSync(path, saved);
  lines.push(`backed up ${tilde(deps, path)} → ${tilde(deps, saved)}`);
}

function exists(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function replacing(path) {
  return exists(path) ? ' (backing up the existing file)' : '';
}

function link(deps, lines, dryRun, path, target) {
  if (exists(path) && lstatSync(path).isSymbolicLink() && readlinkSync(path) === target) {
    lines.push(`ok: ${tilde(deps, path)}`);
    return;
  }
  act(deps, lines, dryRun, `link ${tilde(deps, path)} → ${target}${replacing(path)}`, () => {
    mkdirSync(dirname(path), { recursive: true });
    if (exists(path)) backup(deps, lines, path);
    symlinkSync(target, path);
  });
}

function write(deps, lines, dryRun, path, content) {
  if (exists(path) && !lstatSync(path).isSymbolicLink() && readFileSync(path, 'utf8') === content) {
    lines.push(`ok: ${tilde(deps, path)}`);
    return;
  }
  act(deps, lines, dryRun, `write ${tilde(deps, path)}${replacing(path)}`, () => {
    mkdirSync(dirname(path), { recursive: true });
    if (exists(path)) backup(deps, lines, path);
    writeFileSync(path, content);
  });
}

/** Runs steps that report into `lines`, attaching what ran to any error so the caller can show it. */
function reporting(body) {
  const lines = [];
  try {
    body(lines);
    return lines;
  } catch (error) {
    error.lines = lines;
    throw error;
  }
}

/**
 * Sets up this machine: both tools get the marketplaces and the install profile, the CLIs and the
 * global instructions are linked, and a private secrets file exists. Safe to run again.
 */
export function install(catalog, deps, { dryRun = false } = {}) {
  return reporting((lines) => installSteps(catalog, deps, dryRun, lines));
}

function installSteps(catalog, deps, dryRun, lines) {
  const ids = resolve(catalog, [catalog.install]);
  for (const tool of ['claude', 'codex']) {
    if (!available(deps, tool)) lines.push(`${tool}: not installed, skipped`);
    else provide(catalog, deps, lines, dryRun, tool, ids);
  }

  const bin = join(deps.home, '.local/bin');
  link(deps, lines, dryRun, join(bin, 'station'), join(catalog.repo, 'station/station.mjs'));
  link(deps, lines, dryRun, join(bin, 'worklog'), join(catalog.repo, 'plugins/devflow/dist/cli.js'));

  const agents = join(catalog.repo, 'global/AGENTS.md');
  link(deps, lines, dryRun, join(codexHome(deps), 'AGENTS.md'), agents);
  if (existsSync(join(deps.home, '.gemini'))) link(deps, lines, dryRun, join(deps.home, '.gemini/GEMINI.md'), agents);
  write(deps, lines, dryRun, join(claudeHome(deps), 'CLAUDE.md'), `@${agents}\n`);

  const secrets = join(deps.home, SECRETS);
  if (existsSync(secrets)) lines.push(`ok: ${tilde(deps, secrets)}`);
  else {
    act(deps, lines, dryRun, `create ${tilde(deps, secrets)} (mode 600): fill in the keys`, () => {
      mkdirSync(dirname(secrets), { recursive: true });
      copyFileSync(join(catalog.repo, 'secrets.env.example'), secrets);
      chmodSync(secrets, 0o600);
    });
  }
  const bashrc = join(deps.home, '.bashrc');
  if (!existsSync(bashrc) || !readFileSync(bashrc, 'utf8').includes(SECRETS)) {
    lines.push(`secrets: add \`${SOURCE_SECRETS}\` to ~/.bashrc`);
  }
}

function setCodexUserPlugins(deps, lines, ids, enabled) {
  const config = join(codexHome(deps), 'config.toml');
  const text = existsSync(config) ? readFileSync(config, 'utf8') : '';
  const next = setCodexPlugins(text, ids, enabled);
  if (next === text) return;
  if (existsSync(config)) backup(deps, lines, config);
  writeFileSync(config, next);
}

/**
 * Codex has no project-scoped install, so a project's plugins are installed for the user and left
 * disabled outside projects that enable them, unless the install profile enables them everywhere.
 */
export function ensureCodexPlugins(catalog, deps, ids) {
  return reporting((lines) => {
    if (available(deps, 'codex')) codexForProject(catalog, deps, ids, lines);
    else lines.push('codex: not installed, skipped');
  });
}

function codexForProject(catalog, deps, ids, lines) {
  const added = [];
  try {
    provide(catalog, deps, lines, false, 'codex', ids, added);
  } finally {
    const everywhere = new Set(resolve(catalog, [catalog.install]));
    const projectOnly = added.filter((id) => !everywhere.has(id));
    if (projectOnly.length > 0) {
      setCodexUserPlugins(deps, lines, projectOnly, false);
      lines.push(`codex: ${projectOnly.join(', ')} enabled only in projects that turn them on`);
    }
  }
}

/**
 * Picks up committed changes to agent-station plugins. Claude Code caches each install by commit,
 * so every install is updated in its own scope (project installs from their project). Codex copies
 * plugins, and re-adding one switches it on, so its previous switch is restored.
 */
export function update(catalog, deps) {
  return reporting((lines) => {
    const ours = (p) => marketplaceOf(p.id) === catalog.name;
    const ready = (tool) => {
      if (!available(deps, tool)) return false;
      if (TOOLS[tool].marketplaces(deps).includes(catalog.name)) return true;
      lines.push(`${tool}: ${catalog.name} marketplace not added; run station install`);
      return false;
    };
    if (ready('claude')) {
      toolCommand(deps, lines, false, 'claude', ['plugin', 'marketplace', 'update', catalog.name]);
      for (const p of TOOLS.claude.plugins(deps).filter(ours)) {
        const cwd = p.scope === 'project' || p.scope === 'local' ? { cwd: p.projectPath } : {};
        toolCommand(deps, lines, false, 'claude', ['plugin', 'update', p.id, '--scope', p.scope], cwd);
      }
    }
    if (ready('codex')) {
      const plugins = TOOLS.codex.plugins(deps).filter(ours);
      const off = plugins.filter((p) => !p.enabled).map((p) => p.id);
      try {
        for (const p of plugins) toolCommand(deps, lines, false, 'codex', ['plugin', 'add', p.id]);
      } finally {
        if (off.length > 0) setCodexUserPlugins(deps, lines, off, false);
      }
    }
  });
}
