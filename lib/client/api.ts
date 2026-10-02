import type {
  CommitResponse,
  ConflictFinding,
  ConflictReport,
  ProposedAddition,
  RequestChangeResponse,
  SpecListResponse,
  ConsistencyReport,
  ExplorerScenarioResult,
  ExplorerWhatIfResult,
  HistoryEntry,
  Scenario,
  SpecResponse,
  StateMachine,
  TestCase,
  TestMatrix,
} from '../schemas';

/**
 * Typed fetch wrappers. Everything the browser knows about GitHub or Glean
 * arrives through these routes; there is no client-side SDK and no token here.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string;
  /** Present on a 409 from the commit route. */
  readonly upstream?: { content: string; sha: string };

  constructor(status: number, message: string, requestId: string, upstream?: { content: string; sha: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
    if (upstream) this.upstream = upstream;
  }
}

type ErrorBody = { error?: unknown; requestId?: unknown; upstream?: unknown };

function isUpstream(value: unknown): value is { content: string; sha: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { content?: unknown }).content === 'string' &&
    typeof (value as { sha?: unknown }).sha === 'string'
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let body: ErrorBody = {};
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      // Non-JSON error page; fall through to the generic message.
    }
    throw new ApiError(
      res.status,
      typeof body.error === 'string' ? body.error : `Request failed (${res.status}).`,
      typeof body.requestId === 'string' ? body.requestId : 'unknown',
      isUpstream(body.upstream) ? body.upstream : undefined,
    );
  }

  return (await res.json()) as T;
}

// --- spec ------------------------------------------------------------------

/** `path` selects a child spec; omit it for the parent / knowledge base. */
const withPath = (base: string, path?: string): string =>
  path === undefined || path === '' ? base : `${base}?path=${encodeURIComponent(path)}`;

export const listSpecs = (): Promise<SpecListResponse> =>
  request<SpecListResponse>('/api/spec/list', { method: 'GET' });

export const getSpec = (path?: string): Promise<SpecResponse> =>
  request<SpecResponse>(withPath('/api/spec', path), { method: 'GET' });

export const pullLatest = (path?: string): Promise<SpecResponse> =>
  request<SpecResponse>(withPath('/api/spec/refresh', path), { method: 'POST' });

export type HistoryVersionEntry = HistoryEntry & { version: number | null };

export const getHistory = (path?: string): Promise<{ commits: HistoryVersionEntry[]; truncated: boolean }> =>
  request<{ commits: HistoryVersionEntry[]; truncated: boolean }>(withPath('/api/spec/history', path), {
    method: 'GET',
  });

export const initSpec = (): Promise<CommitResponse> => request<CommitResponse>('/api/spec/init', { method: 'POST' });

export const commitSpec = (body: {
  specPath: string;
  content: string;
  baseSha: string;
  commitMessage: string;
  prTitle?: string;
  prBody?: string;
  direct?: boolean;
}): Promise<CommitResponse> => request<CommitResponse>('/api/spec/commit', { method: 'POST', body: JSON.stringify(body) });

// --- compilers -------------------------------------------------------------

export type ExplorerResponse =
  | { kind: 'scenario'; result: ExplorerScenarioResult }
  | { kind: 'whatIf'; result: ExplorerWhatIfResult };

export const compileScenario = (spec: string, scenario: Scenario): Promise<ExplorerResponse> =>
  request<ExplorerResponse>('/api/compile/explorer', { method: 'POST', body: JSON.stringify({ spec, scenario }) });

export const compileWhatIf = (spec: string, question: string): Promise<ExplorerResponse> =>
  request<ExplorerResponse>('/api/compile/explorer', { method: 'POST', body: JSON.stringify({ spec, question }) });

export const compileTests = (spec: string): Promise<TestMatrix> =>
  request<TestMatrix>('/api/compile/tests', { method: 'POST', body: JSON.stringify({ spec }) });

export const compileStates = (spec: string): Promise<StateMachine> =>
  request<StateMachine>('/api/compile/states', { method: 'POST', body: JSON.stringify({ spec }) });

export const compileConsistency = (spec: string, testMatrix?: TestCase[]): Promise<ConsistencyReport> =>
  request<ConsistencyReport>('/api/compile/consistency', {
    method: 'POST',
    body: JSON.stringify(testMatrix && testMatrix.length > 0 ? { spec, testMatrix } : { spec }),
  });

// --- parent knowledge base -------------------------------------------------

export const compileConflicts = (parentSpec: string, childSpec: string, childLabel: string): Promise<ConflictReport> =>
  request<ConflictReport>('/api/compile/conflicts', {
    method: 'POST',
    body: JSON.stringify({ parentSpec, childSpec, childLabel }),
  });

export const requestParentChange = (body: {
  childPath: string;
  childLabel: string;
  summary: string;
  additions: ProposedAddition[];
  conflicts: ConflictFinding[];
}): Promise<RequestChangeResponse> =>
  request<RequestChangeResponse>('/api/spec/request-change', { method: 'POST', body: JSON.stringify(body) });
