import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetGleanAuth } from '@/lib/glean';
import { __resetRateLimit } from '@/lib/ratelimit';
import { POST as conflictsRoute } from '@/app/api/compile/conflicts/route';

/**
 * The parent-spec conflict check, with Glean mocked at the fetch boundary.
 *
 * The behaviour that matters most here is what the compiler is forbidden to
 * do: it must classify a contradiction, not resolve one, and it must not
 * propose markdown for anything except a pure addition.
 */

const PARENT = '# Parent\n\n- **R-302** — 16-day grace period, IAP only.\n';
const CHILD = '# CAMPLUS\n\n- **CAMPLUS-R-102** — 30-day grace period.\n';

const fetchMock = vi.fn();

function gleanReply(payload: unknown): Response {
  return new Response(
    JSON.stringify({
      messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: JSON.stringify(payload) }] }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/compile/conflicts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function promptOf(call = 0): string {
  const init = fetchMock.mock.calls[call]?.[1] as { body: string } | undefined;
  if (init === undefined) return '';
  const parsed = JSON.parse(init.body) as { messages: Array<{ fragments: Array<{ text: string }> }> };
  return parsed.messages[0]?.fragments[0]?.text ?? '';
}

const contradictionReply = () =>
  gleanReply({
    headline: 'Child contradicts the parent on grace-period length.',
    findings: [
      {
        kind: 'contradiction',
        childRule: 'CAMPLUS-R-102',
        parentRule: 'R-302',
        summary: '30 days vs 16 days',
        recommendation: 'Spec owners decide',
      },
    ],
    proposedAdditions: [],
  });

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  __resetGleanAuth();
  vi.stubGlobal('fetch', fetchMock);
  process.env.GLEAN_API_KEY = 'glean-test-token-value';
  process.env.GLEAN_INSTANCE = 'wyze';
  delete process.env.GLEAN_CLIENT_ID;
  delete process.env.GLEAN_CLIENT_SECRET;
  delete process.env.GLEAN_AGENT;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/compile/conflicts', () => {
  it('sends both documents and returns classified findings', async () => {
    fetchMock.mockResolvedValueOnce(contradictionReply());

    const res = await conflictsRoute(post({ parentSpec: PARENT, childSpec: CHILD, childLabel: 'cam-plus' }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { findings: Array<{ kind: string; parentRule: string | null }> };
    expect(body.findings[0]?.kind).toBe('contradiction');
    expect(body.findings[0]?.parentRule).toBe('R-302');

    // Both documents, each clearly delimited so the model can tell them apart.
    expect(promptOf()).toContain('<parent-spec>');
    expect(promptOf()).toContain('<child-spec label="cam-plus">');
    expect(promptOf()).toContain('**R-302**');
    expect(promptOf()).toContain('**CAMPLUS-R-102**');
  });

  it('forbids the compiler from resolving a contradiction itself', async () => {
    fetchMock.mockResolvedValueOnce(contradictionReply());
    await conflictsRoute(post({ parentSpec: PARENT, childSpec: CHILD, childLabel: 'cam-plus' }));

    expect(promptOf()).toContain('Do NOT pick a winner');
    expect(promptOf()).toContain('Do not propose markdown for');
  });

  it('accepts a pure addition carrying a null parent rule', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply({
        headline: 'One new rule.',
        findings: [
          { kind: 'addition', childRule: 'CAMPLUS-R-101', parentRule: null, summary: 's', recommendation: 'merge' },
        ],
        proposedAdditions: [{ ruleId: 'CAMPLUS-R-101', markdown: '- **CAMPLUS-R-101** — x' }],
      }),
    );

    const res = await conflictsRoute(post({ parentSpec: PARENT, childSpec: CHILD, childLabel: 'cam-plus' }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { proposedAdditions: Array<{ ruleId: string }> };
    expect(body.proposedAdditions[0]?.ruleId).toBe('CAMPLUS-R-101');
  });

  it('rejects an unrecognised finding kind, twice, as a 502', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        gleanReply({
          headline: 'h',
          findings: [{ kind: 'maybe', childRule: 'A-R-1', parentRule: null, summary: 's', recommendation: 'r' }],
          proposedAdditions: [],
        }),
      ),
    );

    const res = await conflictsRoute(post({ parentSpec: PARENT, childSpec: CHILD, childLabel: 'cam-plus' }));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects a missing childLabel without calling Glean', async () => {
    const res = await conflictsRoute(post({ parentSpec: PARENT, childSpec: CHILD }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an over-sized parent spec', async () => {
    const res = await conflictsRoute(
      post({ parentSpec: 'x'.repeat(100 * 1024 + 1), childSpec: CHILD, childLabel: 'cam-plus' }),
    );
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
