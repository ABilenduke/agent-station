import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { marketplaceOf, pluginContents } from './catalog.mjs';
import { available, claudeHome, codexHome, SECRETS, tilde, TOOLS } from './machine.mjs';

/** Names of settings, headers and query parameters that hold a secret; NAMES_A_SECRET only points at one. */
const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|AUTHORIZATION|BEARER|CREDENTIAL/i;
const NAMES_A_SECRET = /env_?vars?$|file$|path$/i;
const SECRET_FLAG = /^--?[\w-]*(key|token|secret|password|bearer)$/i;
const SECRET_FLAG_VALUE = /^--?[\w-]*(key|token|secret|password|bearer)=(.*)$/i;
const SECRET_HEADER = /^\s*(authorization|[\w-]*(key|token|secret))\s*:\s*\S/i;
const MOVE = `move it to ~/${SECRETS}`;

/** A value written out in full, rather than empty or a ${VAR} reference. */
const literal = (value) => typeof value === 'string' && value.trim() !== '' && !value.includes('${');
const secretName = (name) => SECRET_NAME.test(name) && !NAMES_A_SECRET.test(name);

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

function argsHaveSecret(args) {
  return args.some(
    (arg, i) =>
      (SECRET_FLAG.test(arg) && literal(args[i + 1]) && !args[i + 1].startsWith('-')) ||
      literal(SECRET_FLAG_VALUE.exec(arg)?.[2]) ||
      (SECRET_HEADER.test(arg) && literal(arg)),
  );
}

function urlHasSecret(url) {
  try {
    return [...new URL(url).searchParams].some(([name, value]) => secretName(name) && literal(value));
  } catch {
    return false;
  }
}

/** Reports what kind of secret a server holds, naming settings but never printing their values. */
function report(finding, where, server, secrets) {
  const prefix = `${where}: MCP server ${server}`;
  if (secrets.args) finding(false, `${prefix} has a secret in its arguments; ${MOVE}`);
  if (secrets.url) finding(false, `${prefix} has a secret in its URL; ${MOVE}`);
  for (const name of secrets.names ?? []) finding(false, `${prefix} has ${name} in plain text; ${MOVE}`);
}

function claudeConfigSecrets(deps, finding) {
  const path = deps.env.CLAUDE_CONFIG_DIR
    ? join(deps.env.CLAUDE_CONFIG_DIR, '.claude.json')
    : join(deps.home, '.claude.json');
  if (!existsSync(path)) return;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  const scopes = [
    [config.mcpServers ?? {}, ''],
    ...Object.entries(config.projects ?? {}).map(([dir, p]) => [p.mcpServers ?? {}, ` (${dir})`]),
  ];
  for (const [servers, scope] of scopes) {
    for (const [name, server] of Object.entries(servers)) {
      const named = { ...server.env, ...server.headers };
      report(finding, tilde(deps, path), `"${name}"${scope}`, {
        args: argsHaveSecret(server.args ?? []),
        url: urlHasSecret(server.url),
        names: Object.entries(named)
          .filter(([key, value]) => secretName(key) && literal(value))
          .map(([key]) => key),
      });
    }
  }
}

const TOML_KEY = String.raw`(?:"[^"]*"|'[^']*'|[\w-]+)`;
const unquote = (key) => key.trim().replace(/^(["'])(.*)\1$/, '$2');
const quoted = (text) => [...text.matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2]);

/** The `key = "value"` pairs in a line of TOML, including inline tables, keyed by the last dotted part. */
function pairs(text) {
  const pair = new RegExp(String.raw`(${TOML_KEY}(?:\s*\.\s*${TOML_KEY})*)\s*=\s*("[^"]*"|'[^']*')`, 'g');
  const last = new RegExp(`${TOML_KEY}$`);
  return [...text.matchAll(pair)].map((m) => [unquote(last.exec(m[1].trim())[0]), quoted(m[2])[0]]);
}

function codexConfigSecrets(deps, finding) {
  const path = join(codexHome(deps), 'config.toml');
  if (!existsSync(path)) return;
  const where = tilde(deps, path);
  const table = new RegExp(
    `^\\s*\\[\\s*mcp_servers\\s*\\.\\s*(${TOML_KEY})\\s*(?:\\.\\s*([\\w-]+)\\s*)?\\]\\s*(?:#.*)?$`,
  );
  let server = null;
  let sub = null;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const header = table.exec(line);
    if (header) {
      [server, sub] = [unquote(header[1]), header[2] ?? null];
      continue;
    }
    if (/^\s*\[/.test(line)) [server, sub] = [null, null];
    if (!server || /^\s*#/.test(line)) continue;
    if (!sub && /^\s*args\s*=/.test(line))
      report(finding, where, `"${server}"`, { args: argsHaveSecret(quoted(line)) });
    else if (!sub && /^\s*url\s*=/.test(line))
      report(finding, where, `"${server}"`, { url: urlHasSecret(quoted(line)[0]) });
    else {
      const names = pairs(line)
        .filter(([key, value]) => secretName(key) && literal(value))
        .map(([key]) => key);
      report(finding, where, `"${server}"`, { names });
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
    try {
      if (TOOLS[tool].marketplaces(deps).includes(catalog.name)) {
        finding(true, `${tool}: ${catalog.name} marketplace added`);
      } else finding(false, `${tool}: ${catalog.name} marketplace not added; run station install`);
      installed[tool] = TOOLS[tool].plugins(deps).map((p) => p.id);
    } catch (error) {
      finding(false, `${tool}: ${error.message}`);
    }
  }
  brokenLinks(deps, finding);
  duplicateSkills(catalog, deps, installed, finding);
  claudeConfigSecrets(deps, finding);
  codexConfigSecrets(deps, finding);
  secretsFile(deps, finding);
  devflowBuild(catalog, finding);
  return findings;
}
