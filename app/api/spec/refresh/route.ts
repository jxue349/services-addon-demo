import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { SpecNotFoundError, createSpecRepoClient, readSpec } from '@/lib/github';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Pull latest" — identical to GET /api/spec, exposed as a POST so the button
 * reads as an action and is never served from a cache.
 */
export async function POST(): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const spec = await readSpec(createSpecRepoClient(env), env);
    return NextResponse.json(spec);
  } catch (err) {
    if (err instanceof SpecNotFoundError) return apiError(404, err.message, requestId);
    return apiErrorFromUnknown('POST /api/spec/refresh', err, requestId);
  }
}
