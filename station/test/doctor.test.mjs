import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, rmSync, symlinkSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalog } from '../lib/catalog.mjs';
import { doctor } from '../lib/doctor.mjs';
import { fakeTools, sampleRepo, skill, tempDir, writeTree } from './helpers.mjs';

/** A machine where everything station manages is in order. */
function healthy(options = {}) {
  const repo = sampleRepo();
  const home = tempDir('station-home-');
  writeTree(home, { '.config/agent-station/secrets.env': 'OBSIDIAN_API_KEY=x\n' });
  chmodSync(join(home, '.config/agent-station/secrets.env'), 0o600);
  const tools = fakeTools({
    codexHome: join(home, '.codex'),
    names: {},
    claude: { marketplaces: ['agent-station'], plugins: ['devflow@agent-station'] },
    codex: { marketplaces: ['agent-station'], plugins: [{ id: 'devflow@agent-station', enabled: true }] },
    ...options,
  });
  const deps = { home, env: {}, run: tools.run, now: () => new Date() };
  return { repo, home, deps, catalog: loadCatalog(repo) };
}

const problems = (findings) => findings.filter((f) => !f.ok).map((f) => f.message);

test('a healthy machine has no problems', () => {
  const { deps, catalog } = healthy();
  assert.deepEqual(problems(doctor(catalog, deps)), []);
});

test('doctor reports a tool without the agent-station marketplace', () => {
  const { deps, catalog } = healthy({ codex: { marketplaces: [], plugins: [] } });
  assert.deepEqual(problems(doctor(catalog, deps)), [
    'codex: agent-station marketplace not added; run station install',
  ]);
});

test('doctor reports broken links where skills and CLIs are installed', () => {
  const { home, deps, catalog } = healthy();
  mkdirSync(join(home, '.agents/skills'), { recursive: true });
  symlinkSync('/nowhere/brd-plan', join(home, '.agents/skills/brd-plan'));
  mkdirSync(join(home, '.local/bin'), { recursive: true });
  symlinkSync('/nowhere/cli.js', join(home, '.local/bin/worklog'));
  assert.deepEqual(problems(doctor(catalog, deps)), [
    'broken link ~/.agents/skills/brd-plan → /nowhere/brd-plan',
    'broken link ~/.local/bin/worklog → /nowhere/cli.js',
  ]);
});

test('doctor reports a skill one tool would load twice', () => {
  const { home, deps, catalog } = healthy();
  writeTree(home, {
    '.claude/skills/bugfix/SKILL.md': skill('bugfix'),
    '.agents/skills/notebooklm/SKILL.md': skill('notebooklm'),
    '.claude/skills/notebooklm/SKILL.md': skill('notebooklm'),
  });
  assert.deepEqual(problems(doctor(catalog, deps)), [
    'claude loads skill "bugfix" twice: ~/.claude/skills/bugfix, agent-station devflow plugin',
  ]);
});

test('doctor reports MCP secrets written into tool configs, naming the key but never its value', () => {
  const { home, deps, catalog } = healthy();
  writeTree(home, {
    '.claude.json': {
      mcpServers: { context7: { command: 'npx', args: ['-y', '@upstash/context7-mcp', '--api-key', 'ctx7sk-secret'] } },
      projects: {
        '/work/app': {
          mcpServers: {
            vault: { command: 'uvx', env: { VAULT_TOKEN: 'abc', HOST: 'x', EMPTY_KEY: '', REF_KEY: '${REF}' } },
          },
        },
      },
    },
    '.codex/config.toml':
      '[mcp_servers.vault]\ncommand = "uvx"\n\n[mcp_servers.vault.env]\nOBSIDIAN_API_KEY = "abc"\nOBSIDIAN_HOST = "127.0.0.1"\n',
  });
  const found = problems(doctor(catalog, deps));
  assert.deepEqual(found, [
    '~/.claude.json: MCP server "context7" has a secret in its arguments; move it to ~/.config/agent-station/secrets.env',
    '~/.claude.json: MCP server "vault" (/work/app) has VAULT_TOKEN in plain text; move it to ~/.config/agent-station/secrets.env',
    '~/.codex/config.toml: MCP server "vault" has OBSIDIAN_API_KEY in plain text; move it to ~/.config/agent-station/secrets.env',
  ]);
  assert.ok(found.every((m) => !m.includes('ctx7sk-secret') && !m.includes('abc')));
});

test('doctor reports a missing or readable secrets file', () => {
  const { home, deps, catalog } = healthy();
  chmodSync(join(home, '.config/agent-station/secrets.env'), 0o644);
  assert.deepEqual(problems(doctor(catalog, deps)), [
    '~/.config/agent-station/secrets.env is readable by others (mode 644); run chmod 600 on it',
  ]);
  const fresh = healthy();
  rmSync(join(fresh.home, '.config'), { recursive: true });
  assert.deepEqual(problems(doctor(fresh.catalog, fresh.deps)), [
    '~/.config/agent-station/secrets.env is missing; run station install',
  ]);
});

test('doctor reports a missing devflow build but not file times, which a checkout resets', () => {
  const { repo, deps, catalog } = healthy();
  writeTree(repo, { 'plugins/devflow/src/cli.ts': '' });
  assert.deepEqual(problems(doctor(catalog, deps)), [
    'plugins/devflow/dist/cli.js is missing; run npm run build in plugins/devflow',
  ]);
  writeTree(repo, { 'plugins/devflow/dist/cli.js': '' });
  utimesSync(join(repo, 'plugins/devflow/dist/cli.js'), new Date('2026-01-01'), new Date('2026-01-01'));
  assert.deepEqual(problems(doctor(catalog, deps)), []);
});
