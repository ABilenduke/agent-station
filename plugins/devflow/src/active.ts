import { isActivity, type Harness, type LedgerEvent } from './ledger.js';

export const TURN_CAP_MS = 30 * 60_000;
export const IDLE_CAP_MS = 5 * 60_000;

export interface SessionRef {
  session: string;
  harness: Harness;
}

export interface StepTimes {
  step: string;
  estimateMin: number | null;
  started: string;
  /** Last finish, or null while any window is open. */
  finished: string | null;
  /** Union of closed windows, or null when none is closed. */
  wallMs: number | null;
  /** Union of counted activity, or null when no window holds an activity event. */
  activeMs: number | null;
  sessions: SessionRef[];
}

export interface Times {
  steps: StepTimes[];
  total: { estimateMin: number | null; wallMs: number | null; activeMs: number | null };
}

type Interval = [number, number];

interface Window {
  start: number;
  startTs: string;
  end: number | null;
  endTs: string | null;
}

interface Timed {
  at: number;
  event: LedgerEvent;
}

function union(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return merged;
}

function length(intervals: Interval[]): number {
  return union(intervals).reduce((sum, [a, b]) => sum + (b - a), 0);
}

/** Counted activity for one session inside one window, following contract/time-ledger.md. */
function sessionIntervals(sequence: Timed[], windowEnd: number | null): Interval[] {
  const intervals: Interval[] = [];
  let inTurn = false;
  let waiting = false;
  sequence.forEach(({ at, event }, index) => {
    switch (event.event) {
      case 'step-start':
      case 'join':
      case 'prompt':
        inTurn = true;
        waiting = false;
        break;
      case 'stop':
        inTurn = false;
        waiting = false;
        break;
      case 'wait':
        waiting = true;
        break;
      case 'tool':
      case 'subagent':
        waiting = false;
        break;
      case 'step-finish':
        return;
    }
    const next = sequence[index + 1]?.at ?? windowEnd;
    if (next === null || next === undefined) return;
    const cap = inTurn && !waiting ? TURN_CAP_MS : IDLE_CAP_MS;
    intervals.push([at, at + Math.min(next - at, cap)]);
  });
  return intervals;
}

function windowsFor(timed: Timed[]): Window[] {
  const windows: Window[] = [];
  for (const { at, event } of timed) {
    const open = windows.find((w) => w.end === null);
    if (event.event === 'step-start' && !open) {
      windows.push({ start: at, startTs: event.ts, end: null, endTs: null });
    } else if (event.event === 'step-finish' && open) {
      open.end = at;
      open.endTs = event.ts;
    }
  }
  return windows;
}

function activeFor(timed: Timed[], window: Window): Interval[] | null {
  const lastAt = timed[timed.length - 1]?.at ?? window.start;
  const end = window.end ?? lastAt;
  const inside = timed.filter(({ at }) => at >= window.start && at <= end);
  if (!inside.some(({ event }) => isActivity(event.event))) return null;
  const bySession = new Map<string, Timed[]>();
  for (const item of inside) {
    if (item.event.session === null) continue;
    const list = bySession.get(item.event.session) ?? [];
    list.push(item);
    bySession.set(item.event.session, list);
  }
  const intervals: Interval[] = [];
  for (const sequence of bySession.values()) {
    for (const [a, b] of sessionIntervals(sequence, window.end)) {
      intervals.push([Math.max(a, window.start), Math.min(b, end)]);
    }
  }
  return intervals;
}

/** Computes per-step and total wall and active time from ledger events. */
export function computeTimes(events: LedgerEvent[]): Times {
  const timed = events
    .map((event, order) => ({ at: Date.parse(event.ts), event, order }))
    .sort((x, y) => x.at - y.at || x.order - y.order);

  const order: string[] = [];
  for (const { event } of timed) {
    if (event.event === 'step-start' && !order.includes(event.step)) order.push(event.step);
  }

  const allWalls: Interval[] = [];
  const allActive: Interval[] = [];
  let anyActive = false;
  let estimateTotal: number | null = null;

  const steps = order.map((step): StepTimes => {
    const own = timed.filter(({ event }) => event.step === step);
    const windows = windowsFor(own);
    const closed = windows.filter((w): w is Window & { end: number } => w.end !== null);
    const walls = closed.map((w): Interval => [w.start, w.end]);
    allWalls.push(...walls);

    let active: Interval[] | null = null;
    for (const window of windows) {
      const counted = activeFor(own, window);
      if (counted) active = [...(active ?? []), ...counted];
    }
    if (active) {
      anyActive = true;
      allActive.push(...active);
    }

    const estimate = own.find(({ event }) => event.event === 'step-start')?.event.estimateMin ?? null;
    if (estimate !== null) estimateTotal = (estimateTotal ?? 0) + estimate;

    const sessions: SessionRef[] = [];
    for (const { event } of own) {
      if (event.session !== null && !sessions.some((s) => s.session === event.session)) {
        sessions.push({ session: event.session, harness: event.harness });
      }
    }

    const last = windows[windows.length - 1];
    return {
      step,
      estimateMin: estimate,
      started: windows[0]?.startTs ?? own[0]?.event.ts ?? '',
      finished: last && last.end !== null ? last.endTs : null,
      wallMs: walls.length > 0 ? length(walls) : null,
      activeMs: active ? length(active) : null,
      sessions,
    };
  });

  return {
    steps,
    total: {
      estimateMin: estimateTotal,
      wallMs: allWalls.length > 0 ? length(allWalls) : null,
      activeMs: anyActive ? length(allActive) : null,
    },
  };
}
