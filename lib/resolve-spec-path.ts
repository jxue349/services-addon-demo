import type { SpecEnv } from './env';
import { assertSpecPath } from './spec-paths';

/**
 * Resolves the `path` query parameter a route received.
 *
 * Omitted means "the parent spec", which keeps every route usable without a
 * selector and preserves the single-spec behaviour. A supplied value is always
 * validated against the spec root before it reaches GitHub.
 */
export function resolveSpecPath(url: string, env: SpecEnv): string {
  const requested = new URL(url).searchParams.get('path');
  if (requested === null || requested.trim() === '') return env.parentPath;

  // The parent may sit outside the spec root (e.g. a legacy SPEC_PATH), so
  // allow it explicitly rather than forcing it through the root check.
  if (requested.trim() === env.parentPath) return env.parentPath;

  return assertSpecPath(requested, env.specRoot);
}

/** Same rule for a path arriving in a JSON body. */
export function resolveSpecPathValue(requested: string, env: SpecEnv): string {
  if (requested.trim() === env.parentPath) return env.parentPath;
  return assertSpecPath(requested, env.specRoot);
}
