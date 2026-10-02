import type { NextResponse } from 'next/server';
import { compile } from '@/lib/glean';
import { runCompileRoute } from '@/lib/compile-route';
import { conflictPrompt } from '@/lib/prompts';
import { ConflictReportSchema, ConflictRequestSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Checks a child spec against the parent knowledge base: what can be merged,
 * what contradicts, what is already covered.
 *
 * Both documents go in whole, so this is the heaviest prompt in the app and
 * the first that will feel the parent's growth. See the README note on when
 * whole-document prompting stops being viable.
 */
export function POST(req: Request): Promise<NextResponse> {
  return runCompileRoute('POST /api/compile/conflicts', req, ConflictRequestSchema, (body) =>
    compile(conflictPrompt(body.parentSpec, body.childSpec, body.childLabel), ConflictReportSchema),
  );
}
