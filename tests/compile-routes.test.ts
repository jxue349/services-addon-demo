import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetGleanAuth, extractAnswer } from '@/lib/glean';
import { __resetRateLimit } from '@/lib/ratelimit';
import { POST as consistencyRoute } from '@/app/api/compile/consistency/route';
import { POST as explorerRoute } from '@/app/api/compile/explorer/route';
import { POST as statesRoute } from '@/app/api/compile/states/route';
import { POST as testsRoute } from '@/app/api/compile/tests/route';

/**
 * Integration tests for the four compiler routes with the Glean Chat API
 * mocked at the fetch boundary: request construction, response parsing,
 * input validation, the corrective retry, and transport retries.
 */

const SPEC = `# Spec\n\n- **R-101** — account entitlement covers all devices.\n- **R-302** — 16-day grace period, IAP only.\n`;

const fetchMock = vi.fn();

/** A well-formed Glean chat response carrying `payload` as the answer text. */
function gleanReply(payload: unknown, wrap: (json: string) => string = (json) => json): Response {
  return new Response(
    JSON.stringify({
      messages: [
        {
          author: 'GLEAN_AI',
          messageType: 'CONTENT',
          agentConfig: { agent: 'GPT', mode: 'DEFAULT' },
          fragments: [{ text: wrap(JSON.stringify(payload)) }],
        },
      ],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function post(body: unknown): Request {
  return new Request('http://localhost/api/compile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The parsed Glean request body of the nth fetch call (0-based). */
function sentBody(call = 0): {
  agentConfig: { agent: string; mode: string };
  saveChat: boolean;
  messages: Array<{ author: string; fragments: Array<{ text: string }> }>;
} {
  const init = fetchMock.mock.calls[call]?.[1] as { body: string };
  return JSON.parse(init.body);
}

/** The prompt text sent on the nth call. */
function promptOf(call = 0): string {
  return sentBody(call).messages[0]?.fragments[0]?.text ?? '';
}

function sentHeaders(call = 0): Record<string, string> {
  const init = fetchMock.mock.calls[call]?.[1] as { headers: Record<string, string> };
  return init.headers;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRateLimit();
  __resetGleanAuth();
  vi.stubGlobal('fetch', fetchMock);
  process.env.GLEAN_API_KEY = 'glean-test-token-value';
  process.env.GLEAN_INSTANCE = 'wyze';
  delete process.env.GLEAN_BASE_URL;
  delete process.env.GLEAN_AGENT;
  delete process.env.GLEAN_ACT_AS;
  delete process.env.GLEAN_CLIENT_ID;
  delete process.env.GLEAN_CLIENT_SECRET;
  delete process.env.GLEAN_SCOPE;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Glean request construction', () => {
  it('posts to the instance chat endpoint with a bearer token', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    await statesRoute(post({ spec: SPEC }));

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://wyze-be.glean.com/rest/api/v1/chat');
    expect(sentHeaders().authorization).toBe('Bearer glean-test-token-value');
    expect(sentBody().saveChat).toBe(false);
  });

  it('defaults to agent GPT so no company knowledge is retrieved', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    await statesRoute(post({ spec: SPEC }));

    // Safety-critical: a retrieval agent would blend real company docs into
    // answers that are supposed to derive only from the spec.
    expect(sentBody().agentConfig).toEqual({ agent: 'GPT', mode: 'DEFAULT' });
  });

  it('honours GLEAN_BASE_URL over GLEAN_INSTANCE and strips a trailing slash', async () => {
    process.env.GLEAN_BASE_URL = 'https://custom-be.glean.com/';
    fetchMock.mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    await statesRoute(post({ spec: SPEC }));

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://custom-be.glean.com/rest/api/v1/chat');
  });

  it('omits X-Glean-ActAs unless configured', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));
    await statesRoute(post({ spec: SPEC }));
    expect(sentHeaders()).not.toHaveProperty('X-Glean-ActAs');

    __resetRateLimit();
    vi.clearAllMocks();
    process.env.GLEAN_ACT_AS = 'owner@wyze.com';
    fetchMock.mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));
    await statesRoute(post({ spec: SPEC }));
    expect(sentHeaders()['X-Glean-ActAs']).toBe('owner@wyze.com');
  });

  it('rejects an unknown GLEAN_AGENT instead of silently enabling retrieval', async () => {
    process.env.GLEAN_AGENT = 'SUPER';
    const res = await statesRoute(post({ spec: SPEC }));

    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/GLEAN_AGENT/);
  });

  it('carries the full spec and the no-invented-rules contract in the prompt', async () => {
    fetchMock.mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    await statesRoute(post({ spec: SPEC }));

    expect(promptOf()).toContain('**R-302**');
    expect(promptOf()).toContain('Cite the spec rule IDs');
    expect(promptOf()).toContain('Never invent a rule');
    expect(promptOf()).toContain('Do not use any other company document');
  });
});

