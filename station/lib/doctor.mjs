import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { marketplaceOf, pluginContents } from './catalog.mjs';
import { available, claudeHome, codexHome, SECRETS, tilde, TOOLS } from './machine.mjs';

const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD/i;
const SECRET_FLAG = /^--?(api[-_]?key|token|secret|password)$/i;
const SECRET_FLAG_VALUE = /^--?(api[-_]?key|token|secret|password)=./i;
const MOVE = `move it to ~/${SECRETS}`;

function children(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => !n.startsWith('.'))
    .sort()
    .map((n) => join(dir, n));
}

function brokenLinks(deps, finding) {
  const dirs = [join(claudeHome(deps), 'skills'), join(deps.home, '.agents/skills'), join(deps.home, '.local/bin')];
  for (const path of dirs.flatMap(children)) {
    if (lstatSync(path).isSymbolicLink() && !existsSync(path)) {
      finding(false, `broken link ${tilde(deps, path)} → ${readlinkSync(path)}`);
    }
  }
}

/** Skill folders directly under `dir`, plus the skills of plugins symlinked or copied there. */
function skillsIn(deps, dir) {
  const found = [];
  for (const path of children(dir)) {
    if (existsSync(join(path, 'SKILL.md'))) found.push([path.split('/').at(-1), tilde(deps, path)]);
    else if (existsSync(join(path, '.claude-plugin/plugin.json'))) {
      for (const name of pluginContents(path).skills) found.push([name, tilde(deps, join(path, 'skills', name))]);
    }
  }
  return found;
}

function duplicateSkills(catalog, deps, installed, finding) {
  const seen = {
    claude: skillsIn(deps, join(claudeHome(deps), 'skills')),
    codex: [...skillsIn(deps, join(deps.home, '.agents/skills')), ...skillsIn(deps, join(codexHome(deps), 'skills'))],
  };
  for (const [tool, ids] of Object.entries(installed)) {
    for (const id of ids.filter((i) => marketplaceOf(i) === catalog.name)) {
      const plugin = catalog.plugins.find((p) => `${p.name}@${catalog.name}` === id);
      if (!plugin?.dir) continue;
      for (const name of pluginContents(plugin.dir).skills)
        seen[tool].push([name, `${catalog.name} ${plugin.name} plugin`]);
    }
  }
  for (const [tool, skills] of Object.entries(seen)) {
    const names = [...new Set(skills.map(([n]) => n))].sort();
    for (const name of names) {
      const where = skills.filter(([n]) => n === name).map(([, w]) => w);
      if (where.length > 1) finding(false, `${tool} loads skill "${name}" twice: ${where.join(', ')}`);
    }
  }
}

function secretIn(server) {
  const args = server.args ?? [];
  const inArgs = args.some((a, i) => (SECRET_FLAG.test(a) && args[i + 1]) || SECRET_FLAG_VALUE.test(a));
  const inEnv = Object.entries(server.env ?? {})
    .filter(([k, v]) => SECRET_NAME.test(k) && typeof v === 'string' && v !== '' && !v.startsWith('${'))
    .map(([k]) => k);
  return { inArgs, inEnv };
}

function claudeConfigSecrets(deps, finding) {
  const path = join(deps.home, '.claude.json');
  if (!existsSync(path)) return;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const scopes = [
    [config.mcpServers ?? {}, ''],
    ...Object.entries(config.projects ?? {}).map(([dir, p]) => [p.mcpServers ?? {}, ` (${dir})`]),
  ];
  for (const [servers, scope] of scopes) {
    for (const [name, server] of Object.entries(servers)) {
      const { inArgs, inEnv } = secretIn(server);
      if (inArgs) finding(false, `~/.claude.json: MCP server "${name}"${scope} has a secret in its arguments; ${MOVE}`);
      for (const key of inEnv)
        finding(false, `~/.claude.json: MCP server "${name}"${scope} has ${key} in plain text; ${MOVE}`);
    }
  }
}

function codexConfigSecrets(deps, finding) {
  const path = join(codexHome(deps), 'config.toml');
  if (!existsSync(path)) return;
  let server = null;
  let envTable = false;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const table = /^\s*\[mcp_servers\.(?:"([^"]+)"|([^.\]]+))(\.env)?\]\s*$/.exec(line);
    if (table) {
      [server, envTable] = [table[1] ?? table[2], Boolean(table[3])];
      continue;
    }
    if (/^\s*\[/.test(line)) [server, envTable] = [null, false];
    if (!server) continue;
    const pairs = envTable ? [line] : (/^\s*env\s*=\s*\{(.*)\}/.exec(line)?.[1].split(',') ?? []);
    for (const pair of pairs) {
      const kv = /^\s*"?([A-Za-z_][\w-]*)"?\s*=\s*"([^"]*)"/.exec(pair);
      if (kv && SECRET_NAME.test(kv[1]) && kv[2] !== '' && !kv[2].startsWith('${')) {
        finding(false, `${tilde(deps, path)}: MCP server "${server}" has ${kv[1]} in plain text; ${MOVE}`);
      }
    }
  }
}

function secretsFile(deps, finding) {
  const path = join(deps.home, SECRETS);
  if (!existsSync(path)) return finding(false, `~/${SECRETS} is missing; run station install`);
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077)
    finding(false, `~/${SECRETS} is readable by others (mode ${mode.toString(8)}); run chmod 600 on it`);
  else finding(true, `~/${SECRETS} is private`);
}

/**
 * The devflow hooks and worklog run its committed build. Whether that build matches src/ is a
 * content check (npm run check:dist, run in CI); file times are no guide after a clone or checkout.
 */
function devflowBuild(catalog, finding) {
  const root = join(catalog.repo, 'plugins/devflow');
  if (!existsSync(join(root, 'src'))) return;
  if (existsSync(join(root, 'dist/cli.js'))) finding(true, 'plugins/devflow/dist/cli.js is built');
  else finding(false, 'plugins/devflow/dist/cli.js is missing; run npm run build in plugins/devflow');
}

/** Checks this machine against what station sets up; findings with ok false need attention. */
export function doctor(catalog, deps) {
  const findings = [];
  const finding = (ok, message) => findings.push({ ok, message });
  const installed = {};
  for (const tool of ['claude', 'codex']) {
    if (!available(deps, tool)) {
      finding(true, `${tool}: not installed`);
      continue;
    }
    if (TOOLS[tool].marketplaces(deps).includes(catalog.name))
      finding(true, `${tool}: ${catalog.name} marketplace added`);
    else finding(false, `${tool}: ${catalog.name} marketplace not added; run station install`);
    installed[tool] = TOOLS[tool].plugins(deps).map((p) => p.id);
  }
  brokenLinks(deps, finding);
  duplicateSkills(catalog, deps, installed, finding);
  claudeConfigSecrets(deps, finding);
  codexConfigSecrets(deps, finding);
  secretsFile(deps, finding);
  devflowBuild(catalog, finding);
  return findings;
}
