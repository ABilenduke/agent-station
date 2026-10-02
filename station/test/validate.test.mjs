import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

// Built at run time so this file does not itself look like it holds a token.
const fakeToken = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('_');

test('no committed file may contain credentials, wherever it lives', () => {
  const repo = writeTree(sampleRepo(), {
    'plugins/research/skills/notebooklm/notes.md': `token: ${fakeToken}\n`,
    'docs/notes.md': `token: ${fakeToken}\n`,
  });
  assert.deepEqual(validate(repo), [
    'docs/notes.md: looks like a GitHub token',
    'plugins/research/skills/notebooklm/notes.md: looks like a GitHub token',
  ]);
});

test('the credential scan covers only files git tracks when the repository is a git checkout', () => {
  const repo = sampleRepo();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['add', '.'], { cwd: repo });
  writeTree(repo, { 'docs/untracked.md': `token: ${fakeToken}\n`, 'docs/tracked.md': `token: ${fakeToken}\n` });
  execFileSync('git', ['add', 'docs/tracked.md'], { cwd: repo });
  assert.deepEqual(validate(repo), ['docs/tracked.md: looks like a GitHub token']);
});
