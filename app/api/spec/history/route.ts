import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { createSpecRepoClient } from '@/lib/github';
import type { HistoryEntry } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 10;

/** Last 10 commits touching SPEC_PATH, for the history drawer. */
export async function GET(): Promise<NextResponse<{ commits: HistoryEntry[] } | { error: string; requestId: string }>> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const client = createSpecRepoClient(env);
    const commits = await client.listCommitsForPath(env.baseBranch, HISTORY_LIMIT);
    return NextResponse.json({ commits });
  } catch (err) {
    return apiErrorFromUnknown('GET /api/spec/history', err, requestId);
  }
}
