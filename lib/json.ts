import type { ZodType } from 'zod';

/**
 * Turning model text into a validated object.
 *
 * Model output is untrusted input. Even with a JSON-only instruction, models
 * occasionally wrap the object in a code fence or add a sentence of preamble,
 * so we extract rather than parse the raw string — then validate against a
 * schema so nothing unexpected reaches the UI.
 */

export class JsonExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonExtractionError';
  }
}

export class SchemaValidationError extends Error {
  /** Compact, model-readable description used to build the retry prompt. */
  readonly issues: string;

  constructor(issues: string) {
    super(`Model output failed schema validation: ${issues}`);
    this.name = 'SchemaValidationError';
    this.issues = issues;
  }
}

/** Removes ```json / ``` fences, keeping the fence body. */
export function stripCodeFences(raw: string): string {
  const fence = /```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)```/.exec(raw);
  if (fence && fence[1] !== undefined) return fence[1].trim();
  // Unterminated fence: drop the opener and keep going.
  return raw.replace(/^\s*```[a-zA-Z0-9_-]*\s*\n?/, '').trim();
}

/**
 * Returns the first balanced `{...}` block. Brace counting is string-aware so
 * a `{` inside a JSON string value does not throw off the depth.
 */
export function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  if (start === -1) throw new JsonExtractionError('No JSON object found in model output');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }

  throw new JsonExtractionError('Model output contains an unterminated JSON object');
}

/** Fence-strip -> extract -> JSON.parse. Throws JsonExtractionError on failure. */
export function parseModelJson(raw: string): unknown {
  const candidate = extractFirstJsonObject(stripCodeFences(raw));
  try {
    return JSON.parse(candidate) as unknown;
  } catch (err) {
    throw new JsonExtractionError(`Model output is not valid JSON: ${(err as Error).message}`);
  }
}

/** Formats zod issues into one short line suitable for a retry prompt. */
export function formatIssues(issues: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>): string {
  return issues
    .slice(0, 10)
    .map((i) => `${i.path.length > 0 ? i.path.join('.') : '(root)'}: ${i.message}`)
    .join('; ');
}

/**
 * Full pipeline: parse model text and validate it against `schema`.
 * Throws JsonExtractionError or SchemaValidationError — both carry a message
 * that is safe to feed back to the model for a single corrective retry.
 */
export function parseAndValidate<T>(raw: string, schema: ZodType<T>): T {
  const value = parseModelJson(raw);
  const result = schema.safeParse(value);
  if (!result.success) throw new SchemaValidationError(formatIssues(result.error.issues));
  return result.data;
}
