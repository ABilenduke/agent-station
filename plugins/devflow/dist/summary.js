import { computeTimes } from './active.js';
/** Linear-interpolation quantile of the values (they need not be sorted). */
export function quantile(values, q) {
    const sorted = [...values].sort((a, b) => a - b);
    const h = (sorted.length - 1) * q;
    const lo = Math.floor(h);
    const low = sorted[lo] ?? 0;
    const high = sorted[Math.min(lo + 1, sorted.length - 1)] ?? low;
    return low + (h - lo) * (high - low);
}
export function summarize(ledgers) {
    const ratios = [];
    const features = ledgers.map(({ name, events }) => {
        const times = computeTimes(events);
        for (const s of times.steps) {
            if (s.finished !== null && s.estimateMin && s.activeMs !== null) {
                ratios.push(s.activeMs / 60_000 / s.estimateMin);
            }
        }
        return { name, ...times.total };
    });
    const calibration = ratios.length === 0
        ? null
        : { count: ratios.length, median: quantile(ratios, 0.5), q1: quantile(ratios, 0.25), q3: quantile(ratios, 0.75) };
    return { calibration, features };
}
