import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { validate } from '../lib/validate.mjs';
import { sampleRepo, skill, writeTree } from './helpers.mjs';

test('a well-formed repository has no problems', () => {
  assert.deepEqual(validate(sampleRepo()), []);
});

test('marketplace entries must point at a plugin whose manifest has the same name', () => {
  const repo = sampleRepo();
  rmSync(join(repo, 'plugins/research/.claude-plugin'), { recursive: true });
  writeTree(repo, { 'plugins/devflow/.claude-plugin/plugin.json': { name: 'workflow' } });
  assert.deepEqual(validate(repo), [
    'marketplace plugin "devflow": plugin.json names it "workflow"',
    'marketplace plugin "research": ./plugins/research has no .claude-plugin/plugin.json',
  ]);
});

test('every skill needs frontmatter whose name matches its folder and a description', () => {
  const repo = writeTree(sampleRepo(), {
    'plugins/devflow/skills/feedback/SKILL.md': skill('review'),
    'plugins/devflow/skills/empty/SKILL.md': '---\nname: empty\n---\n',
    'plugins/devflow/skills/bare/SKILL.md': '# No frontmatter\n',
  });
  assert.deepEqual(validate(repo), [
    'plugins/devflow/skills/bare/SKILL.md: no frontmatter',
    'plugins/devflow/skills/empty/SKILL.md: no description',
    'plugins/devflow/skills/feedback/SKILL.md: name "review" does not match folder "feedback"',
  ]);
});

test('profiles must resolve, including the install profile', () => {
  const repo = writeTree(sampleRepo(), {
    'profiles.json': {
      marketplaces: { 'agent-station': 'ABilenduke/agent-station' },
      install: 'everything',
      profiles: { web: ['devflow', 'x@nowhere'] },
    },
  });
  assert.deepEqual(validate(repo), [
    'profile "web": Unknown marketplace "nowhere" in "x@nowhere"',
    'install profile "everything" does not exist',
  ]);
});

test('MCP configs take secrets from the secrets file, not ${VAR} references Codex leaves unexpanded', () => {
  const repo = writeTree(sampleRepo(), {
    'plugins/research/.mcp.json': { mcpServers: { x: { command: 'x', env: { KEY: '${X_KEY}' } } } },
  });
  assert.deepEqual(validate(repo), [
    'plugins/research/.mcp.json: uses ${...}; Codex does not expand it. Source ~/.config/agent-station/secrets.env instead',
  ]);
});

test('committed plugin files must not contain credentials', () => {
  const repo = writeTree(sampleRepo(), {
    'plugins/research/skills/notebooklm/notes.md': 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789\n',
  });
  assert.deepEqual(validate(repo), ['plugins/research/skills/notebooklm/notes.md: looks like a GitHub token']);
});
