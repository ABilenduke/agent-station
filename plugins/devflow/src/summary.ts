import { computeTimes } from './active.js';
import type { LedgerEvent } from './ledger.js';

export interface Calibration {
  /** Steps that finished with an estimate and measured active time. */
  count: number;
  /** Median of actual active minutes divided by estimated minutes. */
  median: number;
  q1: number;
  q3: number;
}

export interface FeatureTotals {
  name: string;
  estimateMin: number | null;
  activeMs: number | null;
  wallMs: number | null;
}

export interface Summary {
  calibration: Calibration | null;
  features: FeatureTotals[];
}

/** Linear-interpolation quantile of the values (they need not be sorted). */
export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const low = sorted[lo] ?? 0;
  const high = sorted[Math.min(lo + 1, sorted.length - 1)] ?? low;
  return low + (h - lo) * (high - low);
}

export function summarize(ledgers: { name: string; events: LedgerEvent[] }[]): Summary {
  const ratios: number[] = [];
  const features = ledgers.map(({ name, events }): FeatureTotals => {
    const times = computeTimes(events);
    for (const s of times.steps) {
      if (s.finished !== null && s.estimateMin && s.activeMs !== null) {
        ratios.push(s.activeMs / 60_000 / s.estimateMin);
      }
    }
    return { name, ...times.total };
  });
  const calibration =
    ratios.length === 0
      ? null
      : { count: ratios.length, median: quantile(ratios, 0.5), q1: quantile(ratios, 0.25), q3: quantile(ratios, 0.75) };
  return { calibration, features };
}
