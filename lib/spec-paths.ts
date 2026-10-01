/**
 * Validation for spec paths that arrive from the client.
 *
 * The selector sends a repo path, and that path goes straight into a GitHub
 * Contents call. Without a check, a crafted value reads (or writes) any file
 * in the repo, so this is a security boundary, not a tidiness helper: the path
 * must stay inside the configured spec root, must be a markdown file, and must
 * not contain traversal or absolute segments.
 *
 * Pure string work — no network, no env — so it is cheap to test exhaustively.
 */

export class InvalidSpecPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidSpecPathError';
  }
}

const MAX_PATH_LENGTH = 400;

/**
 * Returns the normalised path, or throws InvalidSpecPathError.
 *
 * `root` is trusted (it comes from the environment); `candidate` is not.
 */
export function assertSpecPath(candidate: string, root: string): string {
  const raw = candidate.trim();

  if (raw === '') throw new InvalidSpecPathError('Spec path is empty');
  if (raw.length > MAX_PATH_LENGTH) throw new InvalidSpecPathError('Spec path is too long');

  // Reject before normalising: a backslash or NUL means the caller is not
  // sending a plain repo path, and URL-encoded traversal should not be decoded
  // into something that passes.
  if (raw.includes('\\')) throw new InvalidSpecPathError('Spec path must use forward slashes');
  if (/[\u0000-\u001f]/.test(raw)) throw new InvalidSpecPathError('Spec path contains control characters');
  if (raw.includes('%')) throw new InvalidSpecPathError('Spec path must not be URL-encoded');
  if (raw.startsWith('/')) throw new InvalidSpecPathError('Spec path must be relative to the repo root');

  const segments = raw.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new InvalidSpecPathError('Spec path must not contain empty or traversal segments');
  }

  if (!/\.md$/i.test(raw)) throw new InvalidSpecPathError('Spec path must name a .md file');

  // Confine to the spec root. Compared segment-wise so "specials/x.md" cannot
  // pass as being inside "spec".
  const rootSegments = root.split('/').filter((segment) => segment !== '');
  if (rootSegments.length > 0) {
    const insideRoot =
      segments.length > rootSegments.length && rootSegments.every((segment, i) => segments[i] === segment);
    if (!insideRoot) throw new InvalidSpecPathError(`Spec path must be inside ${root}/`);
  }

  return raw;
}

/** True when `candidate` is acceptable, for places that want a boolean. */
export function isSpecPath(candidate: string, root: string): boolean {
  try {
    assertSpecPath(candidate, root);
    return true;
  } catch {
    return false;
  }
}

/**
 * Display label for a spec: the directory under the root, or the file's own
 * stem when it sits directly in the root (as the parent spec does).
 */
export function specLabel(path: string, root: string, parentPath: string): string {
  if (path === parentPath) return 'Parent spec (knowledge base)';

  const rootSegments = root.split('/').filter((s) => s !== '');
  const segments = path.split('/').slice(rootSegments.length);

  // spec/cam-plus/behavior.md -> "cam-plus"; spec/notes.md -> "notes"
  const label = segments.length > 1 ? segments[0] : segments[0]?.replace(/\.md$/i, '');
  return label ?? path;
}
