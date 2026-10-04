import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog } from '../lib/catalog.mjs';
import { install, update, ensureCodexPlugins } from '../lib/machine.mjs';
import { fakeTools, sampleRepo, tempDir } from './helpers.mjs';

function machine(options = {}) {
  const repo = sampleRepo();
  const home = tempDir('station-home-');
  const codexHome = join(home, '.codex');
  const names = {
    [repo]: 'agent-station',
    'anthropics/claude-plugins-official': 'claude-plugins-official',
  };
  const tools = fakeTools({ codexHome, names, ...options });
  const deps = { home, env: {}, run: tools.run, now: () => new Date('2026-10-02T10:00:00Z') };
  return { repo, home, codexHome, tools, deps, catalog: loadCatalog(repo) };
}

const writes = (calls) => calls.filter((c) => !c.endsWith('--json') && !c.endsWith('--version'));

test('install registers the marketplaces and installs the install profile in Claude Code and Codex', () => {
  const { repo, tools, deps, catalog } = machine();
  install(catalog, deps);
  assert.deepEqual(writes(tools.calls), [
    `claude plugin marketplace add ${repo}`,
    'claude plugin marketplace add anthropics/claude-plugins-official',
    'claude plugin install devflow@agent-station',
    'claude plugin install context7@claude-plugins-official',
    `codex plugin marketplace add ${repo}`,
    'codex plugin marketplace add anthropics/claude-plugins-official',
    'codex plugin add devflow@agent-station',
    'codex plugin add context7@claude-plugins-official',
  ]);
});

test('install links the CLIs and the global instructions, and creates a private secrets file', () => {
  const { repo, home, deps, catalog } = machine();
  mkdirSync(join(home, '.gemini'));
  install(catalog, deps);
  assert.equal(readlinkSync(join(home, '.local/bin/station')), join(repo, 'station/station.mjs'));
  assert.equal(readlinkSync(join(home, '.local/bin/worklog')), join(repo, 'plugins/devflow/dist/cli.js'));
  assert.equal(readlinkSync(join(home, '.codex/AGENTS.md')), join(repo, 'global/AGENTS.md'));
  assert.equal(readlinkSync(join(home, '.gemini/GEMINI.md')), join(repo, 'global/AGENTS.md'));
  assert.equal(readFileSync(join(home, '.claude/CLAUDE.md'), 'utf8'), `@${join(repo, 'global/AGENTS.md')}\n`);
  const secrets = join(home, '.config/agent-station/secrets.env');
  assert.equal(readFileSync(secrets, 'utf8'), 'OBSIDIAN_API_KEY=\n');
  assert.equal(statSync(secrets).mode & 0o777, 0o600);
});

test('install skips Gemini when it is not set up, and a tool that is not installed', () => {
  const { home, tools, deps, catalog } = machine({ missing: ['codex'] });
  const lines = install(catalog, deps);
  assert.equal(existsSync(join(home, '.gemini')), false);
  assert.ok(lines.includes('codex: not installed, skipped'), lines.join('\n'));
  assert.equal(writes(tools.calls).filter((c) => c.startsWith('codex')).length, 0);
});

test('install backs up files it replaces and leaves its own earlier work alone', () => {
  const { home, tools, deps, catalog } = machine({ copilot: {} });
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude/CLAUDE.md'), '# old notes\n');
  install(catalog, deps);
  assert.equal(readFileSync(join(home, '.claude/CLAUDE.md.bak-20261002T100000'), 'utf8'), '# old notes\n');
  const before = tools.calls.length;
  const again = install(catalog, deps);
  assert.deepEqual(writes(tools.calls.slice(before)), [], 'no tool changes on a second run');
  assert.deepEqual(
    again.filter((l) => !l.startsWith('ok') && !l.startsWith('copilot: skipped')),
    ['secrets: add `set -a; . ~/.config/agent-station/secrets.env; set +a` to ~/.bashrc'],
  );
});

test('backups made in the same second never overwrite each other', () => {
  const { home, deps, catalog } = machine();
  const claudeMd = join(home, '.claude/CLAUDE.md');
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(claudeMd, '# first\n');
  install(catalog, deps);
  writeFileSync(claudeMd, '# second\n');
  install(catalog, deps);
  assert.equal(readFileSync(`${claudeMd}.bak-20261002T100000`, 'utf8'), '# first\n');
  assert.equal(readFileSync(`${claudeMd}.bak-20261002T100000-2`, 'utf8'), '# second\n');
});

