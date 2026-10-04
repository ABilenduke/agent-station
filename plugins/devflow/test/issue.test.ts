import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BODY_LIMIT,
  checkBodySize,
  checkKey,
  commentContent,
  findMarkedComment,
  markedComment,
  readSection,
  setSection,
  stripFrontmatter,
  tableSteps,
} from '../src/issue.js';

test('setSection appends a marked block when the body lacks the section', () => {
  const body = 'Written by a person.\n';
  const updated = setSection(body, 'brief', 'The idea.\n');
  assert.equal(
    updated,
    'Written by a person.\n\n<!-- devflow:section brief -->\nThe idea.\n<!-- /devflow:section brief -->\n',
  );
  assert.equal(
    setSection('', 'brief', 'The idea.'),
    '<!-- devflow:section brief -->\nThe idea.\n<!-- /devflow:section brief -->\n',
  );
});

test('setSection replaces only the text between its markers, keeping edits elsewhere', () => {
  const body = [
    'Intro edited on github.com.',
    '<!-- devflow:section brief -->',
    'Old brief.',
    '<!-- /devflow:section brief -->',
    '<!-- devflow:section plan -->',
    'The plan.',
    '<!-- /devflow:section plan -->',
    'Footer note.',
  ].join('\r\n');
  const updated = setSection(body, 'brief', 'New brief.\n\n');
  assert.equal(readSection(updated, 'brief'), 'New brief.');
  assert.equal(readSection(updated, 'plan'), 'The plan.');
  assert.ok(updated.startsWith('Intro edited on github.com.\r\n'));
  assert.ok(updated.endsWith('<!-- /devflow:section plan -->\r\nFooter note.'));
});

test('readSection is null for a missing section', () => {
  assert.equal(readSection('no markers here', 'brief'), null);
});

test('a duplicated or unterminated section is refused rather than guessed at', () => {
  const twice = '<!-- devflow:section brief -->\na\n<!-- /devflow:section brief -->\n'.repeat(2);
  assert.throws(() => setSection(twice, 'brief', 'b'), /brief.*more than once/);
  const open = '<!-- devflow:section brief -->\na\n';
  assert.throws(() => setSection(open, 'brief', 'b'), /brief.*no end marker/);
  assert.throws(() => readSection(open, 'brief'), /no end marker/);
});

test('section names and comment keys are restricted to marker-safe characters', () => {
  assert.equal(checkKey('journal:S1'), 'journal:S1');
  assert.equal(checkKey('time'), 'time');
  assert.throws(() => checkKey('two words'), /Invalid/);
  assert.throws(() => checkKey('a-->b'), /Invalid/);
  assert.throws(() => checkKey(undefined), /Missing/);
});

test('markedComment starts with the key marker and ends with a provenance line', () => {
  const body = markedComment('time', '# Time\n\n| a |\n', 'devflow · claude-code · 2026-10-05 09:00');
  assert.equal(
    body,
    '<!-- devflow:comment time -->\n# Time\n\n| a |\n\n<sub>devflow · claude-code · 2026-10-05 09:00</sub>\n',
  );
});

test('findMarkedComment takes only the given author’s comment that opens with the marker', () => {
  const comments = [
    { id: 1, author: 'stranger', body: '<!-- devflow:comment time -->\nplanted' },
    { id: 2, author: 'owner', body: 'Quoting it: <!-- devflow:comment time -->' },
    { id: 3, author: 'owner', body: '<!-- devflow:comment time-extra -->\nother key' },
    { id: 4, author: 'owner', body: '\r\n<!-- devflow:comment time -->\r\nmine' },
  ];
  assert.equal(findMarkedComment(comments, 'time', 'owner')?.id, 4);
  assert.equal(findMarkedComment(comments, 'review', 'owner'), undefined);
});

test('findMarkedComment uses the oldest match when an earlier run left duplicates', () => {
  const comments = [
    { id: 7, author: 'owner', body: '<!-- devflow:comment time -->\nfirst' },
    { id: 9, author: 'owner', body: '<!-- devflow:comment time -->\nsecond' },
  ];
  assert.equal(findMarkedComment(comments, 'time', 'owner')?.id, 7);
});

test('stripFrontmatter removes a leading YAML block only', () => {
  assert.equal(stripFrontmatter('---\ndoc: time\nupdated: 2026-10-05\n---\n\n# Time\n'), '# Time\n');
  assert.equal(stripFrontmatter('# Time\n\n---\n\nnot frontmatter\n'), '# Time\n\n---\n\nnot frontmatter\n');
  assert.equal(stripFrontmatter('---\nunterminated\n'), '---\nunterminated\n');
});

test('checkBodySize rejects text over GitHub’s limit', () => {
  assert.doesNotThrow(() => checkBodySize('x'.repeat(BODY_LIMIT)));
  assert.throws(() => checkBodySize('x'.repeat(BODY_LIMIT + 1)), /65536/);
});

test('tableSteps lists the step column of a rendered time table, without the header or total', () => {
  const md =
    '# Time\n\n| Step | Estimate |\n| ---- | -------- |\n| brief | 30m |\n| S1 | 1h |\n| **Total** | 1h30m |\n\nfoot | note\n';
  assert.deepEqual(tableSteps(md), ['brief', 'S1']);
  assert.deepEqual(tableSteps('no table'), []);
});

test('commentContent is what markedComment wrapped, without the marker or provenance line', () => {
  const body = markedComment('research', '## Research\n\nF1\n', 'devflow · codex · 2026-10-05 09:00');
  assert.equal(commentContent(body), '## Research\n\nF1');
  assert.equal(commentContent('\r\n<!-- devflow:comment time -->\r\nbody\r\n\r\n<sub>x</sub>\r\n'), 'body');
  assert.equal(commentContent('plain text'), 'plain text');
});
