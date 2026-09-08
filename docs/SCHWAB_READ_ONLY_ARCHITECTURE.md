# Schwab read-only architecture

**Status:** OAuth observation foundation implemented; provider credentials not configured
**Boundary:** internal family-capital planning, advisory only, no execution

## Current decision

Capital OS now contains a server-side Schwab OAuth and read-only observation
foundation. It is not a certified or currently connected provider integration:
the required credentials and production callback registration are absent, and
no fixture or local test is real Schwab evidence. The existing certification
result remains **BLOCKED / NOT CONFIGURED**.

## Data flow

```text
Schwab OAuth (server-held credentials and tokens)
        ↓
bounded HTTPS GET observations
        ↓
normalized, sanitized household snapshot
        ↓
fail-closed reconciliation and freshness
        ↓
sanitized Grok portfolio projection
        ↓
advisory Family Office / human-reviewed Shadow baseline
```

There is no path from this boundary to an OMS, order transmission, money
movement, Guardian authority, Micro-Live, or AI execution authority.

## OAuth and credential boundary

The callback is derived exactly as:

```text
new URL(CAPITAL_OS_PUBLIC_ORIGIN).origin
  + /api/integrations/schwab/oauth/callback
```

`CAPITAL_OS_PUBLIC_ORIGIN` must be a canonical HTTPS origin: no credentials,
path other than `/`, query, or fragment. It is server configuration and cannot
be supplied by the browser. The same derived URL is used in authorization and
token exchange.

`SCHWAB_APP_KEY`, `SCHWAB_APP_SECRET`, `CAPITAL_OS_PUBLIC_ORIGIN`, and a
minimum-32-character `SESSION_SECRET` are server secrets/configuration. Access
and refresh tokens are encrypted before persistence with AES-256-GCM using a
versioned key derived from `SESSION_SECRET`; ciphertext, nonce, and
authentication tag are stored separately. Authorization codes are exchanged
server-side and are not persisted. Tokens, codes, raw state, and private account
numbers are excluded from frontend storage, API responses, redirects, logs,
audit metadata, and Grok projections.

## State, lifecycle, and route authorization

OAuth state is 32 random bytes, persisted only as a SHA-256 hash, bound to the
initiating household and actor, expires after ten minutes, and is atomically
consumed once. The callback takes household and actor identity only from that
state; callback query parameters cannot select a household.

Connect creates a random lifecycle generation. Connect, callback commit,
refresh, sync commit/failure, and disconnect serialize household lifecycle
changes with a PostgreSQL advisory transaction lock. A callback must still
match its generation, disconnect consumes pending states, rotates the
generation, and clears token material. Sync rechecks the connection and token
under the lock before committing, so stale callbacks or in-flight observations
cannot resurrect or update a disconnected/replaced connection.

`GET /integrations/schwab/status` requires an authenticated household context.
Connect, refresh, sync, and disconnect additionally require recent provider
authentication and the household `approve` permission (owner/admin authority
under the current governance policy). The OAuth callback intentionally has no
browser-session requirement because its persisted state is its single-use
authorization and tenant binding.

## Bounded read-only observations

The provider and route inventories expose status, connect, callback, refresh,
sync, and disconnect only. Observation transport accepts only HTTPS `GET` to
the configured Schwab API origin, with a ten-second timeout. Sync reads account
references, account/position/balance data, orders, transactions, quotes, and
the equity market clock. Order and transaction history is bounded to 60 days,
orders to 300 results per account, and quote symbols to 500. There are no
place/replace/cancel order, transfer, withdrawal, permission, or other broker
write methods or routes.

Raw provider payloads are not stored. Normalizers retain opaque provider
references rather than account numbers, preserve unavailable values as
`UNKNOWN`, and attach provider/receipt timestamps and
`CURRENT`/`AGING`/`STALE`/`UNKNOWN` freshness. Household-scoped snapshots store
only normalized accounts, balances, positions, observed orders and
transactions, quotes, market clock, counts, and freshness. The Grok snapshot
remains further minimized: no household IDs, provider account references, or
credentials, and it is marked advisory-only with execution disabled.

## Audit and fail-closed behavior

Append-only audit events cover connect initiation, OAuth callback success or
failure (when state identifies the household), token refresh success/failure,
sync success/failure, and disconnect. Metadata contains only `provider:
schwab` and `readOnly: true`.

Missing credentials/origin, malformed or replayed state, expired tokens,
decrypt/authentication failure, non-HTTPS or cross-origin endpoints, provider
timeouts/rejections, malformed responses, and lifecycle races fail closed.
Status reports `CONFIGURATION_REQUIRED`, disconnected/expired sync is rejected,
refresh or sync failure marks an error, and failed callbacks redirect with only
a generic outcome. No stale request is treated as a successful observation.
Reconciliation remains report-only: mismatches require review and neither Grok
nor Schwab ingestion can resolve or overwrite them.

Schwab cash is broker cash only. It does not automatically become
Safe-to-Deploy, protected capital, Treasury capital, or any other Capital OS
classification. Shadow remains independent and human-reviewed. Trading,
Guardian, and Micro-Live controls and authority are unchanged;
`tradingEnabled` remains false.

## Production activation

Production still requires:

1. provision the server secrets/configuration above while keeping
   `SCHWAB_TRADING_ENABLED=false`;
2. publish the API/UI and apply the Schwab schema migrations;
3. register the exact derived callback URL in the Schwab developer portal;
4. collect real OAuth and read-only provider evidence for account isolation,
   token lifecycle, observations, sanitization, freshness, reconciliation, and
   audit behavior; and
5. rerun `pnpm run certify:schwab-read-only`.

Do not claim provider certification or change the certification result to PASS
until approved real Schwab evidence closes the blocked gates.
