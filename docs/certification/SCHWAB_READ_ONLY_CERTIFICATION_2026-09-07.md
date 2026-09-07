# Schwab read-only certification — 2026-09-07

**Overall result:** **BLOCKED**  
**Provider:** **NOT CONFIGURED**  
**OAuth:** **BLOCKED**  
**Current implementation evidence:** 14/20 gates collected, 1 partial, 5 blocked  
**Money moved:** `$0`  
**Real orders:** `0`  
**Micro-Live:** `DISABLED`  
**Grok execution authority:** `NONE`

## Reason for the blocked result

The approved Schwab connector was not attached during this phase. The
read-only architecture therefore stops at disabled provider contracts,
normalization, freshness, reconciliation, and sanitized advisory projections.
No fixture is being treated as real Schwab evidence.

This is the correct fail-closed state. Capital OS does not fabricate current
holdings, does not expose a custom OAuth flow, and does not mark account/order/
transaction ingestion as live.

## Gate matrix

| Gate | Result | Evidence |
| --- | --- | --- |
| SR-01 Provider abstraction | PASS | `BrokerPortfolioProvider` and `SchwabReadOnlyProvider` |
| SR-02 OAuth boundary | BLOCKED | No approved Schwab connection attached |
| SR-03 Server secret handling | PARTIAL | Server-side credential-reference contract only; live connector pending |
| SR-04 Read-only methods | PASS | Provider interface contains observation methods only |
| SR-05 No trade methods | PASS | No place/replace/cancel/withdraw/transfer/ACH/journal/wire/margin/options methods |
| SR-06 Account normalization | PASS | Normalized account domain contract and tests |
| SR-07 Position normalization | PASS | Unknown-preserving position domain contract and tests |
| SR-08 Order ingestion | BLOCKED | No provider-backed order history |
| SR-09 Transaction ingestion | BLOCKED | No provider-backed transaction evidence |
| SR-10 Cost basis handling | PASS | Missing values remain `UNKNOWN` |
| SR-11 Freshness | PASS | `CURRENT`, `AGING`, `STALE`, and `UNKNOWN` |
| SR-12 Reconciliation | PASS | Deterministic account/position/order/transaction comparison |
| SR-13 Mismatch fail-closed | PASS | Cash/quantity/missing records require review |
| SR-14 Tenant isolation | BLOCKED | Database-backed live provider evidence pending |
| SR-15 Audit | BLOCKED | Persistence intentionally not activated before connector approval |
| SR-16 Grok data minimization | PASS | Projection excludes household/provider identifiers |
| SR-17 Grok credential isolation | PASS | Projection has no credential or provider-reference fields |
| SR-18 Shadow initialization | PASS | Independent, human-reviewed baseline contract |
| SR-19 No money movement | PASS | No money-movement interface or route |
| SR-20 No order transmission | PASS | No broker order route or transmission method |

Run the local architecture check with:

```text
pnpm run certify:schwab-read-only
```

The command intentionally exits non-zero while provider-backed evidence is
missing. That prevents a local fixture-only run from being mistaken for a
Schwab PASS.

## Required user action before the next phase

When the approved Schwab connector is available, attach it through Replit’s
managed integration flow. Do not paste client secrets, tokens, or account
identifiers into chat. Then rerun the live read-only evidence phase with both
feature flags still fail-closed for trading:

```text
SCHWAB_READ_ONLY_ENABLED=false
SCHWAB_TRADING_ENABLED=false
```

Only the approved certification process may change the read-only flag, and
trading must remain false.