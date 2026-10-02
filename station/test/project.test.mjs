import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mergeClaudeSettings, setCodexPlugins, ensureInstructions } from '../lib/project.mjs';
import { tempDir, writeTree } from './helpers.mjs';

const sources = {
  'agent-station': 'ABilenduke/agent-station',
  'claude-plugins-official': 'anthropics/claude-plugins-official',
};

test('mergeClaudeSettings enables plugins and declares their marketplaces, keeping existing settings', () => {
  const existing = {
    permissions: { allow: ['Bash(npm test)'] },
    enabledPlugins: { 'other@x': false },
    extraKnownMarketplaces: { 'agent-station': { source: { source: 'directory', path: '/mine' } } },
  };
  const merged = mergeClaudeSettings(existing, ['devflow@agent-station', 'context7@claude-plugins-official'], sources);
  assert.deepEqual(merged, {
    permissions: { allow: ['Bash(npm test)'] },
    enabledPlugins: { 'other@x': false, 'devflow@agent-station': true, 'context7@claude-plugins-official': true },
    extraKnownMarketplaces: {
      'agent-station': { source: { source: 'directory', path: '/mine' } },
      'claude-plugins-official': { source: { source: 'github', repo: 'anthropics/claude-plugins-official' } },
    },
  });
  assert.deepEqual(existing.enabledPlugins, { 'other@x': false }, 'input is not mutated');
});

test('setCodexPlugins adds missing plugin sections and switches existing ones, leaving other config alone', () => {
  const toml = [
    'model = "gpt-5"',
    '',
    '[plugins."devflow@agent-station"]',
    'enabled = false',
    '',
    '[mcp_servers.x]',
    'command = "x"',
    '',
  ].join('\n');
  const out = setCodexPlugins(toml, ['devflow@agent-station', 'frontend@agent-station'], true);
  assert.equal(
    out,
    [
      'model = "gpt-5"',
      '',
      '[plugins."devflow@agent-station"]',
      'enabled = true',
      '',
      '[mcp_servers.x]',
      'command = "x"',
      '',
      '[plugins."frontend@agent-station"]',
      'enabled = true',
      '',
    ].join('\n'),
  );
  assert.equal(setCodexPlugins(out, ['devflow@agent-station', 'frontend@agent-station'], true), out, 'idempotent');
});

test('setCodexPlugins adds an enabled line to a section that has none, and works on an empty file', () => {
  assert.equal(
    setCodexPlugins('[plugins."a@m"]\nsource = "x"\n', ['a@m'], false),
    '[plugins."a@m"]\nenabled = false\nsource = "x"\n',
  );
  assert.equal(setCodexPlugins('', ['a@m'], true), '[plugins."a@m"]\nenabled = true\n');
});

test('ensureInstructions creates AGENTS.md and a CLAUDE.md that imports it when neither exists', () => {
  const dir = tempDir();
  assert.deepEqual(ensureInstructions(dir), ['AGENTS.md', 'CLAUDE.md']);
  assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /^# /);
  assert.equal(readFileSync(join(dir, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  assert.deepEqual(ensureInstructions(dir), [], 'idempotent');
});

test('ensureInstructions adds only CLAUDE.md beside an existing AGENTS.md and never touches a lone CLAUDE.md', () => {
  const withAgents = writeTree(tempDir(), { 'AGENTS.md': '# Mine\n' });
  assert.deepEqual(ensureInstructions(withAgents), ['CLAUDE.md']);
  assert.equal(readFileSync(join(withAgents, 'AGENTS.md'), 'utf8'), '# Mine\n');
  const withClaude = writeTree(tempDir(), { 'CLAUDE.md': '# Claude only\n' });
  assert.deepEqual(ensureInstructions(withClaude), []);
  assert.equal(readFileSync(join(withClaude, 'CLAUDE.md'), 'utf8'), '# Claude only\n');
});

test('setCodexPlugins edits a table however its header is spelled, without adding a duplicate', () => {
  for (const header of ['[plugins."a@m"] # note', "[plugins.'a@m']", '[ plugins . "a@m" ]']) {
    assert.equal(setCodexPlugins(`${header}\nenabled = false\n`, ['a@m'], true), `${header}\nenabled = true\n`, header);
  }
});

test('setCodexPlugins keeps a comment on the enabled line, and the file line endings', () => {
  assert.equal(setCodexPlugins('[plugins."a@m"]\nenabled = true # keep\n', ['a@m'], false), '[plugins."a@m"]\nenabled = false # keep\n');
  assert.equal(
    setCodexPlugins('model = "x"\r\n', ['a@m'], true),
    'model = "x"\r\n\r\n[plugins."a@m"]\r\nenabled = true\r\n',
  );
});

test('setCodexPlugins refuses forms it cannot edit safely instead of writing a duplicate key', () => {
  for (const text of ['[plugins]\n"a@m".enabled = true\n', 'plugins = { "a@m" = { enabled = true } }\n']) {
    assert.throws(() => setCodexPlugins(text, ['a@m'], false), /set enabled = false for a@m by hand/, text);
  }
  const subtable = '[plugins."a@m"]\nenabled = true\n\n[plugins."a@m".settings]\nx = 1\n# "a@m" is great\n';
  assert.equal(setCodexPlugins(subtable, ['a@m'], false), subtable.replace('enabled = true', 'enabled = false'));
});
