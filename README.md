# AI Spec Explorer

A Git-versioned **Product Behavior Specification** is the single source of
truth. A *behavior compiler* — Glean's Chat API, called server-side — turns
that one document into four representations:

| Tab | What it compiles |
| --- | --- |
| **Behavior Explorer** | Resolves entitlements for a built scenario, and answers free-form "what if…?" questions |
| **QA Test Matrix** | 15–25 test cases, weighted toward behavior the prototype never visualized |
| **State Machine** | The subscription lifecycle as a Mermaid diagram plus a transitions table |
| **Consistency Check** | Every rule in the spec scored against prototype coverage and QA coverage |

Every conclusion cites the rule IDs (`R-xxx`) it came from, and every rule ID
renders as a chip that reveals that rule in the spec editor.

The demo loop is: **edit a rule → recompile → the outputs move → check the
change back in as a pull request.** Compilers always run against the text in
the editor, including uncommitted edits.

---

## Setup

```bash
cp .env.example .env    # then fill in the values
npm install
npm run dev             # http://localhost:3000
```

### Environment variables

All server-side. There are deliberately **no `NEXT_PUBLIC_*` variables** — no
key, token, owner, or repo name reaches the client bundle.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GLEAN_CLIENT_ID` + `GLEAN_CLIENT_SECRET` | yes† | — | OAuth client for the `client_credentials` grant. Preferred — see below |
| `GLEAN_SCOPE` | no | `chat` | Scope requested for the client-credentials token |
| `GLEAN_API_KEY` | yes† | — | Alternative: long-lived platform token from [app.glean.com/admin/platform/token](https://app.glean.com/admin/platform/token) |
| `GLEAN_INSTANCE` | yes\* | — | Instance name; the backend origin is `https://<instance>-be.glean.com` |
| `GLEAN_BASE_URL` | no | — | Full backend origin, for deployments that don't follow that pattern. Overrides `GLEAN_INSTANCE` |
| `GLEAN_AGENT` | no | `GPT` | Which Glean agent answers. **Leave this as `GPT`** — see below |
| `GLEAN_MODE` | no | `DEFAULT` | Reasoning mode passed through to Glean |
| `GLEAN_ACT_AS` | no | — | Required only when the token is a *global* rather than user-scoped Glean token |
| `GITHUB_TOKEN` | yes | — | Fine-grained PAT for the spec repo (scoping below) |
| `GITHUB_OWNER` | yes | — | Owner of the spec repo |
| `GITHUB_REPO` | yes | — | Spec repo name |
| `SPEC_PATH` | no | `spec/behavior.md` | Path of the spec file in that repo |
| `SPEC_BASE_BRANCH` | no | `main` | Branch treated as the state of record |
| `GIT_AUTHOR_NAME` | no | `AI Spec Explorer` | Commit author for spec commits |
| `GIT_AUTHOR_EMAIL` | no | `spec-explorer@wyze.com` | Commit author email |
| `ALLOW_DIRECT_COMMIT` | no | `false` | Allows committing straight to the base branch |

\* Either `GLEAN_INSTANCE` or `GLEAN_BASE_URL` must be set.
† Set **exactly one** of the OAuth client or `GLEAN_API_KEY`. Configuring both
is rejected at startup rather than silently preferring one, so a stale key
can't sit around looking load-bearing.

### Getting a Glean credential

You do **not** need an admin-issued platform token. Glean's authorization
server advertises the `client_credentials` grant:

```bash
curl -s https://<instance>-be.glean.com/.well-known/oauth-authorization-server/oauth
# grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token']
# token_endpoint_auth_methods_supported: ['none','client_secret_basic','client_secret_post','private_key_jwt']
```

So ask for an OAuth client (client id + secret) with the `chat` scope, set
`GLEAN_CLIENT_ID` / `GLEAN_CLIENT_SECRET`, and the app handles the rest: it
exchanges them at `/oauth/token` using `client_secret_basic`, caches the token
until a minute before expiry, and re-mints once if a cached token is rejected.

**Glean's MCP endpoint is not an alternative credential.** `/mcp/default` and
`/rest/api/v1/chat` sit behind the same authorization server and the same
`Authorization: Bearer` wall — both return the same `WWW-Authenticate`
challenge pointing at `/oauth`. MCP is a protocol for letting an *agent*
discover tools; this app makes exactly one known call, so MCP would add an
OAuth-session layer for no benefit over a single `fetch`.

### Why `agent=GPT`

The compiler runs on Glean's Chat API. Glean's `agentConfig.agent` decides
whether Glean *searches your company's content* before answering:

| `agent` | Retrieval | Notes |
| --- | --- | --- |
| `GPT` | **none** — straight to the LLM | What this tool needs. Glean is deprecating it |
| `DEFAULT` | company knowledge | Deprecating |
| `FAST` | agentic engine, retrieval-capable | Must be enabled in the deployment |
| `ADVANCED` | same, slower and higher quality | Must be enabled in the deployment |

