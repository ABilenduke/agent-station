import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
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
/**
 * Whether `stateDir` is a real directory this user owns. The default path is predictable and lives in
 * a shared /tmp, so another user could have created it, or planted a symlink there, first.
 */
function isTrustedDir(stateDir) {
    const info = lstatSync(stateDir);
    const uid = process.getuid?.();
    return info.isDirectory() && (uid === undefined || info.uid === uid);
}
/** Creates the state directory private to this user, or throws if someone else's is in the way. */
function ensureStateDir(stateDir) {
    mkdirSync(stateDir, { recursive: true, mode: 0o700 });
    if (!isTrustedDir(stateDir)) {
        throw new Error(`${stateDir} is not a directory owned by you; set WORKLOG_STATE_DIR to a private path.`);
    }
    chmodSync(stateDir, 0o700);
}
export function loadBindings(stateDir) {
    const path = statePath(stateDir);
    if (!existsSync(path))
        return [];
    try {
        if (!isTrustedDir(stateDir))
            return [];
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
    ensureStateDir(stateDir);
    const temp = `${path}.${process.pid}.tmp`;
    writeFileSync(temp, `${JSON.stringify({ bindings }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, path);
}
