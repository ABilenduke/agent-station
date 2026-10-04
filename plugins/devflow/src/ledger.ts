import { appendFileSync, existsSync, readFileSync } from 'node:fs';

export const STEP_EVENTS = ['step-start', 'join', 'step-finish'] as const;
export const ACTIVITY_EVENTS = ['prompt', 'stop', 'tool', 'subagent', 'wait'] as const;

export type StepEventName = (typeof STEP_EVENTS)[number];
export type ActivityEventName = (typeof ACTIVITY_EVENTS)[number];
export type EventName = StepEventName | ActivityEventName;
export type Harness = 'claude-code' | 'codex' | 'shell';

/** One line of `time.jsonl`; see contract/time-ledger.md. */
export interface LedgerEvent {
  v: 1;
  ts: string;
  event: EventName;
  step: string;
  session: string | null;
  harness: Harness;
  estimateMin?: number;
  note?: string;
  source?: string;
}

export interface LedgerProblem {
  line: number;
  message: string;
}

const EVENT_NAMES = new Set<string>([...STEP_EVENTS, ...ACTIVITY_EVENTS]);
/** ISO 8601 date and time with `Z` or an explicit offset, the form the ledger contract requires. */
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const HARNESSES = new Set<string>(['claude-code', 'codex', 'shell']);

export function isActivity(event: EventName): event is ActivityEventName {
  return (ACTIVITY_EVENTS as readonly string[]).includes(event);
}

function problemWith(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return 'not a JSON object';
  const o = value as Record<string, unknown>;
  if (o['v'] !== 1) return 'unsupported version';
  if (typeof o['ts'] !== 'string' || !ISO_TS.test(o['ts']) || Number.isNaN(Date.parse(o['ts']))) return 'bad ts';
  if (typeof o['event'] !== 'string' || !EVENT_NAMES.has(o['event'])) return `unknown event ${String(o['event'])}`;
  if (typeof o['step'] !== 'string' || o['step'] === '' || /[|\n]/.test(o['step'])) return 'bad step';
  if (o['session'] !== null && typeof o['session'] !== 'string') return 'bad session';
  if (typeof o['harness'] !== 'string' || !HARNESSES.has(o['harness'])) return 'bad harness';
  if (o['estimateMin'] !== undefined && (!Number.isInteger(o['estimateMin']) || (o['estimateMin'] as number) < 0)) {
    return 'bad estimateMin';
  }
  return null;
}

/** Parses ledger text, keeping valid events in file order and reporting the rest by line number. */
export function parseLedger(text: string): { events: LedgerEvent[]; problems: LedgerProblem[] } {
  const events: LedgerEvent[] = [];
  const problems: LedgerProblem[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '') return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      problems.push({ line: index + 1, message: 'not valid JSON' });
      return;
    }
    const problem = problemWith(value);
    if (problem) problems.push({ line: index + 1, message: problem });
    else events.push(value as LedgerEvent);
  });
  return { events, problems };
}

export function readLedger(path: string): { events: LedgerEvent[]; problems: LedgerProblem[] } {
  return existsSync(path) ? parseLedger(readFileSync(path, 'utf8')) : { events: [], problems: [] };
}

/** Appends one event as a single write, which stays atomic for concurrent hook processes. */
export function appendEvent(path: string, event: LedgerEvent): void {
  appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf8');
}
