/**
 * Estimates from history: the per-step figures `worklog post` leaves in each issue's time comment,
 * turned into calibration by kind of step and Monte Carlo forecasts (Evidence-Based Scheduling).
 */
import { computeTimes } from './active.js';
import { quantile } from './summary.js';
/** Kinds of work that follow the plan: testing it, fixing review findings, fixing escaped defects. */
const AFTER = ['qa', 'rework', 'fix'];
/** Fewer comparable issues than this make no allowance or reference class. */
export const MIN_ISSUES = 3;
/** Fewer samples than this make no basis; a forecast from three steps is noise. */
export const MIN_SAMPLES = 5;
/** Only the latest samples of a kind count, so the forecast follows how estimating improves. */
export const RECENT_SAMPLES = 50;
const DATA = /<!-- devflow:time-data (\{.*?\}) -->/;
export function timeData(events) {
    return {
        v: 1,
        steps: computeTimes(events).steps.map((s) => ({
            step: s.step,
            estimateMin: s.estimateMin,
            activeMin: s.activeMs === null ? null : Math.round(s.activeMs / 6_000) / 10,
            finished: s.finished,
        })),
    };
}
/**
 * One HTML comment line holding the data, invisible on GitHub and read back by `parseDataLine`.
 * `<` and `>` are escaped (JSON allows `\u003c`), so no step label can close the comment early.
 */
export function dataLine(data) {
    const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    return `<!-- devflow:time-data ${json} -->`;
}
export function parseDataLine(body) {
    const match = DATA.exec(body);
    if (!match?.[1])
        return null;
    try {
        const data = JSON.parse(match[1]);
        return data.v === 1 && Array.isArray(data.steps) ? data : null;
    }
    catch {
        return null;
    }
}
const NAMED = {
    brief: 'brief',
    research: 'research',
    plan: 'plan',
    qa: 'qa',
    review: 'review',
    feedback: 'rework',
    fix: 'fix',
};
export function stepKind(step) {
    if (/^S\d+$/.test(step))
        return 'build';
    return NAMED[step] ?? 'other';
}
function samples(history) {
    return history
        .flatMap((i) => i.steps)
        .filter((s) => Boolean(s.estimateMin && s.activeMin !== null && s.activeMin > 0 && s.finished))
        .map((s) => ({ kind: stepKind(s.step), ratio: s.activeMin / s.estimateMin, finished: s.finished }));
}
function latest(pool) {
    return [...pool]
        .sort((a, b) => Date.parse(b.finished) - Date.parse(a.finished))
        .slice(0, RECENT_SAMPLES)
        .map((s) => s.ratio);
}
/** Actual/estimate ratios by kind of step, over each kind's latest samples. */
export function calibrationByKind(history) {
    const all = samples(history);
    const order = ['brief', 'research', 'plan', 'build', 'qa', 'review', 'rework', 'fix', 'other'];
    const kinds = order.filter((kind) => all.some((s) => s.kind === kind));
    return kinds.map((kind) => {
        const ratios = latest(all.filter((s) => s.kind === kind));
        return {
            kind,
            count: ratios.length,
            median: quantile(ratios, 0.5),
            q1: quantile(ratios, 0.25),
            q3: quantile(ratios, 0.75),
        };
    });
}
/** A deterministic generator in [0, 1), so a forecast can be repeated exactly. */
export function seededRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
    };
}
/** Active minutes of bug-fix work that names `issue` as its origin. */
function fixTimeFor(history, issue) {
    return history
        .filter((i) => i.origin?.includes(issue))
        .reduce((sum, i) => sum + i.steps.reduce((s, step) => s + (step.activeMin ?? 0), 0), 0);
}
/** For each past issue with planned work: unplanned QA, rework and traced fixes over planned time. */
export function allowanceRatios(history) {
    return history
        .filter((i) => i.completed && !i.origin?.length)
        .flatMap((i) => {
        const planned = i.steps.filter((s) => s.estimateMin !== null).reduce((sum, s) => sum + (s.activeMin ?? 0), 0);
        if (planned <= 0)
            return [];
        const unplanned = i.steps
            .filter((s) => s.estimateMin === null && AFTER.includes(stepKind(s.step)))
            .reduce((sum, s) => sum + (s.activeMin ?? 0), 0);
        return [(unplanned + fixTimeFor(history, i.issue)) / planned];
    });
}
/**
 * Each estimate scaled by past actual/estimate ratios for its kind of step (or every kind when its
 * own has too few), and the total simulated by sampling one ratio per step `runs` times.
 */
export function forecast(estimates, history, options) {
    const all = samples(history);
    const pools = estimates.map(({ step }) => {
        const kind = stepKind(step);
        const own = all.filter((s) => s.kind === kind);
        if (own.length >= MIN_SAMPLES)
            return { basis: kind, ratios: latest(own) };
        if (all.length >= MIN_SAMPLES)
            return { basis: 'all', ratios: latest(all) };
        return { basis: 'none', ratios: [] };
    });
    const steps = estimates.map(({ step, estimateMin }, i) => {
        const { basis, ratios } = pools[i] ?? { basis: 'none', ratios: [] };
        const at = (q) => ratios.length === 0 ? null : Math.round(estimateMin * quantile(ratios, q));
        return { step, kind: stepKind(step), estimateMin, basis, samples: ratios.length, p50Min: at(0.5), p80Min: at(0.8) };
    });
    const estimateMin = estimates.reduce((sum, e) => sum + e.estimateMin, 0);
    if (estimates.length === 0 || pools.some((p) => p.ratios.length === 0)) {
        return { steps, total: { estimateMin, p50Min: null, p80Min: null }, withAllowance: null };
    }
    const pick = (values) => values[Math.floor(options.random() * values.length)] ?? 1;
    const allowance = allowanceRatios(history);
    const totals = [];
    const allowed = [];
    for (let run = 0; run < options.runs; run++) {
        const total = estimates.reduce((sum, { estimateMin: e }, i) => sum + e * pick(pools[i]?.ratios ?? []), 0);
        totals.push(total);
        if (allowance.length >= MIN_ISSUES)
            allowed.push(total * (1 + pick(allowance)));
    }
    const at = (values, q) => Math.round(quantile(values, q));
    return {
        steps,
        total: { estimateMin, p50Min: at(totals, 0.5), p80Min: at(totals, 0.8) },
        withAllowance: allowed.length === 0
            ? null
            : {
                issues: allowance.length,
                medianRatio: Math.round(quantile(allowance, 0.5) * 100) / 100,
                p50Min: at(allowed, 0.5),
                p80Min: at(allowed, 0.8),
            },
    };
}
/**
 * Total active time, including bug fixes traced back to them, of past issues carrying every one of
 * `labels`, when at least three exist.
 */
export function referenceClass(history, labels) {
    const totals = history
        .filter((i) => i.completed && labels.every((l) => i.labels.includes(l)))
        .map((i) => i.steps.reduce((sum, s) => sum + (s.activeMin ?? 0), 0) + fixTimeFor(history, i.issue))
        .filter((total) => total > 0);
    if (totals.length < MIN_ISSUES)
        return null;
    return {
        count: totals.length,
        medianActiveMin: Math.round(quantile(totals, 0.5)),
        q1ActiveMin: Math.round(quantile(totals, 0.25)),
        q3ActiveMin: Math.round(quantile(totals, 0.75)),
    };
}