describe('OAuth client_credentials', () => {
  const useClient = () => {
    delete process.env.GLEAN_API_KEY;
    process.env.GLEAN_CLIENT_ID = 'client-abc';
    process.env.GLEAN_CLIENT_SECRET = 'secret-xyz';
  };

  const tokenReply = (token = 'oauth-token-1', expiresIn = 3600) =>
    new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  it('exchanges the client for a token, then calls chat with it', async () => {
    useClient();
    fetchMock
      .mockResolvedValueOnce(tokenReply())
      .mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(200);

    // Call 0: the token exchange, client_secret_basic, scope defaults to chat.
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://wyze-be.glean.com/oauth/token');
    const tokenInit = fetchMock.mock.calls[0]?.[1] as { headers: Record<string, string>; body: string };
    expect(tokenInit.headers.authorization).toBe(`Basic ${Buffer.from('client-abc:secret-xyz').toString('base64')}`);
    expect(tokenInit.body).toBe('grant_type=client_credentials&scope=chat');

    // Call 1: chat, bearing the freshly minted token.
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://wyze-be.glean.com/rest/api/v1/chat');
    expect(sentHeaders(1).authorization).toBe('Bearer oauth-token-1');
  });

  it('honours GLEAN_SCOPE', async () => {
    useClient();
    process.env.GLEAN_SCOPE = 'llm_proxy';
    fetchMock
      .mockResolvedValueOnce(tokenReply())
      .mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    await statesRoute(post({ spec: SPEC }));
    expect((fetchMock.mock.calls[0]?.[1] as { body: string }).body).toContain('scope=llm_proxy');
  });

  it('reuses the cached token across compiles', async () => {
    useClient();
    fetchMock
      .mockResolvedValueOnce(tokenReply())
      .mockImplementation(() => Promise.resolve(gleanReply({ states: ['Active'], transitions: [] })));

    await statesRoute(post({ spec: SPEC }));
    await statesRoute(post({ spec: SPEC }));

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/oauth/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('re-mints and retries once when a cached token is rejected', async () => {
    useClient();
    fetchMock
      .mockResolvedValueOnce(tokenReply('stale-token'))
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(tokenReply('fresh-token'))
      .mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(200);
    expect(sentHeaders(3).authorization).toBe('Bearer fresh-token');
  });

  it('does not retry a 401 when using a static key', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('Unauthorized', { status: 401 })));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a rejected client as a 502 without echoing the secret', async () => {
    useClient();
    fetchMock.mockImplementation(() => Promise.resolve(new Response('invalid_client', { status: 401 })));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(502);

    const body = (await res.json()) as { error: string };
    expect(JSON.stringify(body)).not.toContain('secret-xyz');
  });

  it('rejects having both a static key and an OAuth client configured', async () => {
    process.env.GLEAN_CLIENT_ID = 'client-abc';
    process.env.GLEAN_CLIENT_SECRET = 'secret-xyz';
    // GLEAN_API_KEY is still set from beforeEach.

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();

    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not both/);
  });

  it('rejects a half-configured OAuth client', async () => {
    delete process.env.GLEAN_API_KEY;
    process.env.GLEAN_CLIENT_ID = 'client-abc';

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/GLEAN_CLIENT_SECRET/);
  });

  it('reports no credential at all as missing configuration', async () => {
    delete process.env.GLEAN_API_KEY;

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/GLEAN_API_KEY/);
  });
});

