# Schwab read-only architecture

**Status:** disabled by default; live provider not configured  
**Boundary:** internal family-capital planning, advisory only, no execution

## Current decision

Capital OS has a broker portfolio boundary for a future approved Schwab
connection. The boundary is intentionally present without a live connector so
the application cannot grow an accidental generic brokerage client.

The current implementation does **not** claim that Schwab is connected. It does
not read, store, or fabricate Schwab accounts, positions, orders, fills, or
transactions. A live provider remains blocked until the approved connector is
attached and real provider-backed evidence closes SR-01 through SR-20.

## Data flow

```text
Approved Schwab OAuth connector
        ↓
SchwabReadOnlyProvider
        ↓
normalized broker observations
        ↓
fail-closed reconciliation and freshness
        ↓
sanitized Grok portfolio projection
        ↓
advisory Family Office / human-reviewed Shadow baseline
```

There is no path from this boundary to an OMS, order transmission, money
movement, Micro-Live, or AI execution authority.

## Provider contract

`BrokerPortfolioProvider` exposes only:

- accounts and balances
- positions
- historical/active order observations
- transactions and investment transactions
- quotes and market clock
- provider health

It intentionally does not expose methods for placing, replacing, or cancelling
orders; withdrawing, transferring, ACH, journaling, or wiring funds; or changing
margin or options permissions.

`SchwabReadOnlyProvider` currently fails closed. With the default
`SCHWAB_READ_ONLY_ENABLED=false`, no provider request is made. Setting the flag
without an attached approved connector produces `ACTION_REQUIRED` health and
`NOT_CONFIGURED` data calls. `SCHWAB_TRADING_ENABLED` is never an authority
switch and the normalized provider always reports `tradingEnabled: false`.

## Credential boundary

Only a server-side credential reference belongs in a provider context. Raw
client secrets, authorization codes, access tokens, refresh tokens, private
account numbers, OAuth state, and routing data must not appear in:

- frontend code or browser storage
- Grok prompts or projections
- API responses or OpenAPI models
- logs, errors, or audit metadata

The future connector must provide the server-side OAuth contract. Capital OS
will not introduce a custom token exchange or ask users to paste credentials
into chat.

## Normalization and freshness

Normalized values preserve `UNKNOWN` when the provider cannot supply a value;
they are never manufactured as zero. Each provider-derived record keeps the
provider timestamp, receipt timestamp, and one of:

- `CURRENT`
- `AGING`
- `STALE`
- `UNKNOWN`

Stale or unknown data remains visibly stale/unknown and cannot be treated as a
fresh household decision input.

## Reconciliation

Reconciliation compares provider observations with the stored normalized broker
state. It checks accounts, cash, positions, quantities, cost basis, orders,
fills, and transactions. A missing record, cash mismatch, or quantity mismatch
produces `CRITICAL_MISMATCH` and `requiresReview: true`.

The reconciliation function reports mismatches; it never overwrites stored
state and Grok cannot resolve a mismatch. Persistence and audit activation are
deferred until the provider connector and database certification are available.

## Grok and Shadow boundary

`getGrokPortfolioResearchSnapshot()` is the only intended projection into
portfolio analysis. It contains sanitized investment context and excludes
household ids, provider account references, and credentials. It is marked
`advisoryOnly: true` and `executionDisabled: true`.

A Shadow baseline copies only the approved normalized portfolio observations.
The baseline is independent, human-review-required, and never changes Schwab
state or creates a broker order.

Schwab cash is broker cash only. It does not automatically become
Safe-to-Deploy, protected capital, Treasury capital, or any other Capital OS
classification.

## Activation checklist

Before enabling a live connector:

1. Attach the approved Replit Schwab connector through the managed integration
   flow.
2. Keep `SCHWAB_TRADING_ENABLED=false`.
3. Keep all write methods absent from the Capital OS provider interface.
4. Add server-side account mapping and append-only audit persistence.
5. Run a real read-only fetch for account metadata, cash, positions, orders, and
   transactions.
6. Run tenant-isolation, credential-attack, mismatch, freshness, and
   sanitized-projection checks against the approved disposable target.
7. Run `pnpm run certify:schwab-read-only`.
8. Do not change the release status to PASS unless the certification report
   contains real provider-backed evidence.
