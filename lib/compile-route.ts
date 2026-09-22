import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { apiError, apiErrorFromUnknown, logServerError, newRequestId } from './errors';
import { BadRequestError, readJson } from './http';
import { JsonExtractionError, SchemaValidationError } from './json';
import { checkRateLimit, clientKey } from './ratelimit';

/** 20 compiles per minute per client — a cost guard, not an auth boundary. */
const COMPILE_LIMIT_PER_MIN = 20;

/**
 * Shared shell for the four compiler routes: rate limit, validate input,
 * run the compile, map failures onto friendly responses carrying a request id.
 */
export async function runCompileRoute<TReq, TRes>(
  scope: string,
  req: Request,
  requestSchema: ZodType<TReq>,
  handler: (body: TReq) => Promise<TRes>,
): Promise<NextResponse> {
  const requestId = newRequestId();

  const limit = checkRateLimit(`compile:${clientKey(req.headers)}`, COMPILE_LIMIT_PER_MIN);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Too many compiles. Retry in ${limit.retryAfterSeconds}s.`, requestId },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const body = await readJson(req, requestSchema);
    return NextResponse.json(await handler(body));
  } catch (err) {
    if (err instanceof BadRequestError) return apiError(400, err.message, requestId);

    if (err instanceof SchemaValidationError || err instanceof JsonExtractionError) {
      // The model failed the shape contract twice (initial call + corrective
      // retry). That is a compiler problem, not a server crash.
      logServerError(requestId, scope, err);
      return apiError(
        502,
        'The compiler returned output that did not match the expected shape, twice. Try again.',
        requestId,
      );
    }

    return apiErrorFromUnknown(scope, err, requestId);
  }
}