test('install --dry-run reports what it would do without changing anything', () => {
  const { home, tools, deps, catalog } = machine();
  const lines = install(catalog, deps, { dryRun: true });
  assert.deepEqual(writes(tools.calls), []);
  assert.equal(existsSync(join(home, '.local')), false);
  assert.equal(existsSync(join(home, '.claude')), false);
  assert.ok(lines.includes('would: claude plugin install devflow@agent-station'), lines.join('\n'));
  assert.ok(
    lines.some((l) => l.startsWith('would: link ~/.local/bin/worklog')),
    lines.join('\n'),
  );
});

test('install --dry-run says which existing files it would back up', () => {
  const { home, deps, catalog } = machine();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude/CLAUDE.md'), '# old notes\n');
  const lines = install(catalog, deps, { dryRun: true });
  assert.ok(lines.includes('would: write ~/.claude/CLAUDE.md (backing up the existing file)'), lines.join('\n'));
  assert.ok(
    lines.includes('would: link ~/.codex/AGENTS.md → ' + join(catalog.repo, 'global/AGENTS.md')),
    lines.join('\n'),
  );
});

test('update refreshes agent-station plugins in both tools and keeps Codex plugins disabled where they were', () => {
  const { repo, tools, deps, catalog, codexHome } = machine({
    claude: { marketplaces: ['agent-station'], plugins: ['devflow@agent-station', 'context7@claude-plugins-official'] },
    codex: {
      marketplaces: ['agent-station'],
      plugins: [
        { id: 'devflow@agent-station', enabled: true },
        { id: 'research@agent-station', enabled: false },
      ],
    },
  });
  update(catalog, deps);
  assert.deepEqual(writes(tools.calls), [
    'claude plugin marketplace update agent-station',
    'claude plugin update devflow@agent-station --scope user',
    'codex plugin add devflow@agent-station',
    'codex plugin add research@agent-station',
  ]);
  const config = readFileSync(join(codexHome, 'config.toml'), 'utf8');
  assert.match(config, /\[plugins\."devflow@agent-station"\]\nenabled = true/);
  assert.match(config, /\[plugins\."research@agent-station"\]\nenabled = false/);
  assert.ok(repo);
});

test('update refreshes Claude Code plugins in every scope, from the project for project installs', () => {
  const { tools, deps, catalog } = machine({
    claude: {
      marketplaces: ['agent-station'],
      plugins: [
        'devflow@agent-station',
        { id: 'research@agent-station', scope: 'project', projectPath: '/work/app' },
        { id: 'context7@claude-plugins-official', scope: 'project', projectPath: '/work/app' },
      ],
    },
    missing: ['codex'],
  });
  update(catalog, deps);
  assert.deepEqual(writes(tools.calls), [
    'claude plugin marketplace update agent-station',
    'claude plugin update devflow@agent-station --scope user',
    'claude plugin update research@agent-station --scope project',
  ]);
  assert.equal(tools.cwds['claude plugin update research@agent-station --scope project'], '/work/app');
});

test('ensureCodexPlugins installs missing plugins but leaves them off outside projects unless in the install profile', () => {
  const { tools, deps, catalog, codexHome } = machine({
    codex: {
      marketplaces: ['agent-station', 'claude-plugins-official'],
      plugins: [{ id: 'devflow@agent-station', enabled: true }],
    },
  });
  ensureCodexPlugins(catalog, deps, [
    'devflow@agent-station',
    'research@agent-station',
    'context7@claude-plugins-official',
  ]);
  assert.deepEqual(writes(tools.calls), [
    'codex plugin add research@agent-station',
    'codex plugin add context7@claude-plugins-official',
  ]);
  const config = readFileSync(join(codexHome, 'config.toml'), 'utf8');
  assert.match(config, /\[plugins\."research@agent-station"\]\nenabled = false/);
  assert.match(config, /\[plugins\."context7@claude-plugins-official"\]\nenabled = true/);
  assert.match(config, /\[plugins\."devflow@agent-station"\]\nenabled = true/);
  assert.equal(lstatSync(join(codexHome, 'config.toml')).isFile(), true);
});

test('station backs up the Codex user config before switching plugins off in it', () => {
  const { deps, catalog, codexHome } = machine({
    codex: { marketplaces: ['agent-station', 'claude-plugins-official'] },
  });
  ensureCodexPlugins(catalog, deps, ['research@agent-station']);
  const saved = readFileSync(join(codexHome, 'config.toml.bak-20261002T100000'), 'utf8');
  assert.match(saved, /\[plugins\."research@agent-station"\]\nenabled = true/);
  assert.match(
    readFileSync(join(codexHome, 'config.toml'), 'utf8'),
    /\[plugins\."research@agent-station"\]\nenabled = false/,
  );
});

