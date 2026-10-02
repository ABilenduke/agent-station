import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../lib/cli.mjs';
import { fakeTools, sampleRepo, tempDir, writeTree } from './helpers.mjs';

function setup(options = {}) {
  const repo = sampleRepo();
  const home = tempDir('station-home-');
  const project = tempDir('station-project-');
  const tools = fakeTools({
    codexHome: join(home, '.codex'),
    names: { [repo]: 'agent-station', 'anthropics/claude-plugins-official': 'claude-plugins-official' },
    ...options,
  });
  let out = '';
  let err = '';
  const deps = {
    repo,
    home,
    cwd: project,
    env: {},
    run: tools.run,
    now: () => new Date('2026-10-02T10:00:00Z'),
    stdout: (s) => (out += s),
    stderr: (s) => (err += s),
  };
  const run = async (...argv) => {
    out = '';
    err = '';
    const code = await main(argv, deps);
    return { code, out, err };
  };
  return { repo, home, project, tools, run };
}

test('init sets a project up for Claude Code and Codex from a profile', async () => {
  const { project, home, run } = setup();
  const result = await run('init', 'web');
  assert.equal(result.code, 0, result.err);
  const settings = JSON.parse(readFileSync(join(project, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(Object.keys(settings.enabledPlugins), [
    'devflow@agent-station',
    'context7@claude-plugins-official',
    'research@agent-station',
  ]);
  assert.deepEqual(settings.extraKnownMarketplaces['agent-station'], {
    source: { source: 'github', repo: 'ABilenduke/agent-station' },
  });
  const codex = readFileSync(join(project, '.codex/config.toml'), 'utf8');
  assert.match(codex, /\[plugins\."research@agent-station"\]\nenabled = true/);
  assert.equal(readFileSync(join(project, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  assert.match(
    readFileSync(join(home, '.codex/config.toml'), 'utf8'),
    /\[plugins\."research@agent-station"\]\nenabled = false/,
  );
  assert.match(result.out, /\.claude\/settings\.json/);
});

test('init twice changes nothing the second time', async () => {
  const { project, run } = setup();
  await run('init', 'web', '--no-codex');
  const before =
    readFileSync(join(project, '.claude/settings.json'), 'utf8') +
    readFileSync(join(project, '.codex/config.toml'), 'utf8');
  const again = await run('init', 'web', '--no-codex');
  const after =
    readFileSync(join(project, '.claude/settings.json'), 'utf8') +
    readFileSync(join(project, '.codex/config.toml'), 'utf8');
  assert.equal(after, before);
  assert.match(again.out, /already set up/);
});

test('init takes a --dir and rejects unknown names without writing anything', async () => {
  const { run } = setup();
  const target = tempDir('station-other-');
  assert.equal((await run('init', 'devflow', '--dir', target, '--no-codex')).code, 0);
  assert.ok(readFileSync(join(target, '.claude/settings.json'), 'utf8').includes('devflow@agent-station'));
  const bad = await run('init', 'nope', '--dir', tempDir());
  assert.equal(bad.code, 1);
  assert.match(bad.err, /Unknown profile or plugin "nope"/);
  assert.equal((await run('init')).code, 1);
});

test('list shows profiles and what each plugin provides', async () => {
  const { run } = setup();
  const { code, out } = await run('list');
  assert.equal(code, 0);
  assert.match(out, /web: devflow@agent-station, context7@claude-plugins-official, research@agent-station/);
  assert.match(out, /research\s+skills: notebooklm; mcp: obsidian-vault/);
});

test('validate and doctor exit non-zero when they find problems', async () => {
  const { repo, run } = setup();
  assert.deepEqual(await run('validate'), { code: 0, out: 'agent-station: valid\n', err: '' });
  writeTree(repo, { 'plugins/devflow/skills/bugfix/SKILL.md': '# none\n' });
  const invalid = await run('validate');
  assert.equal(invalid.code, 1);
  assert.match(invalid.out, /plugins\/devflow\/skills\/bugfix\/SKILL.md: no frontmatter/);
  const doctor = await run('doctor');
  assert.equal(doctor.code, 1);
  assert.match(doctor.out, /✖ claude: agent-station marketplace not added/);
});

test('install --dry-run and unknown commands', async () => {
  const { run, tools } = setup();
  const dry = await run('install', '--dry-run');
  assert.equal(dry.code, 0);
  assert.match(dry.out, /would: claude plugin install devflow@agent-station/);
  assert.ok(tools.calls.every((c) => c.endsWith('--json') || c.endsWith('--version')));
  const unknown = await run('frobnicate');
  assert.equal(unknown.code, 1);
  assert.match(unknown.err, /Usage: station/);
  assert.match((await run('help')).out, /Usage: station/);
});

test('init writes nothing when a project file cannot be edited safely', async () => {
  const { project, run } = setup();
  writeTree(project, { '.codex/config.toml': '[plugins]\n"devflow@agent-station".enabled = false\n' });
  const result = await run('init', 'base', '--no-codex');
  assert.equal(result.code, 1);
  assert.match(result.err, /by hand/);
  assert.equal(existsSync(join(project, '.claude/settings.json')), false);
  assert.equal(existsSync(join(project, 'AGENTS.md')), false);
});
