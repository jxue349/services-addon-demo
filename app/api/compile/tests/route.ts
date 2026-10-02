import type { NextResponse } from 'next/server';
import { compile } from '@/lib/glean';
import { runCompileRoute } from '@/lib/compile-route';
import { testMatrixPrompt } from '@/lib/prompts';
import { SpecOnlyRequestSchema, TestMatrixSchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** QA test matrix, weighted toward behavior the prototype never visualized. */
export function POST(req: Request): Promise<NextResponse> {
  return runCompileRoute('POST /api/compile/tests', req, SpecOnlyRequestSchema, (body) =>
    compile(testMatrixPrompt(body.spec), TestMatrixSchema),
  );
}