describe('extractAnswer', () => {
  it('concatenates the text fragments of the assistant message', () => {
    const answer = extractAnswer({
      messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: '{"a":' }, { text: '1}' }] }],
    });
    expect(answer).toBe('{"a":1}');
  });

  it('ignores the user turn and non-content status messages', () => {
    const answer = extractAnswer({
      messages: [
        { author: 'USER', messageType: 'CONTENT', fragments: [{ text: 'the prompt' }] },
        { author: 'GLEAN_AI', messageType: 'UPDATE', fragments: [{ text: 'Searching…' }] },
        { author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: 'the answer' }] },
      ],
    });
    expect(answer).toBe('the answer');
  });

  it('throws when the payload has no messages array', () => {
    expect(() => extractAnswer({})).toThrow(/no messages array/);
  });

  it('throws when the assistant returned no text', () => {
    expect(() => extractAnswer({ messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [] }] })).toThrow(
      /no answer text/,
    );
  });
});

describe('POST /api/compile/explorer', () => {
  it('resolves a scenario and returns validated device rows', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply({
        accountSummary: 'Cam Unlimited covers every eligible camera.',
        devices: [
          { name: 'Cam v3', effectiveEntitlement: 'Cam Unlimited', why: 'Account coverage wins.', rules: ['R-101'] },
        ],
        notes: 'Billed twice until Cam Plus is cancelled.',
      }),
    );

    const res = await explorerRoute(
      post({
        spec: SPEC,
        scenario: { account: 'Cam Unlimited', devices: [{ name: 'Cam v3', subscription: 'Cam Plus' }] },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; result: { devices: Array<{ rules: string[] }> } };
    expect(body.kind).toBe('scenario');
    expect(body.result.devices[0]?.rules).toEqual(['R-101']);
  });

  it('answers a what-if and preserves a null spec gap', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply({ answer: 'Entitlement survives to period end.', rules: ['R-301'], specGap: null }),
    );

    const res = await explorerRoute(post({ spec: SPEC, question: 'What happens right after cancelling?' }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { kind: string; result: { specGap: string | null } };
    expect(body.kind).toBe('whatIf');
    expect(body.result.specGap).toBeNull();
  });

  it('rejects a question over 500 characters without calling Glean', async () => {
    const res = await explorerRoute(post({ spec: SPEC, question: 'x'.repeat(501) }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects more than ten scenario devices', async () => {
    const devices = Array.from({ length: 11 }, (_, i) => ({ name: `cam ${i}`, subscription: 'Cam Plus' }));
    const res = await explorerRoute(post({ spec: SPEC, scenario: { account: 'None', devices } }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a spec over 100 KB', async () => {
    const res = await explorerRoute(post({ spec: 'x'.repeat(100 * 1024 + 1), question: 'anything?' }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/compile/tests', () => {
  it('returns the test matrix and strips a code fence from the reply', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply(
        {
          tests: [
            {
              id: 'T-01',
              scenario: 'Website purchase then renewal failure',
              expected: 'No grace period is granted',
              priority: 'P1',
              rules: ['R-302'],
              inPrototype: false,
            },
          ],
        },
        (json) => `Here you go:\n\`\`\`json\n${json}\n\`\`\`\n\nLet me know if you'd like more.`,
      ),
    );

    const res = await testsRoute(post({ spec: SPEC }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { tests: Array<{ priority: string }> };
    expect(body.tests[0]?.priority).toBe('P1');
    expect(promptOf()).toContain('Prototype coverage');
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(
        gleanReply({
          tests: [{ id: 'T-01', scenario: 'a', expected: 'b', priority: 'URGENT', rules: [], inPrototype: false }],
        }),
      )
      .mockResolvedValueOnce(
        gleanReply({
          tests: [{ id: 'T-01', scenario: 'a', expected: 'b', priority: 'P2', rules: ['R-101'], inPrototype: true }],
        }),
      );

    const res = await testsRoute(post({ spec: SPEC }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(promptOf(1)).toContain('Your previous response could not be used');
    expect(promptOf(1)).toContain('priority');
  });

  it('returns 502 when Glean fails the shape contract twice', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(gleanReply({ nope: true })));

    const res = await testsRoute(post({ spec: SPEC }));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const body = (await res.json()) as { error: string; requestId: string };
    expect(body.error).toMatch(/did not match the expected shape/);
    expect(body.requestId).toHaveLength(8);
  });

  it('returns 502 when Glean answers with prose instead of JSON, twice', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            messages: [{ author: 'GLEAN_AI', messageType: 'CONTENT', fragments: [{ text: 'I could not find that.' }] }],
          }),
          { status: 200 },
        ),
      ),
    );

    const res = await testsRoute(post({ spec: SPEC }));
    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/compile/states', () => {
  it('returns states and transitions', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply({
        states: ['Active', 'Grace period'],
        transitions: [
          { from: 'Active', to: 'Grace period', event: 'renewal payment fails', rules: ['R-302'], note: 'IAP only' },
        ],
      }),
    );

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { states: string[]; transitions: Array<{ rules: string[] }> };
    expect(body.states).toContain('Grace period');
    expect(body.transitions[0]?.rules).toEqual(['R-302']);
  });
});

describe('POST /api/compile/consistency', () => {
  it('tells Glean to report QA as unknown when no matrix is passed', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply({
        findings: [{ rule: 'R-101', summary: 'account covers devices', prototype: 'covered', qa: 'unknown', note: '' }],
        headline: 'Grace period is unproven.',
      }),
    );

    const res = await consistencyRoute(post({ spec: SPEC }));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { findings: Array<{ qa: string }> };
    expect(body.findings[0]?.qa).toBe('unknown');
    expect(promptOf()).toContain('Set "qa" to "unknown" for every rule');
    expect(promptOf()).not.toContain('<test-matrix>');
  });

  it('passes a session test matrix through to the prompt', async () => {
    fetchMock.mockResolvedValueOnce(
      gleanReply({
        findings: [{ rule: 'R-302', summary: 'grace period', prototype: 'missing', qa: 'covered', note: 'T-01' }],
        headline: 'One rule is prototype-missing.',
      }),
    );

    const res = await consistencyRoute(
      post({
        spec: SPEC,
        testMatrix: [
          {
            id: 'T-01',
            scenario: 'renewal fails on iOS',
            expected: '16-day grace period',
            priority: 'P1',
            rules: ['R-302'],
            inPrototype: false,
          },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(promptOf()).toContain('<test-matrix>');
    expect(promptOf()).toContain('T-01');
  });

  it('rejects an unknown coverage value from the model, twice, as a 502', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        gleanReply({
          findings: [{ rule: 'R-101', summary: 's', prototype: 'maybe', qa: 'unknown', note: '' }],
          headline: 'h',
        }),
      ),
    );

    const res = await consistencyRoute(post({ spec: SPEC }));
    expect(res.status).toBe(502);
  });
});

describe('Glean transport failures', () => {
  it('retries once on a 429 and succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(gleanReply({ states: ['Active'], transitions: [] }));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries once on a 500 and gives up on the second failure', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("boom", { status: 500 })));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(500);
  });

  it('maps a rejected token to a 502 without echoing the token', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response("Unauthorized", { status: 401 })));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(502);
    // 401 is not retryable — a bad token will not get better.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/rejected our credentials/);
    expect(JSON.stringify(body)).not.toContain('glean-test-token-value');
  });

  it('surfaces a timeout as a 504', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation timed out'), { name: 'TimeoutError' }));

    const res = await statesRoute(post({ spec: SPEC }));
    expect(res.status).toBe(504);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('compile rate limit', () => {
  it('returns 429 after 20 compiles in a window', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(gleanReply({ states: ["Active"], transitions: [] })));

    for (let i = 0; i < 20; i += 1) {
      const ok = await statesRoute(post({ spec: SPEC }));
      expect(ok.status).toBe(200);
    }

    const limited = await statesRoute(post({ spec: SPEC }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).not.toBeNull();
  });
});
