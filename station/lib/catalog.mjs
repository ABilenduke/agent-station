import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * The repository's marketplace and profiles. `marketplaces` maps every marketplace a profile may
 * draw from to its GitHub `owner/repo`; `install` names the profile installed on every machine.
 */
export function loadCatalog(repo) {
  const marketplace = readJson(join(repo, '.claude-plugin/marketplace.json'));
  const profiles = readJson(join(repo, 'profiles.json'));
  return {
    repo,
    name: marketplace.name,
    plugins: marketplace.plugins.map((p) => ({
      name: p.name,
      dir: typeof p.source === 'string' ? resolvePath(repo, p.source) : null,
    })),
    marketplaces: profiles.marketplaces,
    install: profiles.install,
    profiles: profiles.profiles,
  };
}

export function marketplaceOf(id) {
  return id.slice(id.lastIndexOf('@') + 1);
}

/**
 * Expands profile names, `@profile` references, `plugin@marketplace` ids and bare names of this
 * marketplace's plugins into plugin ids, in first-seen order without repeats.
 */
export function resolve(catalog, names) {
  const ids = [];
  const visit = (name, trail) => {
    const ref = name.startsWith('@') ? name.slice(1) : name;
    if (catalog.profiles[ref] && !name.includes('@', 1)) {
      if (trail.includes(ref)) throw new Error(`Profile cycle: ${[...trail, ref].join(' → ')}`);
      for (const entry of catalog.profiles[ref]) visit(entry, [...trail, ref]);
      return;
    }
    if (name.startsWith('@')) throw new Error(`Unknown profile "${ref}"`);
    const id = name.includes('@') ? name : `${name}@${catalog.name}`;
    const [plugin, market] = [id.slice(0, id.lastIndexOf('@')), marketplaceOf(id)];
    if (!name.includes('@') && !catalog.plugins.some((p) => p.name === plugin)) {
      throw new Error(`Unknown profile or plugin "${name}"`);
    }
    if (!(market in catalog.marketplaces)) throw new Error(`Unknown marketplace "${market}" in "${id}"`);
    if (market === catalog.name && !catalog.plugins.some((p) => p.name === plugin)) {
      throw new Error(`"${plugin}" is not in the ${catalog.name} marketplace`);
    }
    if (!ids.includes(id)) ids.push(id);
  };
  for (const name of names) visit(name, []);
  return ids;
}

function entries(dir, keep) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(keep)
    .map((e) => e.name)
    .sort();
}

/** What a plugin directory provides, by name. */
export function pluginContents(dir) {
  const hooksFile = join(dir, 'hooks/hooks.json');
  const mcpFile = join(dir, '.mcp.json');
  return {
    skills: entries(join(dir, 'skills'), (e) => existsSync(join(dir, 'skills', e.name, 'SKILL.md'))),
    agents: entries(join(dir, 'agents'), (e) => e.isFile() && e.name.endsWith('.md')).map((n) => n.slice(0, -3)),
    hooks: existsSync(hooksFile) ? Object.keys(readJson(hooksFile).hooks ?? {}).sort() : [],
    mcp: existsSync(mcpFile) ? Object.keys(readJson(mcpFile).mcpServers ?? {}).sort() : [],
  };
}
