#!/usr/bin/env node
import { runCli } from './cli-core.js';
import { defaultStateDir } from './state.js';
async function readStdin() {
    if (process.stdin.isTTY)
        return '';
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}
runCli(process.argv.slice(2), {
    env: process.env,
    now: () => new Date(),
    stateDir: defaultStateDir(process.env, process.getuid?.() ?? 0),
    stdin: readStdin,
    stdout: (s) => process.stdout.write(s),
    stderr: (s) => process.stderr.write(s),
}).then((code) => process.exit(code));
