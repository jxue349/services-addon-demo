import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { SpecIsDirectoryError, SpecNotFoundError, createSpecRepoClient, readSpec } from '@/lib/github';
import { resolveSpecPath } from '@/lib/resolve-spec-path';
import { InvalidSpecPathError } from '@/lib/spec-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Pull latest" — identical to GET /api/spec, exposed as a POST so the button
 * reads as an action and is never served from a cache.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const specPath = resolveSpecPath(req.url, env);
    const spec = await readSpec(createSpecRepoClient(env), env, specPath);
    return NextResponse.json(spec);
  } catch (err) {
    if (err instanceof InvalidSpecPathError) return apiError(400, err.message, requestId);
    if (err instanceof SpecNotFoundError) return apiError(404, err.message, requestId);
    if (err instanceof SpecIsDirectoryError) return apiError(500, err.message, requestId);
    return apiErrorFromUnknown('POST /api/spec/refresh', err, requestId);
  }
}
