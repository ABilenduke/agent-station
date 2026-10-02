import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
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

/**
 * Sets `enabled` for each plugin's `[plugins."<id>"]` table in Codex TOML, adding tables that are
 * missing. Line-based so comments and the rest of the file are left exactly as they were.
 */
export function setCodexPlugins(text, ids, enabled) {
  const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
  const setting = `enabled = ${enabled}`;
  for (const id of ids) {
    const header = lines.findIndex((l) => l.trim() === `[plugins."${id}"]`);
    if (header === -1) {
      if (lines.length > 0 && lines.at(-1).trim() !== '') lines.push('');
      lines.push(`[plugins."${id}"]`, setting);
      continue;
    }
    let end = header + 1;
    while (end < lines.length && !lines[end].trim().startsWith('[')) end++;
    const line = lines.slice(header + 1, end).findIndex((l) => /^\s*enabled\s*=/.test(l));
    if (line === -1) lines.splice(header + 1, 0, setting);
    else lines[header + 1 + line] = setting;
  }
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`;
}

const AGENTS_MD = `# Agent instructions

Project instructions for coding agents. Codex and other tools read this file; Claude Code reads it
through CLAUDE.md.
`;

/**
 * Gives the project one instructions file for every tool: AGENTS.md, imported by CLAUDE.md. A
 * project that already has only a CLAUDE.md is left for a person to reconcile. Returns created files.
 */
export function ensureInstructions(dir) {
  const agents = join(dir, 'AGENTS.md');
  const claude = join(dir, 'CLAUDE.md');
  const created = [];
  if (existsSync(claude)) return created;
  if (!existsSync(agents)) {
    writeFileSync(agents, AGENTS_MD);
    created.push('AGENTS.md');
  }
  writeFileSync(claude, '@AGENTS.md\n');
  created.push('CLAUDE.md');
  return created;
}
