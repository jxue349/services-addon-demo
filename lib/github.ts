import { Octokit } from '@octokit/rest';
import type { SpecEnv } from './env';
import type { CommitResponse, HistoryEntry, SpecResponse } from './schemas';

/**
 * GitHub is the state of record for the spec. This module is the only place
 * that talks to it, and it is server-only: the PAT never leaves the process.
 *
 * The repo operations are expressed as a narrow interface so the commit
 * orchestration (branch -> commit -> PR, with the optimistic-concurrency check)
 * can be unit tested without a network or a token.
 */

/** Sentinel `baseSha` meaning "I believe this file does not exist yet". */
export const NEW_FILE_SHA = 'new';

export type RepoFile = { content: string; sha: string };

export interface SpecRepoClient {
  /** Returns null when the path does not exist on `ref`. */
  getFile(ref: string): Promise<RepoFile | null>;
  getBranchHeadSha(branch: string): Promise<string>;
  createBranch(name: string, fromSha: string): Promise<void>;
  putFile(args: {
    branch: string;
    content: string;
    message: string;
    /** Omitted when creating the file for the first time. */
    sha?: string;
  }): Promise<{ commitSha: string; sha: string }>;
  createPullRequest(args: { head: string; title: string; body: string }): Promise<{ url: string }>;
  lastCommitForPath(ref: string): Promise<HistoryEntry | null>;
  listCommitsForPath(ref: string, limit: number): Promise<HistoryEntry[]>;
}

export class SpecConflictError extends Error {
  readonly upstream: RepoFile;

  constructor(upstream: RepoFile) {
    super('Spec changed upstream since it was loaded');
    this.name = 'SpecConflictError';
    this.upstream = upstream;
  }
}

export class SpecNotFoundError extends Error {
  constructor(path: string) {
    super(`Spec file not found at ${path}`);
    this.name = 'SpecNotFoundError';
  }
}

export class DirectCommitForbiddenError extends Error {
  constructor() {
    super('Direct commits to the base branch are disabled (ALLOW_DIRECT_COMMIT=false)');
    this.name = 'DirectCommitForbiddenError';
  }
}

// --------------------------------------------------------------------------
// Orchestration (pure, injectable)
// --------------------------------------------------------------------------

export type CommitInput = {
  content: string;
  baseSha: string;
  commitMessage: string;
  prTitle?: string;
  prBody?: string;
  direct?: boolean;
};

/**
 * Re-reads the file before writing and refuses to write when the blob SHA has
 * moved. A spec is product truth: silently overwriting someone else's rule
 * change is worse than making the user re-apply theirs.
 */
export async function assertNoConflict(client: SpecRepoClient, branch: string, baseSha: string): Promise<RepoFile | null> {
  const current = await client.getFile(branch);

  if (baseSha === NEW_FILE_SHA) {
    // Caller believes the file is absent. If it exists now, someone created it.
    if (current !== null) throw new SpecConflictError(current);
    return null;
  }

  if (current === null) {
    // The file we were editing was deleted upstream.
    throw new SpecConflictError({ content: '', sha: NEW_FILE_SHA });
  }

  if (current.sha !== baseSha) throw new SpecConflictError(current);

  return current;
}

export async function commitSpec(
  client: SpecRepoClient,
  env: Pick<SpecEnv, 'baseBranch' | 'allowDirectCommit'>,
  input: CommitInput,
  now: Date = new Date(),
): Promise<CommitResponse> {
  const wantsDirect = input.direct === true;
  if (wantsDirect && !env.allowDirectCommit) throw new DirectCommitForbiddenError();

  const existing = await assertNoConflict(client, env.baseBranch, input.baseSha);
  const existingSha = existing?.sha;

  if (wantsDirect) {
    const written = await client.putFile({
      branch: env.baseBranch,
      content: input.content,
      message: input.commitMessage,
      ...(existingSha !== undefined ? { sha: existingSha } : {}),
    });
    return { mode: 'direct', branch: env.baseBranch, commitSha: written.commitSha, sha: written.sha };
  }

  const stamp = now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
  const branch = `spec/update-${stamp}`;

  const baseHead = await client.getBranchHeadSha(env.baseBranch);
  await client.createBranch(branch, baseHead);

  const written = await client.putFile({
    branch,
    content: input.content,
    message: input.commitMessage,
    ...(existingSha !== undefined ? { sha: existingSha } : {}),
  });

  const pr = await client.createPullRequest({
    head: branch,
    title: input.prTitle?.trim() || input.commitMessage.split('\n')[0] || 'spec: update',
    body:
      input.prBody?.trim() ||
      'Spec change proposed from AI Spec Explorer.\n\nReview the behavior change, not just the diff.',
  });

  return { mode: 'pull-request', prUrl: pr.url, branch, commitSha: written.commitSha, sha: written.sha };
}

