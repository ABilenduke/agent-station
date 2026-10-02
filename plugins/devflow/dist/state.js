import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Bindings live under /tmp because Codex's default workspace-write sandbox can write there but not
 * under the home directory. They are transient by design; a reboot only means `worklog join` again.
 */
export function defaultStateDir(env, uid) {
    return env['WORKLOG_STATE_DIR'] || `/tmp/worklog-${uid}`;
}
export function statePath(stateDir) {
    return join(stateDir, 'active.json');
}
export function loadBindings(stateDir) {
    const path = statePath(stateDir);
    if (!existsSync(path))
        return [];
    try {
        const parsed = JSON.parse(readFileSync(path, 'utf8'));
        return Array.isArray(parsed.bindings) ? parsed.bindings : [];
    }
    catch {
        return [];
    }
}
/** Saves bindings atomically; removes the file when none remain so hooks can skip work cheaply. */
export function saveBindings(stateDir, bindings) {
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
