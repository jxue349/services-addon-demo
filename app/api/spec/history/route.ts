import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { createSpecRepoClient } from '@/lib/github';
import { resolveSpecPath } from '@/lib/resolve-spec-path';
import { InvalidSpecPathError } from '@/lib/spec-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 10;

/**
 * Last 10 commits touching one spec, for the history drawer. Those commits
 * *are* the version history — v1 is the first of them.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const specPath = resolveSpecPath(req.url, env);
    const client = createSpecRepoClient(env);
    // Fetch one extra to detect truncation: version numbers are only
    // meaningful when this page is the spec's complete history. Numbering a
    // truncated page would label the 15th commit "v10".
    const fetched = await client.listCommitsForPath(env.baseBranch, specPath, HISTORY_LIMIT + 1);
    const truncated = fetched.length > HISTORY_LIMIT;
    const commits = fetched.slice(0, HISTORY_LIMIT);

    const versioned = commits.map((commit, i) => ({
      ...commit,
      // Oldest commit touching the path is v1; null when we cannot be sure.
      version: truncated ? null : commits.length - i,
    }));

    return NextResponse.json({ commits: versioned, specPath, truncated });
  } catch (err) {
    if (err instanceof InvalidSpecPathError) return apiError(400, err.message, requestId);
    return apiErrorFromUnknown('GET /api/spec/history', err, requestId);
  }
}
