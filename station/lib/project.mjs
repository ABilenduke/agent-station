import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { marketplaceOf } from './catalog.mjs';

/**
 * Claude Code project settings that enable `ids` and declare each one's marketplace by its GitHub
 * source, so the project prompts to install them on any machine. Existing entries win.
 */
export function mergeClaudeSettings(settings, ids, sources) {
  const out = structuredClone(settings);
  out.enabledPlugins = { ...out.enabledPlugins };
  out.extraKnownMarketplaces = { ...out.extraKnownMarketplaces };
  for (const id of ids) {
    out.enabledPlugins[id] = true;
    const market = marketplaceOf(id);
    out.extraKnownMarketplaces[market] ??= { source: { source: 'github', repo: sources[market] } };
  }
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Sets `enabled` for each plugin's `[plugins."<id>"]` table in Codex TOML, adding tables that are
 * missing. Line-based so comments, line endings and the rest of the file are left as they were. A
 * plugin written in another form (dotted keys, an inline table) is refused rather than duplicated,
 * because Codex will not start with a duplicate key.
 */
export function setCodexPlugins(text, ids, enabled) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text === '' ? [] : text.replace(/\r?\n$/, '').split(/\r?\n/);
  const setting = `enabled = ${enabled}`;
  for (const id of ids) {
    const name = `(?:"${escape(id)}"|'${escape(id)}')`;
    const table = new RegExp(`^\\s*\\[\\s*plugins\\s*\\.\\s*${name}\\s*\\]\\s*(#.*)?$`);
    const subtable = new RegExp(`^\\s*\\[\\s*plugins\\s*\\.\\s*${name}\\s*\\.`);
    const mention = new RegExp(name);
    const other = lines.find((l) => mention.test(l) && !table.test(l) && !subtable.test(l) && !/^\s*#/.test(l));
    if (other !== undefined) {
      throw new Error(`Cannot safely edit "${other.trim()}"; set ${setting} for ${id} by hand`);
    }
    const header = lines.findIndex((l) => table.test(l));
    if (header === -1) {
      if (lines.length > 0 && lines.at(-1).trim() !== '') lines.push('');
      lines.push(`[plugins."${id}"]`, setting);
      continue;
    }
    let end = header + 1;
    while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
    const at = lines.slice(header + 1, end).findIndex((l) => /^\s*enabled\s*=/.test(l)) + header + 1;
    if (at === header) lines.splice(header + 1, 0, setting);
    else lines[at] = lines[at].replace(/^(\s*)enabled\s*=\s*[^#]*?(\s*#.*)?$/, `$1${setting}$2`);
  }
  return lines.length === 0 ? '' : `${lines.join(eol)}${eol}`;
}

const AGENTS_MD = `# Agent instructions

Project instructions for coding agents. Codex and other tools read this file; Claude Code reads it
through CLAUDE.md.
`;

/**
 * The instruction files a project is missing: AGENTS.md, imported by CLAUDE.md. A project that
 * already has only a CLAUDE.md is left for a person to reconcile. Returns `{ name, path, text }`.
 */
export function planInstructions(dir) {
  const agents = join(dir, 'AGENTS.md');
  const claude = join(dir, 'CLAUDE.md');
  const files = [];
  if (existsSync(claude)) return files;
  if (!existsSync(agents)) files.push({ name: 'AGENTS.md', path: agents, text: AGENTS_MD });
  files.push({ name: 'CLAUDE.md', path: claude, text: '@AGENTS.md\n' });
  return files;
}

/** Every file under `dir`, as paths relative to it. */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(join(dir, e.name)).map((f) => join(e.name, f)) : [e.name],
  );
}

/** Whether `dir` holds `relPath`, matching each part case-insensitively as GitHub does. */
function hasPath(dir, relPath) {
  let at = dir;
  for (const part of relPath.split('/')) {
    if (!existsSync(at) || !statSync(at).isDirectory()) return false;
    const match = readdirSync(at).find((e) => e.toLowerCase() === part.toLowerCase());
    if (match === undefined) return false;
    at = join(at, match);
  }
  return true;
}

/** GitHub reads a pull request template from any of these, so one anywhere means the project has one. */
const PR_TEMPLATES = [
  'pull_request_template.md',
  'docs/pull_request_template.md',
  '.github/pull_request_template.md',
  '.github/PULL_REQUEST_TEMPLATE',
  'docs/PULL_REQUEST_TEMPLATE',
  'PULL_REQUEST_TEMPLATE',
];

/** `.gitignore` text with each scaffold rule the project lacks appended, with the comments above it. */
function mergeGitignore(current, scaffold) {
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  const have = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const add = [];
  let comments = [];
  for (const line of scaffold.split(/\r?\n/)) {
    if (line.trim() === '') comments = [];
    else if (line.trim().startsWith('#')) comments.push(line);
    else {
      if (!have.has(line.trim())) add.push(...comments, line);
      comments = [];
    }
  }
  if (add.length === 0) return current;
  const before = current.replace(/(\r?\n)+$/, '');
  return `${before}${before === '' ? '' : eol + eol}${add.join(eol)}${eol}`;
}

/**
 * Files plugins offer a project from their `scaffold/` folders: each file the project lacks, and
 * nothing it already has. `scaffold/.gitignore` is merged rule by rule into the project's instead.
 * Returns `{ name, path, text }` like `planInstructions`.
 */
export function planScaffold(dir, pluginDirs) {
  const files = [];
  for (const pluginDir of pluginDirs) {
    const root = pluginDir && join(pluginDir, 'scaffold');
    if (!root || !existsSync(root)) continue;
    for (const name of filesUnder(root).sort()) {
      const text = readFileSync(join(root, name), 'utf8');
      const path = join(dir, name);
      if (name === '.gitignore') {
        // Several plugins may add rules: merge each into the pending change, not the file on disk.
        const pending = files.find((f) => f.name === name);
        const current = pending?.text ?? (existsSync(path) ? readFileSync(path, 'utf8') : '');
        const merged = mergeGitignore(current, text);
        if (pending) pending.text = merged;
        else if (merged !== current) files.push({ name, path, text: merged });
      } else if (name.toLowerCase() === '.github/pull_request_template.md') {
        if (!PR_TEMPLATES.some((p) => hasPath(dir, p))) files.push({ name, path, text });
      } else if (!hasPath(dir, name)) files.push({ name, path, text });
    }
  }
  return files;
}

/**
 * Writes every `{ path, text }` or none: when a write fails, files already written are put back as
 * they were (or removed if they did not exist) and the error is rethrown.
 */
export function writeAll(files) {
  const done = [];
  try {
    for (const { path, text } of files) {
      const before = existsSync(path) ? readFileSync(path) : null;
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
      done.push({ path, before });
    }
  } catch (error) {
    for (const { path, before } of done.reverse()) {
      if (before === null) rmSync(path, { force: true });
      else writeFileSync(path, before);
    }
    throw error;
  }
}

/** Creates the files `planInstructions` lists and returns their names. */
export function ensureInstructions(dir) {
  const files = planInstructions(dir);
  writeAll(files);
  return files.map((f) => f.name);
}
