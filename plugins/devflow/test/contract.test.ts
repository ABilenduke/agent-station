import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Compiled to dist-test/test/, so the plugin root is two levels up.
const root = fileURLToPath(new URL('../../', import.meta.url));

test('every feature skill carries an identical copy of the feature workflow contract', () => {
  const contract = readFileSync(join(root, 'contract', 'feature-workflow.md'), 'utf8');
  const skills = readdirSync(join(root, 'skills')).filter((name) => name.startsWith('feature-'));
  assert.ok(skills.length > 0, 'no feature-* skills found');
  for (const skill of skills) {
    const copy = join(root, 'skills', skill, 'references', 'feature-workflow.md');
    assert.ok(existsSync(copy), `${skill} has no references/feature-workflow.md; run npm run sync:contract`);
    assert.equal(readFileSync(copy, 'utf8'), contract, `${skill}'s copy differs; run npm run sync:contract`);
  }
});
