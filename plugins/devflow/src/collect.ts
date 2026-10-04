import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { GitHub } from './github.js';
import { parseDataLine, type IssueRecord } from './history.js';

interface CachedIssue extends IssueRecord {
  updatedAt: string;
  closed: boolean;
}

function readCache(path: string): Map<number, CachedIssue> {
  try {
    const cached = JSON.parse(readFileSync(path, 'utf8')) as { issues: CachedIssue[] };
    return new Map(cached.issues.map((i) => [i.issue, i]));
  } catch {
    return new Map();
  }
}

/**
 * Every issue's time data from your `time` comments, with each local ledger's newer steps laid over
 * it. Closed issues are cached at `cachePath` until they change; open ones are always read again.
 */
export function collectHistory(gh: GitHub, cachePath: string, local: IssueRecord[]): IssueRecord[] {
  const cache = readCache(cachePath);
  const records = new Map<number, CachedIssue>();
  for (const listed of gh.issues()) {
    if (listed.pullRequest) continue;
    const cached = cache.get(listed.issue);
    if (cached && cached.closed && listed.closed && cached.updatedAt === listed.updatedAt) {
      records.set(listed.issue, { ...cached, labels: listed.labels });
      continue;
    }
    const data = listed.comments === 0 ? null : parseDataLine(gh.markedComment(listed.issue, 'time')?.body ?? '');
    records.set(listed.issue, {
      issue: listed.issue,
      labels: listed.labels,
      ...(data?.origin ? { origin: data.origin } : {}),
      steps: data?.steps ?? [],
      updatedAt: listed.updatedAt,
      closed: listed.closed,
    });
  }
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, `${JSON.stringify({ issues: [...records.values()] }, null, 2)}\n`, 'utf8');

  const merged = new Map<number, IssueRecord>([...records].map(([n, r]) => [n, { ...r }]));
  for (const ledger of local) {
    const known = merged.get(ledger.issue);
    const steps = new Map((known?.steps ?? []).map((s) => [s.step, s]));
    for (const s of ledger.steps) steps.set(s.step, s);
    const origin = ledger.origin ?? known?.origin;
    merged.set(ledger.issue, {
      issue: ledger.issue,
      labels: known?.labels ?? [],
      ...(origin ? { origin } : {}),
      steps: [...steps.values()],
    });
  }
  return [...merged.values()]
    .filter((r) => r.steps.length > 0)
    .map(({ issue, labels, origin, steps }) => ({ issue, labels, ...(origin ? { origin } : {}), steps }));
}
