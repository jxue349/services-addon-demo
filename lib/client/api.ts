import type {
  CommitResponse,
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

export const getSpec = (): Promise<SpecResponse> => request<SpecResponse>('/api/spec', { method: 'GET' });

export const pullLatest = (): Promise<SpecResponse> => request<SpecResponse>('/api/spec/refresh', { method: 'POST' });

export const getHistory = (): Promise<{ commits: HistoryEntry[] }> =>
  request<{ commits: HistoryEntry[] }>('/api/spec/history', { method: 'GET' });

export const initSpec = (): Promise<CommitResponse> => request<CommitResponse>('/api/spec/init', { method: 'POST' });

export const commitSpec = (body: {
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
