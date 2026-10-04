import type { CliDeps } from '../src/cli-core.js';

interface FakeComment {
  id: number;
  body: string;
  user: { login: string };
}

/** An in-memory stand-in for the parts of GitHub's REST API that `worklog` calls through `gh api`. */
export class FakeGitHub {
  viewer = 'owner';
  issues = new Map<
    number,
    {
      body: string | null;
      comments: FakeComment[];
      labels: string[];
      state: string;
      stateReason: string;
      updatedAt: string;
      pr: boolean;
    }
  >();
  calls: Array<{ command: string; args: string[]; input: string | undefined }> = [];
  /** When set, every call fails with this message on stderr. */
  failure: string | null = null;
  private nextId = 100;

  issue(
    number: number,
    body: string | null = '',
    meta: {
      labels?: string[];
      state?: 'open' | 'closed';
      stateReason?: 'completed' | 'not_planned';
      updatedAt?: string;
      pr?: boolean;
    } = {},
  ): void {
    this.issues.set(number, {
      body,
      comments: [],
      labels: meta.labels ?? [],
      state: meta.state ?? 'open',
      stateReason: meta.stateReason ?? 'completed',
      updatedAt: meta.updatedAt ?? '2026-10-01T00:00:00Z',
      pr: meta.pr ?? false,
    });
  }

  comment(number: number, author: string, body: string): number {
    const id = this.nextId++;
    this.issues.get(number)?.comments.push({ id, body, user: { login: author } });
    return id;
  }

  comments(number: number): FakeComment[] {
    return this.issues.get(number)?.comments ?? [];
  }

  exec: CliDeps['exec'] = (command, args, input) => {
    this.calls.push({ command, args, input });
    if (this.failure !== null) return { status: 1, stdout: '', stderr: this.failure };
    if (command !== 'gh' || args[0] !== 'api') return notFound(`unexpected command ${command} ${args.join(' ')}`);
    const methodAt = args.indexOf('--method');
    const method = methodAt === -1 ? 'GET' : args[methodAt + 1];
    const path = args.find((a) => a === 'user' || a.startsWith('repos/')) ?? '';
    const payload = input === undefined || input === '' ? {} : (JSON.parse(input) as { body?: string });
    if (path === 'user') return ok({ login: this.viewer });

    if (/^repos\/[^/]+\/[^/]+\/issues\?/.test(path)) {
      // --paginate --slurp: one page holding every issue, newest first like GitHub.
      const list = [...this.issues.entries()].reverse().map(([number, i]) => ({
        number,
        labels: i.labels.map((name) => ({ name })),
        state: i.state,
        state_reason: i.state === 'closed' ? i.stateReason : null,
        updated_at: i.updatedAt,
        comments: i.comments.length,
        ...(i.pr ? { pull_request: {} } : {}),
      }));
      return ok([list]);
    }
    const issuePath = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)$/.exec(path);
    const commentsPath = /^repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(path);
    const commentPath = /^repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/.exec(path);
    if (issuePath) {
      const number = Number(issuePath[1]);
      const issue = this.issues.get(number);
      if (!issue) return notFound('Not Found (HTTP 404)');
      if (method === 'PATCH') issue.body = payload.body ?? issue.body;
      return ok({ number, body: issue.body });
    }
    if (commentsPath) {
      const number = Number(commentsPath[1]);
      const issue = this.issues.get(number);
      if (!issue) return notFound('Not Found (HTTP 404)');
      if (method === 'POST') {
        const id = this.comment(number, this.viewer, payload.body ?? '');
        return ok({ id });
      }
      // --paginate --slurp: an array of pages, two comments per page.
      const pages: FakeComment[][] = [];
      for (let i = 0; i < issue.comments.length; i += 2) pages.push(issue.comments.slice(i, i + 2));
      return ok(pages);
    }
    if (commentPath && method === 'PATCH') {
      const id = Number(commentPath[1]);
      for (const issue of this.issues.values()) {
        const found = issue.comments.find((c) => c.id === id);
        if (found) {
          found.body = payload.body ?? found.body;
          return ok({ id });
        }
      }
    }
    return notFound('Not Found (HTTP 404)');
  };
}

function ok(value: unknown): { status: number; stdout: string; stderr: string } {
  return { status: 0, stdout: JSON.stringify(value), stderr: '' };
}

function notFound(message: string): { status: number; stdout: string; stderr: string } {
  return { status: 1, stdout: '', stderr: `gh: ${message}` };
}
