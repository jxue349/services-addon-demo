import type { NextResponse } from 'next/server';
import { compile } from '@/lib/glean';
import { runCompileRoute } from '@/lib/compile-route';
import { explorerScenarioPrompt, explorerWhatIfPrompt } from '@/lib/prompts';
import {
  ExplorerRequestSchema,
  ExplorerScenarioResultSchema,
  ExplorerWhatIfResultSchema,
} from '@/lib/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Behavior Explorer: scenario entitlement resolution, or a free-form what-if. */
export function POST(req: Request): Promise<NextResponse> {
  return runCompileRoute('POST /api/compile/explorer', req, ExplorerRequestSchema, async (body) => {
    if ('scenario' in body) {
      const result = await compile(explorerScenarioPrompt(body.spec, body.scenario), ExplorerScenarioResultSchema);
      return { kind: 'scenario' as const, result };
    }
    const result = await compile(explorerWhatIfPrompt(body.spec, body.question), ExplorerWhatIfResultSchema);
    return { kind: 'whatIf' as const, result };
  });
}
