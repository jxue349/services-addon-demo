import type { NextResponse } from 'next/server';
import { compile } from '@/lib/glean';
import { runCompileRoute } from '@/lib/compile-route';
import { consistencyPrompt } from '@/lib/prompts';
import { ConsistencyRequestSchema, ConsistencySchema } from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * spec <-> prototype <-> QA consistency check. QA coverage is only judged when
 * the client passes a test matrix compiled this session; otherwise "unknown".
 */
export function POST(req: Request): Promise<NextResponse> {
  return runCompileRoute('POST /api/compile/consistency', req, ConsistencyRequestSchema, (body) =>
    compile(consistencyPrompt(body.spec, body.testMatrix), ConsistencySchema),
  );
}
