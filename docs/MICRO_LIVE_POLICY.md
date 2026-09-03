# Capital OS Micro-Live Policy

## Current implementation

Capital OS contains a fail-closed Micro-Live control plane at `/micro-live`. It is a rehearsal and eligibility surface, not a live trading system.

- The default policy is a configurable $20 sandbox.
- Venue capital is capped at $10, strategy capital at $10, market exposure at $5, and individual orders at $1.
- Soft and hard daily loss limits default to $0.75 and $1.50.
- Leverage, margin, borrowing, automated scaling, withdrawals, and household bank-to-venue transfers are disabled.
- Household, Duplex Reserve, Emergency Reserve, and protected capital are inaccessible from the execution boundary.
- Every restart begins disabled; no state is resumed from local cache.

## Execution architecture

The execution boundary is split into:

1. Strategy intent and immutable strategy versions.
2. Server-side pre-trade validation.
3. OMS lifecycle states, including partial fills, cancel races, rejection, expiration, and unknown state.
4. A provider-neutral Market Data Adapter and Trading Adapter interface.
5. Venue and market allowlists.
6. Reconciliation against venue-authoritative balances, positions, orders, and fills.
7. Hard risk and inventory limits.
8. An independent Guardian process boundary that can stop, lock, or request cancel-all but cannot trade or change policy.

The real-order OMS path is durable and authenticated even though it is not
enabled in the checked-in deployment. An owner command requires an
`Idempotency-Key`, records the intent and `SUBMITTING` transition before the
provider placement call, and never retries an uncertain placement. Provider
acknowledgements, cancellation results, bounded authoritative fill data,
balances, positions, and reconciliation runs are stored before the command
returns. Fills are deduplicated by the household/provider fill identity and
each fill and fee is linked to balanced execution-only ledger entries. Those
accounts are excluded from household spendable-capital views.

Persistence, audit, unknown-order, provider-mismatch, timeout, and
reconciliation failures stop the session and create a critical incident. A
venue fill activates a durable first-fill hold; only a clean reconciliation
and a separate owner approval can clear it. A reviewed server-side adapter
factory is required, so no request body, database edit, or browser action can
activate a provider by itself.

The checked-in adapter is a simulated rehearsal adapter. Its `placeOrder` method always refuses transmission.

## Real venue approval boundary

No real venue is connected in this phase. The server-side reviewed adapter
registry is intentionally empty; changing `adapterType` in the database or
posting an approval request cannot create a connection. A future real adapter
must implement `VenueAdapter` through the server-configured adapter boundary and
be registered in a separately reviewed deployment change.

Before an owner-controlled approval review can pass, the venue registry must
record all of the following:

1. An explicitly approved provider integration (the simulated and
   provider-neutral adapters can never satisfy this gate).
2. A server-side credential reference only, matching the approved opaque
   secret-reference format. Secret values must never enter
   request bodies, frontend state, AI prompts, logs, or source control.
3. A current independent security review, recorded through the security-review
   endpoint, with a reviewer distinct from the eventual approver.
4. A current independent jurisdiction and account-eligibility review, with a
   reviewer distinct from the eventual approver and the security reviewer.
5. Jurisdiction and account eligibility confirmation.
6. Terms review.
7. The exact permitted markets.
8. Withdrawal-permission review, with withdrawals disabled for the execution
   account.

Approval is separately audited and does not enable order transmission. The
approval endpoint cannot approve an incomplete review, cannot accept review
evidence or funding-account identifiers from its request body, and never
accepts household or protected-capital identifiers as funding sources.

The concrete server adapter also requires a dedicated `micro_live` execution
account, an explicit asset and market allowlist, and a provider transport
injected server-side. It rejects balances, positions, orders, and fills outside
those allowlists before exposing them to the OMS. It has no withdrawal method.

## Reconciliation and recovery

Reconciliation is required after fills, cancel anomalies, reconnects, restarts, and periodic health checks. A mismatch stops new exposure, cancels open orders, fetches venue state, rebuilds internal state, and requires verification before resuming.

At restart, the system must connect to the venue, fetch balances, positions, open orders, and recent fills, reconstruct state, reconcile, run risk checks, and require explicit policy/human enablement. Local cached state is never sufficient.

## Guardian boundary

The Guardian is modeled as an independent service boundary so it can later run outside Replit. It monitors heartbeat, exposure, venue position, loss, and trading status. It may request cancel-all, disable live trading, trigger STOP or LOCKED, and alert a human. It may not run strategies, increase capital, change risk rules, withdraw funds, or override STOP.

## Security and human controls

Any future credential integration must resolve credentials only through a
server-side provider mechanism. The adapter receives the resolved value only
inside the server transport call and does not retain or return it. Prefer
read/trade/cancel permissions without withdrawals or security-setting access.
Venue jurisdiction, account eligibility, terms review, and withdrawal
permission review must be audited before approval.

Micro-Live eligibility is separate from activation. The explicit human arming
flow must display strategy, venue, markets, capital, max order, max loss, and
max drawdown. Arming is a separate owner-controlled action, requires every
enablement gate plus clean reconciliation, expires after the policy window,
and gives each session independent loss and exposure caps. No automated,
AI-generated, or readiness-based action can arm a session.

## Incident response

Critical failures default to no new exposure. Reconciliation mismatch, stale market data, risk heartbeat loss, venue failure, unknown order state, cancel failure, hard loss, and Guardian disagreement must stop or lock the system. Major and critical incidents remain open until a human review records root cause, capital impact, safeguards that worked, required fixes, and reactivation requirements.

## Explicitly not implemented

This phase does not connect a real venue, transmit real orders, store trading
secrets, move household funds, enable leverage or margin, scale capital
automatically, place AI-generated trades, or allow automated withdrawals. A
future real integration requires the approval record above, security review,
jurisdiction and terms review, market permissions, withdrawal review,
server-side credential handling, an isolated execution account, a separately
reviewed adapter registration, a separate deployment boundary,
venue-authoritative reconciliation, and human-controlled enablement. Duplex
Reserve, Emergency Reserve, household accounts, and all other protected capital
remain inaccessible regardless of venue approval or arming state.