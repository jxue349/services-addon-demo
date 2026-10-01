import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiError, apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { DirectCommitForbiddenError, SpecConflictError, commitSpec, createSpecRepoClient } from '@/lib/github';
import { BadRequestError, readJson } from '@/lib/http';
import { resolveSpecPathValue } from '@/lib/resolve-spec-path';
import { CommitRequestSchema } from '@/lib/schemas';
import { InvalidSpecPathError } from '@/lib/spec-paths';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Checks a spec change back into GitHub.
 *
 * Default path is branch + pull request: a spec change is a product-truth
 * change and needs review, and a PR gives us revert-based rollback. Direct
 * commits require both ALLOW_DIRECT_COMMIT=true and an explicit `direct: true`
 * from a UI that has already shown a confirmation step.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const body = await readJson(req, CommitRequestSchema);
    const env = getSpecEnv();
    // Never trust the path from the client: confine it to the spec root.
    const specPath = resolveSpecPathValue(body.specPath, env);
    const client = createSpecRepoClient(env);
    const result = await commitSpec(client, env, { ...body, specPath });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BadRequestError) return apiError(400, err.message, requestId);
    if (err instanceof InvalidSpecPathError) return apiError(400, err.message, requestId);

    if (err instanceof SpecConflictError) {
      // 409 carries the upstream content so the UI can show a merge prompt
      // instead of clobbering someone else's rule change.
      return NextResponse.json(
        {
          error: 'The spec changed upstream since you loaded it — review and re-apply your edit.',
          requestId,
          upstream: err.upstream,
        },
        { status: 409 },
      );
    }

    if (err instanceof DirectCommitForbiddenError) return apiError(403, err.message, requestId);

    return apiErrorFromUnknown('POST /api/spec/commit', err, requestId);
  }
}