This tool's entire premise is that **the spec text in the editor is the only
source of truth**, and that the compiler names a spec gap rather than filling
one in. A retrieval agent breaks that: asked about Cam Plus grace periods it
will find the real Confluence page, the real Jira ticket, and the real Slack
thread, and blend them into an answer that *looks* spec-derived. The
consistency check would then report coverage for behavior the spec never
defines — which is worse than no answer, because it reads as authoritative.

So `GPT` is the default, an unrecognised `GLEAN_AGENT` is a hard startup error
rather than a silent fallback, and a test asserts the outgoing request carries
`agent: "GPT"`.

**This needs revisiting.** Glean lists both `DEFAULT` and `GPT` as deprecating
in favour of `FAST`/`ADVANCED`. When `GPT` goes away, the replacement is not a
drop-in: you will need a Glean agent whose `gleanSearchConfig` is *omitted*
(their agent spec defines an omitted `gleanSearchConfig` as "no company
knowledge access") and to invoke it by `agentId`. Do not just switch to
`FAST` and hope.

### One more consequence of using Glean

The spec text is sent to Glean on every compile, so it lands in Glean's chat
infrastructure. Requests set `saveChat: false` so they are not kept as named
chats, but this is Glean's retention policy, not ours. If the spec is ever
more sensitive than "internal", check that against your Glean data-retention
and governance settings before pointing this at it.

### GitHub token scoping

Create a **fine-grained personal access token** limited to the single spec
repo. Do not use a classic PAT, and do not grant org-wide scopes.

1. GitHub → Settings → Developer settings → **Personal access tokens →
   Fine-grained tokens** → *Generate new token*.
2. **Resource owner**: the org or user that owns the spec repo.
3. **Repository access**: *Only select repositories* → pick the spec repo, and
   nothing else.
4. **Repository permissions** — exactly two, nothing more:
   - **Contents**: Read and write (read the spec, create the branch and commit)
   - **Pull requests**: Read and write (open the PR)
5. Leave every account permission at *No access*. `workflow`, `admin`, and
   `delete_repo` are never needed; if something asks for them, stop.
6. Set an expiry and put a calendar reminder to rotate it.

The token lives only in the server environment. If you deploy this, set it as a
runtime secret — never in the image, the repo, or a build arg.

### If the spec file does not exist yet

The app shows an **Initialize spec in repo** button. It commits a starter Wyze
subscription-management spec (channels, entitlement scopes, rules R-101 to
R-401, lifecycle states, and a prototype-coverage list) through the same
pull-request flow as any other change — the first version gets reviewed like
every version after it.

---

## How spec changes get checked in

Default and recommended path:

1. Edit the spec in the left panel. The editor tracks dirty state.
2. **Check in changes** → enter a summary (the commit message and PR title are
   pre-filled as `spec: <summary>`).
3. The server re-reads the file's blob SHA. If it moved since you loaded it,
   you get a **409** and a *spec changed upstream* prompt with the upstream
   content — nothing is overwritten silently.
4. Otherwise it creates `spec/update-<timestamp>` from the base branch head,
   commits, opens a pull request, and hands back the PR link.

**Why a PR and not a commit:** a spec change is a product-truth change, so it
needs review, and a merged PR gives a one-click revert path.

Direct commits to the base branch require **both** `ALLOW_DIRECT_COMMIT=true`
*and* an explicit two-step confirmation in the check-in dialog. The upstream
SHA check still applies. Use it only against a throwaway sandbox repo.

### Rollback

The spec's history is the repo's history, so rollback is a Git operation:

- **A merged spec PR made things worse** → open the merged PR on GitHub and hit
  **Revert**. That opens a revert PR; merge it and the spec is back to the
  previous behavior. This is the normal path.
- **A direct commit** (only possible with `ALLOW_DIRECT_COMMIT=true`) →
  `git revert <sha>` and push, or open a PR with the revert.
- **A bad PR that has not merged** → just close it. The base branch never moved.
- After any rollback, press **Pull latest** in the app and recompile; the four
  views follow whatever is now on the base branch.

The **History** drawer lists the last 10 commits touching the spec path, each
linking to GitHub, so you can find the commit to revert.

---

## Architecture

Single deployable Next.js (App Router) service: React frontend plus API routes
as the backend. No database — GitHub holds the spec, and UI state is React
state.

```
app/
  page.tsx                      two-panel UI, owns spec + draft state
  api/spec/route.ts             GET    read spec at base branch head
  api/spec/refresh/route.ts     POST   "Pull latest"
  api/spec/history/route.ts     GET    last 10 commits for the spec path
  api/spec/commit/route.ts      POST   SHA check -> branch -> commit -> PR
  api/spec/init/route.ts        POST   seed the starter spec via the PR flow
  api/compile/{explorer,tests,states,consistency}/route.ts
components/                     spec panel, dialogs, the four tabs
lib/
  env.ts          server-only env access
  github.ts       Octokit client + the commit orchestration (injectable)
  glean.ts        compile(): Glean Chat call, answer extraction, retries
  json.ts         fence strip -> brace-balanced extract -> parse -> zod
  prompts.ts      the four compiler prompts
  schemas.ts      request + response contracts (zod)
  ratelimit.ts    in-memory per-IP limiter
  client/         typed fetch wrappers, rule lookup, exports, mermaid source
tests/            unit + mocked-integration tests
```

### Security posture

- **Secrets are server-side only.** `GLEAN_API_KEY` and `GITHUB_TOKEN` are
  read in `lib/env.ts`, which is imported exclusively by API routes. Verified
  against the built bundle — no token, key, or env name appears in
  `.next/static`.
- **Errors never leak.** Clients get a friendly message plus an 8-character
  request ID; details are logged server-side through a redactor that masks
  `github_pat_…`, a `Bearer …` value, or an auth header. Glean error bodies are
  never forwarded to the client, only the status.
- **All input is validated and bounded** with zod: spec ≤ 100 KB, what-if
  question ≤ 500 chars, ≤ 10 scenario devices, bounded strings everywhere.
  Anything else is a 400.
- **Model output is untrusted**, and doubly so here: Glean Chat has no
  structured-output or JSON-schema mode, so nothing at the API level guarantees
  the reply is JSON. Replies are fence-stripped, brace-balance-extracted,
  parsed, and schema-validated, with one corrective retry; everything renders as text
  through React's default escaping. The one place HTML is injected is the
  Mermaid diagram, and that is Mermaid's own output under
  `securityLevel: 'strict'`, built from state and event labels already
  whitelisted to plain label characters in `lib/client/mermaid-source.ts`.
- **Rate limit** of 20 compiles/min/IP on the compile routes, so a stuck client
  cannot burn API spend. It is in-memory and per-process — a cost guard, not an
  auth boundary. Put a real limiter at the edge before exposing this publicly.
- **Timeouts and retries**: 30s timeout with one transport retry on Glean calls
  (408/429/5xx and timeouts only — a rejected token is not retried), plus one
  corrective retry when the reply fails schema validation.
- **No auth on the app itself.** It is an internal pilot tool. Anyone who can
  reach it can open a PR against the spec repo as the token identity — put it
  behind SSO before it leaves a trusted network.

---

## Tests

```bash
npm test          # vitest
npm run typecheck # tsc --noEmit, strict
npm run lint      # eslint (flat config, next/core-web-vitals + next/typescript)
```

### Trying the app without credentials

`npm run stub:glean` starts a local stand-in for Glean's chat endpoint on
127.0.0.1:3399. Point the app at it:

```
GLEAN_API_KEY=local-stub-token
GLEAN_BASE_URL=http://127.0.0.1:3399
```

All four tabs then compile for real — through the routes and `lib/glean.ts` —
with no token and no quota burn, which also makes the demo rehearsable offline.
The stub replies the way a chat assistant actually does (prose wrapped around a
` ```json ` fence), so the extraction pipeline is genuinely exercised.

`curl -s http://127.0.0.1:3399/__log` shows what the app sent: the agent
config, whether a bearer header was present, and whether the prompt carried the
spec. Use it to confirm `agent: "GPT"` is really going over the wire.

The GitHub side still needs a real token — the stub only covers Glean.

- `tests/json.test.ts` — fence stripping, brace-balanced extraction (including
  braces and escaped quotes inside strings), schema validation errors.
- `tests/commit-conflict.test.ts` — the SHA-conflict logic and commit
  orchestration, driven through a fake repo client: conflict detection,
  first-time create, upstream deletion, "no write happens on conflict", and
  both direct-commit guards.
- `tests/compile-routes.test.ts` — one integration test per compile route with
  Glean mocked at the `fetch` boundary: response shapes, request construction
  (endpoint, bearer header, `saveChat: false`, **`agent: "GPT"`**, `ActAs` only
  when configured), prompt construction (full spec present, citation contract
  present), answer extraction from Glean's message/fragment structure,
  input-validation 400s, the corrective retry, the 502 after two bad replies,
  transport retry on 429/5xx, 401 → 502 with no token echoed, timeout → 504,
  and the rate limit.
- `tests/rules-and-mermaid.test.ts` — rule lookup in spec text, Mermaid label
  sanitising, Markdown/CSV export escaping.

---

## Deploy

Single Node service.

```bash
docker build -t ai-spec-explorer .
docker run --rm -p 3000:3000 --env-file .env ai-spec-explorer
```

The image runs as a non-root user, uses Next's `standalone` output (no build
tooling at runtime), and contains no secrets — pass them in at run time as
environment variables or mounted secrets.
