# Schwab BKSC research certification — 2026-09-10

**Decision:** **BLOCKED — production operator authentication stopped the run
before Schwab**

**Published origin:** `https://capital-os-fund.replit.app`  
**Symbol:** `BKSC`  
**Run type:** controlled, read-only production probe  
**Production build:** deployment reported healthy before the probe

## Production evidence

The approved production-session request was attempted without printing or
persisting the session value. `GET /api/auth/me` returned `401
AUTHENTICATION_REQUIRED`. The three research routes were each requested once,
and each returned the same fail-closed `401 AUTHENTICATION_REQUIRED` response:

| Capability              | Route HTTP result | Provider request  | Provider safe headers        | Research fields      |
| ----------------------- | ----------------: | ----------------- | ---------------------------- | -------------------- |
| Instrument fundamentals |               401 | **not attempted** | No provider headers returned | No provider envelope |
| Current quote           |               401 | **not attempted** | No provider headers returned | No provider envelope |
| Daily price history     |               401 | **not attempted** | No provider headers returned | No provider envelope |

The application responses contained only the safe error shape:
`code`, `message`, and `correlationId`. The responses included
`Content-Type: application/json; charset=utf-8` and an application
correlation ID. No provider request ID, rate-limit limit/remaining/reset,
retry-after value, provider timestamp, realtime flag, delayed flag, freshness
state, field inventory, or provider payload was returned because the
household/authentication boundary rejected the request first.

The published sign-in page was also checked without making any application
write. It rendered an empty shell in the certification browser, so no
production Clerk session could be established through the UI. This is recorded
as an authentication precondition failure, not as provider evidence.

## Exactly-one-GET boundary

The production run cannot certify provider GET counts because zero provider
requests were reached. The local database-backed route fixture does certify
the transport contract:

```text
CAPITAL_OS_RUN_INTEGRATION=1 scripts/node_modules/.bin/tsx --test \
  artifacts/api-server/src/integration/schwab-market-data-oauth.test.ts
```

The fixture passed with exactly three provider calls: one `GET` to each of
the fixed instrument, quote, and price-history endpoints. It also checks:

- safe provider request IDs and rate-limit headers are projected;
- realtime, delayed, and freshness indicators are preserved;
- only HTTPS `GET` research paths are accepted;
- no orders, transfers, execution-control, or Micro-Live path is requested;
- a second household cannot trigger a provider request.

This fixture is local evidence only and is not substituted for live Schwab
evidence.

## Repeatable live runner

The checked-in published-origin runner repeats the approved session flow without
accepting a credential as a command-line argument or printing the session value.
It calls `GET /api/auth/me` first, then makes exactly one request to each of the
three fixed BKSC research routes. It writes mode `0600` JSON evidence to
`docs/certification/logs/SCHWAB_RESEARCH_BKSC_LATEST.json` by default. The
evidence contains route status, provider-safe request/rate-limit headers,
response and data field inventories, freshness/realtime/delayed indicators, and
provider GET counts; it never stores provider payloads, account identifiers,
session values, or raw error bodies.

Run it only with the approved published origin and session flow:

```text
CAPITAL_OS_PUBLISHED_ORIGIN=https://<published-origin> \
pnpm run certify:schwab-research
```

The runner reads `CAPITAL_OS_PRODUCTION_OPERATOR_SESSION_COOKIE` from the
approved workspace environment; do not paste its value into chat, source, or
the evidence file. The shell value is consumed by the runner and is never
included in console output or evidence. Missing Clerk authentication, household access, provider
entitlement, response schema, freshness evidence, or the exactly-one-provider-
GET boundary exits non-zero and keeps the certification `BLOCKED` or `FAIL`.
The runner does not request dossier, order, transfer, withdrawal, execution-
control, or Micro-Live routes.

## Boundary checks

No production evidence in this run touched or exposed:

- OAuth access or refresh tokens;
- Schwab account identifiers or account numbers;
- orders, transfers, withdrawals, or execution controls;
- Micro-Live state or order transmission;
- dossier evidence or research-dossier writes;
- Grok/xAI actions or execution authority;
- household financial balances, ledger entries, or capital classifications.

The route source remains read-only with `tradingEnabled: false` and
`executionAuthority: "none"`. No dossier ingestion is authorized from this
run.

## Pending capabilities

Instrument fundamentals and daily price history remain **PENDING** until a
real authenticated production session reaches Schwab and confirms the
provider response schemas and entitlements. The quote route is also not
live-certified because the authentication boundary prevented provider
access. No BKSC research result from this run may be used in a dossier.

## Verification

Passed:

```text
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run check-contract
scripts/node_modules/.bin/tsx --test \
  artifacts/api-server/src/services/schwab-research-adapter.test.ts
pnpm --filter @workspace/api-server test
```

The API contract check reported 238 route/method pairs. The full API test
suite passed (235 tests passed, 50 skipped, 0 failed); the dedicated research
adapter suite passed (6 tests), and the Schwab Market Data integration route
fixture passed (1 test).
