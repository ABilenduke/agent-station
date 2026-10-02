import { isActivity } from './ledger.js';
export const TURN_CAP_MS = 30 * 60_000;
export const IDLE_CAP_MS = 5 * 60_000;
function union(intervals) {
    const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    const merged = [];
    for (const [a, b] of sorted) {
        const last = merged[merged.length - 1];
        if (last && a <= last[1])
            last[1] = Math.max(last[1], b);
        else
            merged.push([a, b]);
    }
    return merged;
}
function length(intervals) {
    return union(intervals).reduce((sum, [a, b]) => sum + (b - a), 0);
}
/** Counted activity for one session inside one window, following contract/time-ledger.md. */
function sessionIntervals(sequence, windowEnd) {
    const intervals = [];
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
        if (next === null || next === undefined)
            return;
        const cap = inTurn && !waiting ? TURN_CAP_MS : IDLE_CAP_MS;
        intervals.push([at, at + Math.min(next - at, cap)]);
    });
    return intervals;
}
function windowsFor(timed) {
    const windows = [];
    for (const { at, event } of timed) {
        const open = windows.find((w) => w.end === null);
        if (event.event === 'step-start' && !open) {
            windows.push({ start: at, startTs: event.ts, end: null, endTs: null });
        }
        else if (event.event === 'step-finish' && open) {
            open.end = at;
            open.endTs = event.ts;
        }
    }
    return windows;
}
function activeFor(timed, window) {
    const lastAt = timed[timed.length - 1]?.at ?? window.start;
    const end = window.end ?? lastAt;
    const inside = timed.filter(({ at }) => at >= window.start && at <= end);
    if (!inside.some(({ event }) => isActivity(event.event)))
        return null;
    const bySession = new Map();
    for (const item of inside) {
        if (item.event.session === null)
            continue;
        const list = bySession.get(item.event.session) ?? [];
        list.push(item);
        bySession.set(item.event.session, list);
    }
    const intervals = [];
    for (const sequence of bySession.values()) {
        for (const [a, b] of sessionIntervals(sequence, window.end)) {
            intervals.push([Math.max(a, window.start), Math.min(b, end)]);
        }
    }
    return intervals;
}
/** Computes per-step and total wall and active time from ledger events. */
export function computeTimes(events) {
    const timed = events
        .map((event, order) => ({ at: Date.parse(event.ts), event, order }))
        .sort((x, y) => x.at - y.at || x.order - y.order);
    const order = [];
    for (const { event } of timed) {
        if (event.event === 'step-start' && !order.includes(event.step))
            order.push(event.step);
    }
    const allWalls = [];
    const allActive = [];
    let anyActive = false;
    let estimateTotal = null;
    const steps = order.map((step) => {
        const own = timed.filter(({ event }) => event.step === step);
        const windows = windowsFor(own);
        const closed = windows.filter((w) => w.end !== null);
        const walls = closed.map((w) => [w.start, w.end]);
        allWalls.push(...walls);
        let active = null;
        for (const window of windows) {
            const counted = activeFor(own, window);
            if (counted)
                active = [...(active ?? []), ...counted];
        }
        if (active) {
            anyActive = true;
            allActive.push(...active);
        }
        const estimate = own.find(({ event }) => event.event === 'step-start')?.event.estimateMin ?? null;
        if (estimate !== null)
            estimateTotal = (estimateTotal ?? 0) + estimate;
        const sessions = [];
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