test('a failed re-add during update still leaves switched-off Codex plugins off', () => {
  const { deps, catalog, codexHome } = machine({
    fail: ['codex plugin add frontend@agent-station'],
    missing: ['claude'],
    codex: {
      marketplaces: ['agent-station'],
      plugins: [
        { id: 'research@agent-station', enabled: false },
        { id: 'frontend@agent-station', enabled: false },
      ],
    },
  });
  assert.throws(() => update(catalog, deps), /frontend@agent-station failed/);
  const config = readFileSync(join(codexHome, 'config.toml'), 'utf8');
  assert.match(config, /\[plugins\."research@agent-station"\]\nenabled = false/);
  assert.match(config, /\[plugins\."frontend@agent-station"\]\nenabled = false/);
});

test('a failed install during init leaves the plugins it did install off outside projects', () => {
  const { deps, catalog, codexHome } = machine({
    fail: ['codex plugin add context7@claude-plugins-official'],
    codex: { marketplaces: ['agent-station', 'claude-plugins-official'] },
  });
  assert.throws(
    () => ensureCodexPlugins(catalog, deps, ['research@agent-station', 'context7@claude-plugins-official']),
    /failed/,
  );
  assert.match(
    readFileSync(join(codexHome, 'config.toml'), 'utf8'),
    /\[plugins\."research@agent-station"\]\nenabled = false/,
  );
});

test('install adds Copilot CLI too: marketplaces, the install profile and the global instructions', () => {
  const { repo, home, tools, deps, catalog } = machine({ copilot: {} });
  install(catalog, deps);
  assert.deepEqual(
    writes(tools.calls).filter((c) => c.startsWith('copilot')),
    [`copilot plugin marketplace add ${repo}`, 'copilot plugin install devflow@agent-station'],
  );
  assert.equal(readlinkSync(join(home, '.copilot/copilot-instructions.md')), join(repo, 'global/AGENTS.md'));
});

test('install skips plugins from other marketplaces in Copilot CLI, which cannot read them', () => {
  const { tools, deps, catalog } = machine({ copilot: {} });
  const lines = install(catalog, deps);
  assert.ok(lines.includes('copilot: skipped context7@claude-plugins-official (it only installs from agent-station)'));
  assert.equal(tools.calls.filter((c) => c.includes('claude-plugins-official') && c.startsWith('copilot')).length, 0);
});

test('install treats a live Copilot plugin that is listed but disabled as not installed', () => {
  const { tools, deps, catalog } = machine({ copilot: { marketplaces: ['agent-station'] } });
  install(catalog, deps);
  assert.deepEqual(
    writes(tools.calls).filter((c) => c.startsWith('copilot')),
    ['copilot plugin install devflow@agent-station'],
  );
});

test('install keeps Copilot instructions under COPILOT_HOME and skips Copilot when it is missing', () => {
  const { home, tools, deps, catalog } = machine({ copilot: {} });
  deps.env = { COPILOT_HOME: join(home, 'elsewhere') };
  install(catalog, deps);
  assert.ok(lstatSync(join(home, 'elsewhere/copilot-instructions.md')).isSymbolicLink());
  const absent = machine();
  const lines = install(absent.catalog, absent.deps);
  assert.ok(lines.includes('copilot: not installed, skipped'), lines.join('\n'));
  assert.equal(existsSync(join(absent.home, '.copilot')), false);
  assert.ok(tools.calls.length > 0);
});

test('update refreshes the marketplace catalog in Copilot CLI', () => {
  const { tools, deps, catalog } = machine({ copilot: { marketplaces: ['agent-station'] } });
  update(catalog, deps);
  assert.ok(tools.calls.includes('copilot plugin marketplace update agent-station'), tools.calls.join('\n'));
});

test("Copilot commands run from the home directory so a project's .github/copilot/settings.json cannot leak in", () => {
  const { home, tools, deps, catalog } = machine({ copilot: {} });
  install(catalog, deps);
  update(catalog, deps);
  const copilot = Object.entries(tools.cwds).filter(([c]) => c.startsWith('copilot'));
  assert.ok(copilot.length >= 4, 'install and update both ran Copilot commands');
  assert.deepEqual([...new Set(copilot.map(([, cwd]) => cwd))], [home]);
  assert.equal(tools.cwds['copilot plugin marketplace list --json'], home);
  assert.equal(tools.cwds['copilot plugin list --json'], home);
});
