import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadCatalog, resolve, pluginContents } from '../lib/catalog.mjs';
import { sampleRepo, writeTree } from './helpers.mjs';

test('loadCatalog reads the marketplace plugins, profiles and marketplace sources', () => {
  const repo = sampleRepo();
  const catalog = loadCatalog(repo);
  assert.equal(catalog.name, 'agent-station');
  assert.deepEqual(
    catalog.plugins.map((p) => [p.name, p.dir]),
    [
      ['devflow', join(repo, 'plugins/devflow')],
      ['research', join(repo, 'plugins/research')],
    ],
  );
  assert.equal(catalog.install, 'base');
  assert.equal(catalog.marketplaces['claude-plugins-official'], 'anthropics/claude-plugins-official');
});

test('resolve expands profiles, profile references and bare local plugin names, in order, once each', () => {
  const catalog = loadCatalog(sampleRepo());
  assert.deepEqual(resolve(catalog, ['web']), [
    'devflow@agent-station',
    'context7@claude-plugins-official',
    'research@agent-station',
  ]);
  assert.deepEqual(resolve(catalog, ['research', 'base', 'devflow']), [
    'research@agent-station',
    'devflow@agent-station',
    'context7@claude-plugins-official',
  ]);
});

test('resolve rejects unknown names, unknown marketplaces and profile cycles', () => {
  const catalog = loadCatalog(sampleRepo());
  assert.throws(() => resolve(catalog, ['nope']), /Unknown profile or plugin "nope"/);
  assert.throws(() => resolve(catalog, ['x@elsewhere']), /Unknown marketplace "elsewhere"/);
  assert.throws(() => resolve(catalog, ['missing@agent-station']), /"missing" is not in the agent-station marketplace/);
  const cyclic = { ...catalog, profiles: { a: ['@b'], b: ['@a'] } };
  assert.throws(() => resolve(cyclic, ['a']), /Profile cycle: a → b → a/);
});

test('pluginContents lists skills, agents, hook events and MCP servers', () => {
  const repo = sampleRepo();
  writeTree(repo, {
    'plugins/devflow/agents/reviewer.md': '---\nname: reviewer\n---\n',
    'plugins/devflow/hooks/hooks.json': { hooks: { Stop: [], UserPromptSubmit: [] } },
  });
  assert.deepEqual(pluginContents(join(repo, 'plugins/devflow')), {
    skills: ['bugfix'],
    agents: ['reviewer'],
    hooks: ['Stop', 'UserPromptSubmit'],
    mcp: [],
  });
  assert.deepEqual(pluginContents(join(repo, 'plugins/research')), {
    skills: ['notebooklm'],
    agents: [],
    hooks: [],
    mcp: ['obsidian-vault'],
  });
});
