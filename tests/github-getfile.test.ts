import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getFile() against a mocked Octokit.
 *
 * The case that matters: over 1 MB the Contents API returns metadata with an
 * empty `content` and encoding "none". Decoding that silently yields "", so
 * the spec reads as blank and a later check-in would commit the blank over
 * the real file. Found against a real repo, so it stays covered.
 */

const { getContent, getBlob, getRef, getTree } = vi.hoisted(() => ({
  getContent: vi.fn(),
  getBlob: vi.fn(),
  getRef: vi.fn(),
  getTree: vi.fn(),
}));

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      repos: { getContent },
      git: { getBlob, getRef, getTree },
    };
  },
}));

import { createSpecRepoClient } from '@/lib/github';
import type { SpecEnv } from '@/lib/env';

const env: SpecEnv = {
  githubToken: 'token',
  owner: 'jxue349',
  repo: 'services-addon-demo',
  specRoot: 'spec',
  parentPath: 'spec/parent.md',
  baseBranch: 'main',
  authorName: 'AI Spec Explorer',
  authorEmail: 'spec-explorer@wyze.com',
  allowDirectCommit: false,
};

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getFile', () => {
  it('decodes a normal base64 file without touching the blob API', async () => {
    getContent.mockResolvedValueOnce({
      data: { type: 'file', encoding: 'base64', content: b64('# spec'), sha: 'blob1', size: 6 },
    });

    await expect(createSpecRepoClient(env).getFile('main', env.parentPath)).resolves.toEqual({ content: '# spec', sha: 'blob1' });
    expect(getBlob).not.toHaveBeenCalled();
  });

  it('falls back to the blob API when the file is too large for the contents API', async () => {
    getContent.mockResolvedValueOnce({
      data: { type: 'file', encoding: 'none', content: '', sha: 'blobBIG', size: 1_400_000 },
    });
    getBlob.mockResolvedValueOnce({ data: { encoding: 'base64', content: b64('# the real spec') } });

    const file = await createSpecRepoClient(env).getFile('main', env.parentPath);

    expect(getBlob).toHaveBeenCalledWith({ owner: 'jxue349', repo: 'services-addon-demo', file_sha: 'blobBIG' });
    // Never silently blank.
    expect(file).toEqual({ content: '# the real spec', sha: 'blobBIG' });
  });

  it('keeps the contents-API sha, not the blob sha, so the conflict check still works', async () => {
    getContent.mockResolvedValueOnce({
      data: { type: 'file', encoding: 'none', content: '', sha: 'blobBIG', size: 1_400_000 },
    });
    getBlob.mockResolvedValueOnce({ data: { encoding: 'base64', content: b64('x'), sha: 'somethingElse' } });

    await expect(createSpecRepoClient(env).getFile('main', env.parentPath)).resolves.toMatchObject({ sha: 'blobBIG' });
  });

  it('throws rather than returning blank when the blob is not decodable', async () => {
    getContent.mockResolvedValueOnce({
      data: { type: 'file', encoding: 'none', content: '', sha: 'blobBIG', size: 1_400_000 },
    });
    getBlob.mockResolvedValueOnce({ data: { encoding: 'utf-16', content: '??' } });

    await expect(createSpecRepoClient(env).getFile('main', env.parentPath)).rejects.toThrow(/could not be decoded/);
  });

  it('treats a genuinely empty file as empty, without a blob round trip', async () => {
    getContent.mockResolvedValueOnce({
      data: { type: 'file', encoding: 'base64', content: '', sha: 'blobEMPTY', size: 0 },
    });

    await expect(createSpecRepoClient(env).getFile('main', env.parentPath)).resolves.toEqual({ content: '', sha: 'blobEMPTY' });
    expect(getBlob).not.toHaveBeenCalled();
  });

  it('returns null on 404 so the UI can offer to initialize the spec', async () => {
    getContent.mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }));
    await expect(createSpecRepoClient(env).getFile('main', env.parentPath)).resolves.toBeNull();
  });

  it('rejects a non-file entry that is not a directory listing', async () => {
    getContent.mockResolvedValueOnce({ data: { type: 'submodule', sha: 'x' } });
    await expect(createSpecRepoClient(env).getFile('main', env.parentPath)).rejects.toThrow(/is not a file/);
  });
});

describe('getFile with a directory path', () => {
  it('names the .md files to choose from', async () => {
    getContent.mockResolvedValueOnce({
      data: [
        { type: 'file', name: 'behavior.md', path: 'spec/behavior.md' },
        { type: 'file', name: 'devices.md', path: 'spec/devices.md' },
        { type: 'file', name: 'README.txt', path: 'spec/README.txt' },
        { type: 'dir', name: 'archive', path: 'spec/archive' },
      ],
    });

    const client = createSpecRepoClient(env);
    await expect(client.getFile('main', 'spec')).rejects.toThrow(/is a directory. Set it to one file, e\.g\. spec\/behavior\.md/);
  });

  it('says so plainly when the directory holds no specs', async () => {
    getContent.mockResolvedValueOnce({ data: [{ type: 'dir', name: 'archive', path: 'spec/archive' }] });

    const client = createSpecRepoClient(env);
    await expect(client.getFile('main', env.parentPath)).rejects.toThrow(/contains no \.md files/);
  });
});

describe('listSpecFiles', () => {
  it('returns only .md blobs under the spec root, sorted', async () => {
    getRef.mockResolvedValueOnce({ data: { object: { sha: 'headsha' } } });
    getTree.mockResolvedValueOnce({
      data: {
        tree: [
          { type: 'blob', path: 'spec/parent.md' },
          { type: 'blob', path: 'spec/cam-plus/behavior.md' },
          { type: 'blob', path: 'spec/cam-plus/notes.txt' },
          { type: 'tree', path: 'spec/cam-plus' },
          { type: 'blob', path: 'README.md' },
          { type: 'blob', path: 'specials/elsewhere.md' },
        ],
      },
    });

    const files = await createSpecRepoClient(env).listSpecFiles('main', 'spec');

    expect(files).toEqual(['spec/cam-plus/behavior.md', 'spec/parent.md']);
    // "specials/" shares a prefix with "spec" and must not be included.
    expect(files).not.toContain('specials/elsewhere.md');
    expect(files).not.toContain('README.md');
    expect(getTree).toHaveBeenCalledWith(
      expect.objectContaining({ tree_sha: 'headsha', recursive: 'true' }),
    );
  });

  it('returns an empty list when the root holds no specs', async () => {
    getRef.mockResolvedValueOnce({ data: { object: { sha: 'headsha' } } });
    getTree.mockResolvedValueOnce({ data: { tree: [{ type: 'blob', path: 'README.md' }] } });

    await expect(createSpecRepoClient(env).listSpecFiles('main', 'spec')).resolves.toEqual([]);
  });
});
