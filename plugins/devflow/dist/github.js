import { checkBodySize, findMarkedComment, markedComment, readSection, setSection, } from './issue.js';
/** Talks to one repository's issues through `gh api`; PRs share the issue endpoints, so they work too. */
export class GitHub {
    exec;
    repo;
    constructor(exec, 
    /** `owner/repo`, or undefined to let `gh` take it from the current directory. */
    repo) {
        this.exec = exec;
        this.repo = repo;
    }
    path(rest) {
        return `repos/${this.repo ?? '{owner}/{repo}'}/${rest}`;
    }
    api(args, body) {
        const input = body === undefined ? undefined : JSON.stringify({ body });
        const result = this.exec('gh', ['api', ...args, ...(input === undefined ? [] : ['--input', '-'])], input);
        if (result.status !== 0) {
            const path = args.find((a) => a === 'user' || a.startsWith('repos/')) ?? args.join(' ');
            throw new Error(`gh api ${path} failed: ${(result.stderr || result.stdout).trim()}`);
        }
        return JSON.parse(result.stdout || 'null');
    }
    login;
    viewer() {
        this.login ??= this.api(['user']).login;
        return this.login;
    }
    /** Every issue and pull request in the repository, open and closed. */
    issues() {
        const pages = this.api(['--paginate', '--slurp', this.path('issues?state=all&per_page=100')]);
        return pages.flat().map((i) => ({
            issue: i.number,
            labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
            updatedAt: i.updated_at,
            closed: i.state === 'closed',
            comments: i.comments,
            pullRequest: i.pull_request !== undefined,
        }));
    }
    body(issue) {
        return this.api([this.path(`issues/${issue}`)]).body ?? '';
    }
    comments(issue) {
        const pages = this.api(['--paginate', '--slurp', this.path(`issues/${issue}/comments`)]);
        return pages.flat().map((c) => ({ id: c.id, author: c.user?.login ?? '', body: c.body ?? '' }));
    }
    /** The text of one marked section of the issue body, or null when it has none. */
    section(issue, name) {
        return readSection(this.body(issue), name);
    }
    /** Replaces or appends one marked section of the issue body. Returns whether it was added. */
    setSection(issue, name, content) {
        const before = this.body(issue);
        const existed = readSection(before, name) !== null;
        const after = setSection(before, name, content);
        checkBodySize(after);
        this.api(['--method', 'PATCH', this.path(`issues/${issue}`)], after);
        return existed ? 'updated' : 'added';
    }
    /** This account's comment for `key`, if it has posted one. */
    markedComment(issue, key) {
        return findMarkedComment(this.comments(issue), key, this.viewer());
    }
    /** Edits this account's comment for `key`, or creates it when there is none yet. */
    upsertComment(issue, key, content, provenance) {
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
