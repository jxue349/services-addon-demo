import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DirectCommitForbiddenError,
  NEW_FILE_SHA,
  SpecConflictError,
  assertNoConflict,
  commitSpec,
} from '@/lib/github';
import type { RepoFile, SpecRepoClient } from '@/lib/github';

/**
 * The commit route's job is to never silently overwrite product truth. These
 * tests drive the orchestration through a fake repo client — no token, no
 * network.
 */

type FakeOptions = { file?: RepoFile | null };

function makeClient(options: FakeOptions = {}) {
  // Typed against the interface so `mock.calls[n][0]` keeps its argument type.
  const putFile = vi.fn<SpecRepoClient['putFile']>(async () => ({ commitSha: 'commit123', sha: 'blobNEW' }));
  const createBranch = vi.fn<SpecRepoClient['createBranch']>(async () => undefined);
  const createPullRequest = vi.fn<SpecRepoClient['createPullRequest']>(async () => ({
    url: 'https://github.com/o/r/pull/7',
    number: 7,
  }));
  const getFile = vi.fn<SpecRepoClient['getFile']>(async () => options.file ?? null);
  const getBranchHeadSha = vi.fn<SpecRepoClient['getBranchHeadSha']>(async () => 'baseHead');

  const client: SpecRepoClient = {
    getFile,
    getBranchHeadSha,
    createBranch,
    putFile,
    createPullRequest,
    lastCommitForPath: vi.fn(async () => null),
    listCommitsForPath: vi.fn(async () => []),
    listSpecFiles: vi.fn(async () => []),
    requestReviewers: vi.fn(async () => ({ requested: [], refused: [] })),
    updatePullRequestBody: vi.fn(async () => undefined),
  };

  return { client, putFile, createBranch, createPullRequest, getFile, getBranchHeadSha };
}

const env = { baseBranch: 'main', allowDirectCommit: false };
const SPEC_PATH = 'spec/parent.md';
const input = {
  specPath: SPEC_PATH,
  content: '# spec v2',
  baseSha: 'blobOLD',
  commitMessage: 'spec: tighten R-302',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertNoConflict', () => {
  it('passes when the blob SHA still matches', async () => {
    const { client } = makeClient({ file: { content: '# spec', sha: 'blobOLD' } });
    await expect(assertNoConflict(client, 'main', SPEC_PATH, 'blobOLD')).resolves.toEqual({ content: '# spec', sha: 'blobOLD' });
  });

  it('throws with the upstream content when the SHA moved', async () => {
    const { client } = makeClient({ file: { content: '# spec edited elsewhere', sha: 'blobTHEIRS' } });
    try {
      await assertNoConflict(client, 'main', SPEC_PATH, 'blobOLD');
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SpecConflictError);
      expect((err as SpecConflictError).upstream).toEqual({ content: '# spec edited elsewhere', sha: 'blobTHEIRS' });
    }
  });

  it('treats an upstream deletion as a conflict', async () => {
    const { client } = makeClient({ file: null });
    await expect(assertNoConflict(client, 'main', SPEC_PATH, 'blobOLD')).rejects.toBeInstanceOf(SpecConflictError);
  });

  it('accepts a first-time create when the file is absent', async () => {
    const { client } = makeClient({ file: null });
    await expect(assertNoConflict(client, 'main', SPEC_PATH, NEW_FILE_SHA)).resolves.toBeNull();
  });

  it('rejects a first-time create when someone already created the file', async () => {
    const { client } = makeClient({ file: { content: '# theirs', sha: 'blobTHEIRS' } });
    await expect(assertNoConflict(client, 'main', SPEC_PATH, NEW_FILE_SHA)).rejects.toBeInstanceOf(SpecConflictError);
  });
});

describe('commitSpec — pull request flow', () => {
  it('branches from base head, commits, and opens a PR', async () => {
    const { client, createBranch, putFile, createPullRequest, getBranchHeadSha } = makeClient({
      file: { content: '# spec', sha: 'blobOLD' },
    });

    const result = await commitSpec(client, env, input, new Date('2026-09-11T17:04:05.678Z'));

    expect(getBranchHeadSha).toHaveBeenCalledWith('main');
    expect(createBranch).toHaveBeenCalledWith('spec/update-2026-09-11T17-04-05-678', 'baseHead');
    expect(putFile).toHaveBeenCalledWith({
      branch: 'spec/update-2026-09-11T17-04-05-678',
      path: SPEC_PATH,
      content: '# spec v2',
      message: 'spec: tighten R-302',
      sha: 'blobOLD',
    });
    expect(createPullRequest).toHaveBeenCalledOnce();
    expect(result).toEqual({
      mode: 'pull-request',
      prUrl: 'https://github.com/o/r/pull/7',
      branch: 'spec/update-2026-09-11T17-04-05-678',
      commitSha: 'commit123',
      sha: 'blobNEW',
    });
  });

  it('omits the blob SHA when creating the file for the first time', async () => {
    const { client, putFile } = makeClient({ file: null });
    await commitSpec(client, env, { ...input, baseSha: NEW_FILE_SHA });
    expect(putFile.mock.calls[0]?.[0]).not.toHaveProperty('sha');
  });

  it('falls back to the commit message when no PR title is given', async () => {
    const { client, createPullRequest } = makeClient({ file: { content: '# spec', sha: 'blobOLD' } });
    await commitSpec(client, env, { ...input, commitMessage: 'spec: one\nsecond line' });
    expect(createPullRequest.mock.calls[0]?.[0]).toMatchObject({ title: 'spec: one' });
  });

  it('writes nothing when the SHA check fails', async () => {
    const { client, putFile, createBranch } = makeClient({ file: { content: '# theirs', sha: 'blobTHEIRS' } });
    await expect(commitSpec(client, env, input)).rejects.toBeInstanceOf(SpecConflictError);
    expect(createBranch).not.toHaveBeenCalled();
    expect(putFile).not.toHaveBeenCalled();
  });
});

describe('commitSpec — direct commit flow', () => {
  it('is refused when ALLOW_DIRECT_COMMIT is false, without reading the repo', async () => {
    const { client, getFile, putFile } = makeClient({ file: { content: '# spec', sha: 'blobOLD' } });
    await expect(commitSpec(client, env, { ...input, direct: true })).rejects.toBeInstanceOf(
      DirectCommitForbiddenError,
    );
    expect(getFile).not.toHaveBeenCalled();
    expect(putFile).not.toHaveBeenCalled();
  });

  it('commits to the base branch when allowed, with no branch or PR', async () => {
    const { client, putFile, createBranch, createPullRequest } = makeClient({
      file: { content: '# spec', sha: 'blobOLD' },
    });

    const result = await commitSpec(client, { ...env, allowDirectCommit: true }, { ...input, direct: true });

    expect(createBranch).not.toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
    expect(putFile).toHaveBeenCalledWith({
      branch: 'main',
      path: SPEC_PATH,
      content: '# spec v2',
      message: 'spec: tighten R-302',
      sha: 'blobOLD',
    });
    expect(result).toEqual({ mode: 'direct', branch: 'main', commitSha: 'commit123', sha: 'blobNEW' });
  });

  it('still enforces the SHA check when direct commits are allowed', async () => {
    const { client, putFile } = makeClient({ file: { content: '# theirs', sha: 'blobTHEIRS' } });
    await expect(
      commitSpec(client, { ...env, allowDirectCommit: true }, { ...input, direct: true }),
    ).rejects.toBeInstanceOf(SpecConflictError);
    expect(putFile).not.toHaveBeenCalled();
  });
});
