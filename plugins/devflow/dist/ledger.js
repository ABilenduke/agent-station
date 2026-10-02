import { appendFileSync, existsSync, readFileSync } from 'node:fs';
export const STEP_EVENTS = ['step-start', 'join', 'step-finish'];
export const ACTIVITY_EVENTS = ['prompt', 'stop', 'tool', 'subagent', 'wait'];
const EVENT_NAMES = new Set([...STEP_EVENTS, ...ACTIVITY_EVENTS]);
const HARNESSES = new Set(['claude-code', 'codex', 'shell']);
export function isActivity(event) {
    return ACTIVITY_EVENTS.includes(event);
}
function problemWith(value) {
    if (typeof value !== 'object' || value === null)
        return 'not a JSON object';
    const o = value;
    if (o['v'] !== 1)
        return 'unsupported version';
    if (typeof o['ts'] !== 'string' || Number.isNaN(Date.parse(o['ts'])))
        return 'bad ts';
    if (typeof o['event'] !== 'string' || !EVENT_NAMES.has(o['event']))
        return `unknown event ${String(o['event'])}`;
    if (typeof o['step'] !== 'string' || o['step'] === '' || /[|\n]/.test(o['step']))
        return 'bad step';
    if (o['session'] !== null && typeof o['session'] !== 'string')
        return 'bad session';
    if (typeof o['harness'] !== 'string' || !HARNESSES.has(o['harness']))
        return 'bad harness';
    if (o['estimateMin'] !== undefined && (!Number.isInteger(o['estimateMin']) || o['estimateMin'] < 0)) {
        return 'bad estimateMin';
    }
    return null;
}
/** Parses ledger text, keeping valid events in file order and reporting the rest by line number. */
export function parseLedger(text) {
    const events = [];
    const problems = [];
    text.split('\n').forEach((raw, index) => {
        const line = raw.trim();
        if (line === '')
            return;
        let value;
        try {
            value = JSON.parse(line);
        }
        catch {
            problems.push({ line: index + 1, message: 'not valid JSON' });
            return;
        }
        const problem = problemWith(value);
        if (problem)
            problems.push({ line: index + 1, message: problem });
        else
            events.push(value);
    });
    return { events, problems };
}
export function readLedger(path) {
    return existsSync(path) ? parseLedger(readFileSync(path, 'utf8')) : { events: [], problems: [] };
}
/** Appends one event as a single write, which stays atomic for concurrent hook processes. */
export function appendEvent(path, event) {
    appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8');
}
