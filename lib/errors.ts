import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { InvalidEnvError, MissingEnvError } from './env';

export type ApiErrorBody = {
  error: string;
  requestId: string;
  /** Present on 409 conflicts so the UI can show a merge prompt. */
  upstream?: { content: string; sha: string };
};

export function newRequestId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Redacts anything that looks like a credential before a string is logged.
 * Defence in depth: callers are not supposed to log secrets in the first place,
 * but SDK errors have been known to echo request headers.
 */
export function redact(input: string): string {
  return input
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, 'gh?_[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, 'github_pat_[REDACTED]')
    // Glean platform tokens are opaque, so the header is what we can match on.
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [REDACTED]')
    .replace(/(authorization|x-api-key|x-glean-actas)(["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, '$1$2[REDACTED]');
}

/** Logs server-side with a correlatable id; the client only ever sees the id. */
export function logServerError(requestId: string, scope: string, err: unknown): void {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const stack = err instanceof Error && err.stack ? `\n${err.stack}` : '';
  console.error(`[${requestId}] ${scope} ${redact(message + stack)}`);
}

export function apiError(status: number, message: string, requestId: string): NextResponse<ApiErrorBody> {
  return NextResponse.json({ error: message, requestId }, { status });
}

/**
 * Maps an unexpected exception to a friendly response. Never leaks stacks,
 * upstream bodies, or env values to the client.
 */
export function apiErrorFromUnknown(scope: string, err: unknown, requestId: string): NextResponse<ApiErrorBody> {
  logServerError(requestId, scope, err);

  if (err instanceof MissingEnvError) {
    return apiError(
      500,
      `Server is not configured: ${err.missing.join(', ')} is not set. See .env.example.`,
      requestId,
    );
  }

  if (err instanceof InvalidEnvError) {
    // The message names a variable and its allowed values, never a value.
    return apiError(500, `Server is misconfigured: ${err.message}`, requestId);
  }

  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 0;

  if (status === 401 || status === 403) {
    return apiError(502, 'Upstream rejected our credentials. Check the server token configuration.', requestId);
  }
  if (status === 404) {
    return apiError(404, 'Upstream resource not found.', requestId);
  }
  if (status === 429) {
    return apiError(429, 'Upstream rate limit hit. Wait a moment and retry.', requestId);
  }
  if (err instanceof Error && /abort|timeout/i.test(err.name + err.message)) {
    return apiError(504, 'The request timed out after 30s. Try again.', requestId);
  }

  return apiError(500, 'Something went wrong on the server.', requestId);
}
