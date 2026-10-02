#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './lib/cli.mjs';

/** Runs a tool and reports a missing one as exit code 127, as a shell would. */
function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.error) return { code: 127, stdout: '', stderr: result.error.message };
  return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
}

process.exitCode = await main(process.argv.slice(2), {
  repo: dirname(dirname(fileURLToPath(import.meta.url))),
  home: homedir(),
  cwd: process.cwd(),
  env: process.env,
  run,
  now: () => new Date(),
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
});
