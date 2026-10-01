import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { SpecIsDirectoryError, SpecNotFoundError, createSpecRepoClient, readSpec } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Loads the spec at the head of the base branch, with version metadata. */
export async function GET(): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const spec = await readSpec(createSpecRepoClient(env), env);
    return NextResponse.json(spec);
  } catch (err) {
    if (err instanceof SpecNotFoundError) {
      // The UI turns this into the "Initialize spec in repo" offer.
      return apiError(404, err.message, requestId);
    }
    // Server misconfiguration, not a client error: say which file to pick.
    if (err instanceof SpecIsDirectoryError) return apiError(500, err.message, requestId);
    return apiErrorFromUnknown('GET /api/spec', err, requestId);
  }
}
