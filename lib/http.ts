import type { ZodType } from 'zod';
import { formatIssues } from './json';
import { SPEC_MAX_BYTES } from './schemas';

/** Hard cap on request bodies, sized for a 100 KB spec plus JSON overhead. */
const MAX_BODY_BYTES = SPEC_MAX_BYTES + 32 * 1024;

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Reads and validates a JSON body. Everything crossing the API boundary goes
 * through here — no `any`, no unchecked casts.
 */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  const declared = req.headers.get('content-length');
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    throw new BadRequestError('Request body is too large.');
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    throw new BadRequestError('Request body is too large.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new BadRequestError('Request body is not valid JSON.');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) throw new BadRequestError(`Invalid request: ${formatIssues(result.error.issues)}`);
  return result.data;
}
