import { isDeepStrictEqual } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import { loadCatalog, marketplaceOf, pluginContents, readJson, resolve } from './catalog.mjs';
import { doctor } from './doctor.mjs';
import { ensureCodexPlugins, install, update } from './machine.mjs';
import { mergeClaudeSettings, planInstructions, planScaffold, setCodexPlugins, writeAll } from './project.mjs';
import { validate } from './validate.mjs';

const USAGE = `Usage: station <command>

  install [--dry-run]                       set up this machine: marketplaces and the install profile
                                            in Claude Code, Codex and Copilot CLI, CLIs, global AGENTS.md, secrets file
  init <profile|plugin>... [--dir <path>]   set up a project to use those plugins in Claude Code, Codex and Copilot CLI
       [--no-codex]                         (skip installing them in Codex for this user)
  update                                    pick up changes to agent-station plugins in every tool
  list                                      profiles and what each plugin provides
  doctor                                    check this machine for drift, broken links and loose secrets
  validate                                  check this repository (run in CI)
`;

class UsageError extends Error {}

/** What each command accepts: on/off flags, options that take a value, and whether it takes names. */
const ARGS = {
  install: { flags: ['dry-run'] },
  update: {},
  init: { flags: ['no-codex'], values: ['dir'], positional: true },
  list: {},
  doctor: {},
  validate: {},
};

/** Parses a command's arguments, rejecting anything it does not accept so a typo never runs it. */
function parse(command, args) {
  const spec = ARGS[command];
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const [arg, inline] = args[i].startsWith('--') && args[i].includes('=') ? args[i].split(/=(.*)/s) : [args[i]];
    const name = arg.slice(2);
    if (arg.startsWith('--') && spec.values?.includes(name)) {
      const value = inline ?? args[++i];
      if (value === undefined || value === '' || value.startsWith('-')) throw new UsageError(`${arg} needs a value`);
      flags[name] = value;
    } else if (arg.startsWith('--') && spec.flags?.includes(name) && inline === undefined) flags[name] = true;
    else if (arg.startsWith('-')) throw new UsageError(`${command} does not accept ${args[i]}`);
    else if (spec.positional) positional.push(arg);
    else throw new UsageError(`${command} takes no arguments, got "${arg}"`);
  }
  return { positional, flags };
}

function print(deps, lines) {
  for (const line of lines) deps.stdout(`${line}\n`);
}

/**
 * Works out every project file first, so a file that cannot be edited safely or a plugin Codex
 * cannot install stops init before anything in the project changes, and if a write still fails
 * the files already written are restored.
 */
function init(catalog, { positional, flags }, deps) {
  if (positional.length === 0) throw new UsageError('init needs at least one profile or plugin');
  const ids = resolve(catalog, positional);
  const dir = resolvePath(deps.cwd, flags.dir ?? '.');

  const settingsPath = join(dir, '.claude/settings.json');
  const settings = existsSync(settingsPath) ? readJson(settingsPath) : {};
  const merged = mergeClaudeSettings(settings, ids, catalog.marketplaces);
  const codexPath = join(dir, '.codex/config.toml');
  const codex = existsSync(codexPath) ? readFileSync(codexPath, 'utf8') : '';
  const codexNext = setCodexPlugins(codex, ids, true);
  const codexLines = flags['no-codex'] ? [] : ensureCodexPlugins(catalog, deps, ids);

  // Copilot CLI's repository settings take the same enabledPlugins and extraKnownMarketplaces keys.
  const copilotPath = join(dir, '.github/copilot/settings.json');
  const copilot = existsSync(copilotPath) ? readJson(copilotPath) : {};
  const copilotIds = ids.filter((id) => marketplaceOf(id) === catalog.name);
  const copilotMerged = mergeClaudeSettings(copilot, copilotIds, catalog.marketplaces);

  const changes = [];
  if (!existsSync(settingsPath) || !isDeepStrictEqual(settings, merged)) {
    changes.push({ name: '.claude/settings.json', path: settingsPath, text: `${JSON.stringify(merged, null, 2)}\n` });
  }
  if (!existsSync(copilotPath) || !isDeepStrictEqual(copilot, copilotMerged)) {
    changes.push({
      name: '.github/copilot/settings.json',
      path: copilotPath,
      text: `${JSON.stringify(copilotMerged, null, 2)}\n`,
    });
  }
  if (!existsSync(codexPath) || readFileSync(codexPath, 'utf8') !== codexNext) {
    changes.push({ name: '.codex/config.toml', path: codexPath, text: codexNext });
  }
  const pluginDirs = catalog.plugins.filter((p) => ids.includes(`${p.name}@${catalog.name}`)).map((p) => p.dir);
  changes.push(...planScaffold(dir, pluginDirs));
  changes.push(...planInstructions(dir));
  writeAll(changes);
  const written = changes.map((f) => f.name);

  deps.stdout(`${dir}: ${ids.join(', ')}\n`);
  print(deps, written.length > 0 ? written.map((f) => `wrote ${f}`) : ['already set up']);
  print(deps, codexLines);
  deps.stdout(
    'Claude Code offers to install these plugins when the project is opened; Codex enables them here once the project is trusted; Copilot CLI installs them from .github/copilot/settings.json.\n',
  );
  return 0;
}

function list(catalog, deps) {
  deps.stdout(`Profiles (installed on every machine: ${catalog.install})\n`);
  for (const name of Object.keys(catalog.profiles)) deps.stdout(`  ${name}: ${resolve(catalog, [name]).join(', ')}\n`);
  deps.stdout(`Plugins in ${catalog.name}\n`);
  const width = Math.max(...catalog.plugins.map((p) => p.name.length));
  for (const plugin of catalog.plugins) {
    const contents = plugin.dir ? pluginContents(plugin.dir) : {};
    const parts = Object.entries(contents)
      .filter(([, names]) => names.length > 0)
      .map(([kind, names]) => `${kind}: ${names.join(', ')}`);
    deps.stdout(`  ${plugin.name.padEnd(width)}  ${parts.join('; ')}\n`);
  }
  return 0;
}

const COMMANDS = {
  install: (catalog, { flags }, deps) => (
    print(deps, install(catalog, deps, { dryRun: flags['dry-run'] === true })),
    0
  ),
  update: (catalog, args, deps) => (print(deps, update(catalog, deps)), 0),
  init,
  list: (catalog, args, deps) => list(catalog, deps),
  doctor: (catalog, args, deps) => {
    const findings = doctor(catalog, deps);
    print(
      deps,
      findings.map((f) => `${f.ok ? '✔' : '✖'} ${f.message}`),
    );
    return findings.every((f) => f.ok) ? 0 : 1;
  },
  validate: (catalog, args, deps) => {
    const problems = validate(deps.repo);
    print(deps, problems.length > 0 ? problems : [`${catalog.name}: valid`]);
    return problems.length > 0 ? 1 : 0;
  },
};

export async function main(argv, deps) {
  const [command, ...args] = argv;
  if (command === undefined || command === 'help' || command === '--help') {
    deps.stdout(USAGE);
    return 0;
  }
  if (!(command in COMMANDS)) {
    deps.stderr(`Unknown command "${command}".\n${USAGE}`);
    return 1;
  }
  try {
    return COMMANDS[command](loadCatalog(deps.repo), parse(command, args), deps);
  } catch (error) {
    if (error.lines) print(deps, error.lines);
    deps.stderr(error instanceof UsageError ? `${error.message}\n${USAGE}` : `${error.message}\n`);
    return 1;
  }
}
