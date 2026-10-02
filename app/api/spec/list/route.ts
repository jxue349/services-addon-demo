import { NextResponse } from 'next/server';
import { getSpecEnv } from '@/lib/env';
import { apiErrorFromUnknown, newRequestId } from '@/lib/errors';
import { createSpecRepoClient } from '@/lib/github';
import { specLabel } from '@/lib/spec-paths';
import type { SpecListEntry, SpecListResponse } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Every spec in the repo, for the selector: the parent / knowledge base plus
 * each child spec found under the spec root.
 */
export async function GET(): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const env = getSpecEnv();
    const client = createSpecRepoClient(env);
    const paths = await client.listSpecFiles(env.baseBranch, env.specRoot);

    const parentExists = paths.includes(env.parentPath);

    const specs: SpecListEntry[] = paths.map((path) => ({
      path,
      label: specLabel(path, env.specRoot, env.parentPath),
      isParent: path === env.parentPath,
    }));

    // Parent first — it is the default selection and the thing children merge
    // into, so it should never be buried in an alphabetical list.
    specs.sort((a, b) => (a.isParent === b.isParent ? a.label.localeCompare(b.label) : a.isParent ? -1 : 1));

    const body: SpecListResponse = {
      specs,
      parentPath: env.parentPath,
      specRoot: env.specRoot,
      parentExists,
    };
    return NextResponse.json(body);
  } catch (err) {
    return apiErrorFromUnknown('GET /api/spec/list', err, requestId);
  }
}
