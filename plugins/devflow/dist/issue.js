/**
 * Marked sections in an issue body and marked comments on it, so a skill can update its own part of
 * an issue without touching what a person wrote around it. Pure text functions; `github.ts` does the
 * calls.
 */
/** GitHub's limit for an issue body or a comment, in characters. */
export const BODY_LIMIT = 65_536;
const KEY = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;
/** A section name or comment key, checked so it can sit inside an HTML comment marker. */
export function checkKey(raw) {
    if (!raw)
        throw new Error('Missing section name or comment key.');
    if (!KEY.test(raw))
        throw new Error(`Invalid name "${raw}": use letters, digits and : . _ - only.`);
    return raw;
}
export function checkBodySize(text) {
    if (text.length > BODY_LIMIT) {
        throw new Error(`The text is ${text.length} characters; GitHub allows ${BODY_LIMIT}. Shorten it or split it.`);
    }
}
function markers(name) {
    return { start: `<!-- devflow:section ${name} -->`, end: `<!-- /devflow:section ${name} -->` };
}
/** Where the section's start and end markers are, or null when it is absent. */
function locate(body, name) {
    const m = markers(checkKey(name));
    const start = body.indexOf(m.start);
    if (start === -1)
        return null;
    if (body.indexOf(m.start, start + m.start.length) !== -1) {
        throw new Error(`Section ${name} appears more than once in the issue body; fix it by hand first.`);
    }
    const end = body.indexOf(m.end, start);
    if (end === -1)
        throw new Error(`Section ${name} has no end marker in the issue body; fix it by hand first.`);
    return { start, end, endLength: m.end.length };
}
/** The text between a section's markers, trimmed, or null when the body has no such section. */
export function readSection(body, name) {
    const at = locate(body, name);
    if (!at)
        return null;
    return body.slice(at.start + markers(name).start.length, at.end).trim();
}
function tidy(content) {
    return content.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd();
}
/** The body with one section replaced, or appended when it is missing; everything else is kept. */
export function setSection(body, name, content) {
    const m = markers(checkKey(name));
    const block = `${m.start}\n${tidy(content)}\n${m.end}`;
    const at = locate(body, name);
    if (at)
        return `${body.slice(0, at.start)}${block}${body.slice(at.end + at.endLength)}`;
    const before = body.trimEnd();
    return `${before}${before === '' ? '' : '\n\n'}${block}\n`;
}
function commentMarker(key) {
    return `<!-- devflow:comment ${checkKey(key)} -->`;
}
/** A comment body that opens with its key's marker and ends with a line saying where it came from. */
export function markedComment(key, content, provenance) {
    return `${commentMarker(key)}\n${tidy(content)}\n\n<sub>${provenance}</sub>\n`;
}
/**
 * The comment `author` posted for `key`: the oldest one that opens with the marker. Comments by
 * anyone else never match, so nobody can plant a marker and have a skill rewrite or trust it.
 */
export function findMarkedComment(comments, key, author) {
    const marker = commentMarker(key);
    return comments.find((c) => c.author === author && c.body.trimStart().startsWith(marker));
}
/** What `markedComment` wrapped: the body without its key marker line and its provenance line. */
export function commentContent(body) {
    return body
        .trimStart()
        .replace(/^<!-- devflow:comment [^\n]*? -->\r?\n/, '')
        .replace(/\r?\n<sub>[^\n]*<\/sub>\s*$/, '')
        .trim();
}
/** Markdown without a leading YAML frontmatter block, which a GitHub comment would show as text. */
export function stripFrontmatter(markdown) {
    const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(markdown);
    return match ? markdown.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, '') : markdown;
}
/** The first-column values of the first Markdown table, without its header, divider or total row. */
export function tableSteps(markdown) {
    const rows = markdown
        .split(/\r?\n/)
        .filter((line) => line.trimStart().startsWith('|'))
        .map((line) => line.split('|')[1]?.trim() ?? '');
    return rows.slice(1).filter((cell) => !/^:?-+:?$/.test(cell) && cell !== '**Total**' && cell !== '');
}
