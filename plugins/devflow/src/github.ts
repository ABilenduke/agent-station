import {
  checkBodySize,
  findMarkedComment,
  markedComment,
  readSection,
  setSection,
  type IssueComment,
} from './issue.js';

/** Runs an external command, optionally feeding it stdin, and reports how it ended. */
export type Exec = (
  command: string,
  args: string[],
  input?: string,
) => { status: number; stdout: string; stderr: string };

/** Talks to one repository's issues through `gh api`; PRs share the issue endpoints, so they work too. */
export class GitHub {
  constructor(
    private readonly exec: Exec,
    /** `owner/repo`, or undefined to let `gh` take it from the current directory. */
    private readonly repo: string | undefined,
  ) {}

  private path(rest: string): string {
    return `repos/${this.repo ?? '{owner}/{repo}'}/${rest}`;
  }

  private api(args: string[], body?: string): unknown {
    const input = body === undefined ? undefined : JSON.stringify({ body });
    const result = this.exec('gh', ['api', ...args, ...(input === undefined ? [] : ['--input', '-'])], input);
    if (result.status !== 0) {
      const path = args.find((a) => a === 'user' || a.startsWith('repos/')) ?? args.join(' ');
      throw new Error(`gh api ${path} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    return JSON.parse(result.stdout || 'null') as unknown;
  }

  private login: string | undefined;

  viewer(): string {
    this.login ??= (this.api(['user']) as { login: string }).login;
    return this.login;
  }

  /** Every issue and pull request in the repository, open and closed. */
  issues(): Array<{
    issue: number;
    labels: string[];
    updatedAt: string;
    closed: boolean;
    comments: number;
    pullRequest: boolean;
  }> {
    const pages = this.api(['--paginate', '--slurp', this.path('issues?state=all&per_page=100')]) as Array<
      Array<{
        number: number;
        labels: Array<{ name: string } | string>;
        updated_at: string;
        state: string;
        comments: number;
        pull_request?: unknown;
      }>
    >;
    return pages.flat().map((i) => ({
      issue: i.number,
      labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
      updatedAt: i.updated_at,
      closed: i.state === 'closed',
      comments: i.comments,
      pullRequest: i.pull_request !== undefined,
    }));
  }

  body(issue: number): string {
    return (this.api([this.path(`issues/${issue}`)]) as { body: string | null }).body ?? '';
  }

  comments(issue: number): IssueComment[] {
    const pages = this.api(['--paginate', '--slurp', this.path(`issues/${issue}/comments`)]) as Array<
      Array<{ id: number; body: string | null; user: { login: string } | null }>
    >;
    return pages.flat().map((c) => ({ id: c.id, author: c.user?.login ?? '', body: c.body ?? '' }));
  }

  /** The text of one marked section of the issue body, or null when it has none. */
  section(issue: number, name: string): string | null {
    return readSection(this.body(issue), name);
  }

  /** Replaces or appends one marked section of the issue body. Returns whether it was added. */
  setSection(issue: number, name: string, content: string): 'added' | 'updated' {
    const before = this.body(issue);
    const existed = readSection(before, name) !== null;
    const after = setSection(before, name, content);
    checkBodySize(after);
    this.api(['--method', 'PATCH', this.path(`issues/${issue}`)], after);
    return existed ? 'updated' : 'added';
  }

  /** This account's comment for `key`, if it has posted one. */
  markedComment(issue: number, key: string): IssueComment | undefined {
    return findMarkedComment(this.comments(issue), key, this.viewer());
  }

  /** Edits this account's comment for `key`, or creates it when there is none yet. */
  upsertComment(issue: number, key: string, content: string, provenance: string): 'created' | 'updated' {
    const body = markedComment(key, content, provenance);
    checkBodySize(body);
    const existing = this.markedComment(issue, key);
    if (existing) {
      this.api(['--method', 'PATCH', this.path(`issues/comments/${existing.id}`)], body);
      return 'updated';
    }
    this.api(['--method', 'POST', this.path(`issues/${issue}/comments`)], body);
    return 'created';
  }
}
