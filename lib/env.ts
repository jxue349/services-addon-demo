/**
 * Server-only environment access.
 *
 * Everything in here reads `process.env` directly and is imported exclusively
 * from API routes. No value from this module is ever returned to the client,
 * and there is no NEXT_PUBLIC_* mirror of any of it.
 */

export type SpecEnv = {
  githubToken: string;
  owner: string;
  repo: string;
  /**
   * Directory holding every spec. The parent spec (the knowledge base) lives
   * at `parentPath`; each child spec sits in its own subdirectory under here.
   * Every path the app will read or write is confined to this subtree.
   */
  specRoot: string;
  /** The parent spec / knowledge base. Always selectable, never a child. */
  parentPath: string;
  baseBranch: string;
  authorName: string;
  authorEmail: string;
  allowDirectCommit: boolean;
};

/**
 * `agent` selects how Glean answers.
 *
 * GPT is the only value that talks straight to the LLM with no company-knowledge
 * retrieval, which is what a behavior compiler needs: the spec in the editor is
 * the single source of truth, and a retrieval agent would blend real Wyze
 * subscription docs into answers that claim to be spec-derived.
 *
 * DEFAULT, FAST and ADVANCED all reach into company knowledge. Glean is
 * deprecating DEFAULT and GPT in favour of FAST/ADVANCED, so this will need
 * revisiting — see the README.
 */
export type GleanAgent = 'GPT' | 'DEFAULT' | 'FAST' | 'ADVANCED';

const GLEAN_AGENTS: GleanAgent[] = ['GPT', 'DEFAULT', 'FAST', 'ADVANCED'];

export type CompilerEnv = {
  /**
   * How we authenticate to Glean. Both land on the same
   * `Authorization: Bearer` header; they differ only in where the token
   * comes from.
   *
   * - `static`: a platform token issued in the Glean admin console.
   * - `client-credentials`: an OAuth client this app exchanges for a
   *   short-lived token itself. Preferred for a server: no human in the
   *   loop, and the secret can be rotated without touching the app.
   */
  auth:
    | { kind: 'static'; apiKey: string }
    | { kind: 'client-credentials'; clientId: string; clientSecret: string; scope: string };
  /** Origin only, no trailing slash. */
  baseUrl: string;
  agent: GleanAgent;
  mode: string;
  /** Only set when the credential is global rather than user-scoped. */
  actAs: string | undefined;
};

export class InvalidEnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidEnvError';
  }
}

export class MissingEnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    // Names only — never values.
    super(`Missing required server environment variable(s): ${missing.join(', ')}`);
    this.name = 'MissingEnvError';
    this.missing = missing;
  }
}

function require_(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const value = process.env[name];
    if (value === undefined || value.trim() === '') {
      missing.push(name);
    } else {
      out[name] = value.trim();
    }
  }
  if (missing.length > 0) throw new MissingEnvError(missing);
  return out;
}

/** Repo paths are always relative and never end in a slash. */
function stripSlashes(value: string): string {
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

function requireRoot(root: string): string {
  if (root === '') {
    throw new InvalidEnvError('SPEC_ROOT must name a directory (it confines which files the app may touch)');
  }
  return root;
}

function pick(record: Record<string, string>, key: string): string {
  const value = record[key];
  if (value === undefined) throw new MissingEnvError([key]);
  return value;
}

export function getSpecEnv(): SpecEnv {
  const required = require_(['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO']);
  return {
    githubToken: pick(required, 'GITHUB_TOKEN'),
    owner: pick(required, 'GITHUB_OWNER'),
    repo: pick(required, 'GITHUB_REPO'),
    // Must be non-empty: an empty root would make assertSpecPath's containment
    // check a no-op and let any .md in the repo be read or written.
    specRoot: requireRoot(stripSlashes(process.env.SPEC_ROOT?.trim() || 'spec')),
    // SPEC_PATH is the pre-multi-spec name for the same thing; honour it so
    // existing deployments keep pointing at their spec after the upgrade.
    parentPath: stripSlashes(
      process.env.SPEC_PARENT_PATH?.trim() ||
        process.env.SPEC_PATH?.trim() ||
        `${stripSlashes(process.env.SPEC_ROOT?.trim() || 'spec')}/parent.md`,
    ),
    baseBranch: process.env.SPEC_BASE_BRANCH?.trim() || 'main',
    authorName: process.env.GIT_AUTHOR_NAME?.trim() || 'AI Spec Explorer',
    authorEmail: process.env.GIT_AUTHOR_EMAIL?.trim() || 'spec-explorer@wyze.com',
    allowDirectCommit: (process.env.ALLOW_DIRECT_COMMIT?.trim().toLowerCase() ?? 'false') === 'true',
  };
}

export function getCompilerEnv(): CompilerEnv {
  const apiKey = process.env.GLEAN_API_KEY?.trim();
  const clientId = process.env.GLEAN_CLIENT_ID?.trim();
  const clientSecret = process.env.GLEAN_CLIENT_SECRET?.trim();

  // Exactly one credential path must be configured. Preferring the OAuth
  // client when both are present would make a stale GLEAN_API_KEY silently
  // dead config, so treat it as a misconfiguration instead.
  const hasClient = Boolean(clientId) && Boolean(clientSecret);
  if (apiKey && hasClient) {
    throw new InvalidEnvError(
      'set either GLEAN_API_KEY or GLEAN_CLIENT_ID/GLEAN_CLIENT_SECRET, not both',
    );
  }
  if (!apiKey && !hasClient) {
    if (clientId || clientSecret) {
      throw new InvalidEnvError('GLEAN_CLIENT_ID and GLEAN_CLIENT_SECRET must both be set');
    }
    throw new MissingEnvError(['GLEAN_API_KEY (or GLEAN_CLIENT_ID + GLEAN_CLIENT_SECRET)']);
  }

  const auth: CompilerEnv['auth'] = apiKey
    ? { kind: 'static', apiKey }
    : {
        kind: 'client-credentials',
        clientId: clientId ?? '',
        clientSecret: clientSecret ?? '',
        scope: process.env.GLEAN_SCOPE?.trim() || 'chat',
      };

  const explicitUrl = process.env.GLEAN_BASE_URL?.trim();
  const instance = process.env.GLEAN_INSTANCE?.trim();

  if (!explicitUrl && !instance) {
    throw new MissingEnvError(['GLEAN_INSTANCE (or GLEAN_BASE_URL)']);
  }

  // Glean's documented backend origin is https://<instance>-be.glean.com;
  // GLEAN_BASE_URL exists for deployments that don't follow that pattern.
  const baseUrl = (explicitUrl || `https://${instance}-be.glean.com`).replace(/\/+$/, '');

  const agent = (process.env.GLEAN_AGENT?.trim().toUpperCase() || 'GPT') as GleanAgent;
  if (!GLEAN_AGENTS.includes(agent)) {
    throw new InvalidEnvError(`GLEAN_AGENT must be one of ${GLEAN_AGENTS.join(', ')}`);
  }

  return {
    auth,
    baseUrl,
    agent,
    mode: process.env.GLEAN_MODE?.trim().toUpperCase() || 'DEFAULT',
    actAs: process.env.GLEAN_ACT_AS?.trim() || undefined,
  };
}
