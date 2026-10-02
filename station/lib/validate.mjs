import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadCatalog, readJson, resolve } from './catalog.mjs';

const CREDENTIALS = [
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, 'a GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'an API secret key'],
  [/\bctx7sk-[A-Za-z0-9-]{20,}/, 'a Context7 API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
];

function files(dir) {
  if (!existsSync(dir)) return [];
  if (statSync(dir).isFile()) return [dir];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.name !== 'node_modules' && e.name !== '.git')
    .flatMap((e) => files(join(dir, e.name)))
    .sort();
}

/** The `name` and `description` of a SKILL.md, or null when it has no frontmatter. */
export function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!match) return null;
  const lines = match[1].split('\n');
  const field = (key) => {
    const at = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (at === -1) return '';
    const value = lines[at].slice(key.length + 1).trim();
    if (/^[>|][-+]?$/.test(value)) {
      const block = [];
      for (const l of lines.slice(at + 1)) {
        if (!/^\s+\S/.test(l)) break;
        block.push(l.trim());
      }
      return block.join(' ');
    }
    return value.replace(/^(['"])(.*)\1$/, '$2');
  };
  return { name: field('name'), description: field('description') };
}

function checkPlugins(catalog, repo, problems) {
  for (const plugin of catalog.plugins) {
    if (!plugin.dir) continue;
    const manifest = join(plugin.dir, '.claude-plugin/plugin.json');
    const where = `./${relative(repo, plugin.dir)}`;
    if (!existsSync(manifest)) {
      problems.push(`marketplace plugin "${plugin.name}": ${where} has no .claude-plugin/plugin.json`);
      continue;
    }
    const declared = readJson(manifest).name;
    if (declared !== plugin.name)
      problems.push(`marketplace plugin "${plugin.name}": plugin.json names it "${declared}"`);
  }
}

function checkSkills(catalog, repo, problems) {
  const skills = catalog.plugins
    .filter((p) => p.dir)
    .flatMap((p) =>
      files(join(p.dir, 'skills')).filter((f) => f.endsWith('/SKILL.md') && f.split('/').at(-3) === 'skills'),
    )
    .sort();
  for (const path of skills) {
    const where = relative(repo, path);
    const folder = path.split('/').at(-2);
    const meta = frontmatter(readFileSync(path, 'utf8'));
    if (!meta) problems.push(`${where}: no frontmatter`);
    else if (meta.name !== folder) problems.push(`${where}: name "${meta.name}" does not match folder "${folder}"`);
    else if (!meta.description) problems.push(`${where}: no description`);
  }
}

function checkProfiles(catalog, problems) {
  for (const name of Object.keys(catalog.profiles)) {
    try {
      resolve(catalog, [name]);
    } catch (error) {
      problems.push(`profile "${name}": ${error.message}`);
    }
  }
  if (!(catalog.install in catalog.profiles)) problems.push(`install profile "${catalog.install}" does not exist`);
}

function checkMcp(catalog, repo, problems) {
  for (const plugin of catalog.plugins.filter((p) => p.dir)) {
    const path = join(plugin.dir, '.mcp.json');
    if (existsSync(path) && readFileSync(path, 'utf8').includes('${')) {
      problems.push(
        `${relative(repo, path)}: uses \${...}; Codex does not expand it. Source ~/.config/agent-station/secrets.env instead`,
      );
    }
  }
}

function checkCredentials(repo, problems) {
  const scanned = ['plugins', 'global', '.claude-plugin', 'profiles.json', 'secrets.env.example'];
  for (const path of scanned.flatMap((p) => files(join(repo, p)))) {
    const text = readFileSync(path, 'utf8');
    if (text.includes('\0')) continue;
    const hit = CREDENTIALS.find(([pattern]) => pattern.test(text));
    if (hit) problems.push(`${relative(repo, path)}: looks like ${hit[1]}`);
  }
}

/** Problems that would make the marketplace fail to install or leak a secret; empty when sound. */
export function validate(repo) {
  const catalog = loadCatalog(repo);
  const problems = [];
  checkPlugins(catalog, repo, problems);
  checkSkills(catalog, repo, problems);
  checkProfiles(catalog, problems);
  checkMcp(catalog, repo, problems);
  checkCredentials(repo, problems);
  return problems;
}