// --------------------------------------------------------------------------
// Octokit-backed implementation
// --------------------------------------------------------------------------

function statusOf(err: unknown): number {
  const status = (err as { status?: unknown })?.status;
  return typeof status === 'number' ? status : 0;
}

function toHistoryEntry(commit: {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name?: string | null; date?: string | null } | null };
  author: { login?: string } | null;
}): HistoryEntry {
  return {
    sha: commit.sha,
    shortSha: commit.sha.slice(0, 7),
    message: commit.commit.message.split('\n')[0] ?? '',
    author: commit.commit.author?.name ?? commit.author?.login ?? 'unknown',
    date: commit.commit.author?.date ?? '',
    htmlUrl: commit.html_url,
  };
}

export function createSpecRepoClient(env: SpecEnv): SpecRepoClient {
  const octokit = new Octokit({ auth: env.githubToken, request: { timeout: 30_000 } });
  const { owner, repo, specPath } = env;

  return {
    async getFile(ref) {
      try {
        const res = await octokit.rest.repos.getContent({ owner, repo, path: specPath, ref });
        const data = res.data;
        if (Array.isArray(data) || data.type !== 'file' || typeof data.content !== 'string') {
          throw new Error(`${specPath} is not a file`);
        }
        return { content: Buffer.from(data.content, 'base64').toString('utf8'), sha: data.sha };
      } catch (err) {
        if (statusOf(err) === 404) return null;
        throw err;
      }
    },

    async getBranchHeadSha(branch) {
      const res = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
      return res.data.object.sha;
    },

    async createBranch(name, fromSha) {
      await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${name}`, sha: fromSha });
    },

    async putFile({ branch, content, message, sha }) {
      const res = await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: specPath,
        branch,
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        committer: { name: env.authorName, email: env.authorEmail },
        author: { name: env.authorName, email: env.authorEmail },
        ...(sha !== undefined ? { sha } : {}),
      });
      return {
        commitSha: res.data.commit.sha ?? '',
        sha: res.data.content?.sha ?? '',
      };
    },

    async createPullRequest({ head, title, body }) {
      const res = await octokit.rest.pulls.create({
        owner,
        repo,
        base: env.baseBranch,
        head,
        title,
        body,
      });
      return { url: res.data.html_url };
    },

    async lastCommitForPath(ref) {
      const res = await octokit.rest.repos.listCommits({ owner, repo, path: specPath, sha: ref, per_page: 1 });
      const first = res.data[0];
      return first ? toHistoryEntry(first) : null;
    },

    async listCommitsForPath(ref, limit) {
      const res = await octokit.rest.repos.listCommits({ owner, repo, path: specPath, sha: ref, per_page: limit });
      return res.data.map(toHistoryEntry);
    },
  };
}

/** Loads the spec plus the version metadata the UI shows in the version badge. */
export async function readSpec(client: SpecRepoClient, env: SpecEnv): Promise<SpecResponse> {
  const file = await client.getFile(env.baseBranch);
  if (file === null) throw new SpecNotFoundError(env.specPath);

  const commit = await client.lastCommitForPath(env.baseBranch);

  return {
    content: file.content,
    sha: file.sha,
    commit: {
      sha: commit?.sha ?? '',
      author: commit?.author ?? 'unknown',
      date: commit?.date ?? '',
      message: commit?.message ?? '',
    },
    htmlUrl: `https://github.com/${env.owner}/${env.repo}/blob/${env.baseBranch}/${env.specPath}`,
    specPath: env.specPath,
    baseBranch: env.baseBranch,
    allowDirectCommit: env.allowDirectCommit,
  };
}
