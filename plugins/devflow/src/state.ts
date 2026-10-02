import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Harness } from './ledger.js';

/** A session currently working on a step. Transient: the ledger, not this file, is the record. */
export interface Binding {
  session: string;
  dir: string;
  step: string;
  harness: Harness;
  since: string;
}

/**
 * Bindings live under /tmp because Codex's default workspace-write sandbox can write there but not
 * under the home directory. They are transient by design; a reboot only means `worklog join` again.
 */
export function defaultStateDir(env: Record<string, string | undefined>, uid: number): string {
  return env['WORKLOG_STATE_DIR'] || `/tmp/worklog-${uid}`;
}

export function statePath(stateDir: string): string {
  return join(stateDir, 'active.json');
}

export function loadBindings(stateDir: string): Binding[] {
  const path = statePath(stateDir);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { bindings?: Binding[] };
    return Array.isArray(parsed.bindings) ? parsed.bindings : [];
  } catch {
    return [];
  }
}

/** Saves bindings atomically; removes the file when none remain so hooks can skip work cheaply. */
export function saveBindings(stateDir: string, bindings: Binding[]): void {
  const path = statePath(stateDir);
  if (bindings.length === 0) {
    rmSync(path, { force: true });
    return;
  }
  mkdirSync(stateDir, { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ bindings }, null, 2)}\n`, 'utf8');
  renameSync(temp, path);
}
