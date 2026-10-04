import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
