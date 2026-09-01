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

The checked-in adapter is a simulated rehearsal adapter. Its `placeOrder` method always refuses transmission.

## Reconciliation and recovery

Reconciliation is required after fills, cancel anomalies, reconnects, restarts, and periodic health checks. A mismatch stops new exposure, cancels open orders, fetches venue state, rebuilds internal state, and requires verification before resuming.

At restart, the system must connect to the venue, fetch balances, positions, open orders, and recent fills, reconstruct state, reconcile, run risk checks, and require explicit policy/human enablement. Local cached state is never sufficient.

## Guardian boundary

The Guardian is modeled as an independent service boundary so it can later run outside Replit. It monitors heartbeat, exposure, venue position, loss, and trading status. It may request cancel-all, disable live trading, trigger STOP or LOCKED, and alert a human. It may not run strategies, increase capital, change risk rules, withdraw funds, or override STOP.

## Security and human controls

Any future credential integration must keep credentials server-side, out of frontend payloads, AI prompts, logs, and source control. Prefer read/trade/cancel permissions without withdrawals or security-setting access. Venue jurisdiction, account eligibility, terms review, and withdrawal permission review must be audited before approval.

Micro-Live eligibility is separate from activation. The explicit human arming flow must display strategy, venue, markets, capital, max order, max loss, and max drawdown. Authorization expires and each session receives independent loss and exposure caps.

## Incident response

Critical failures default to no new exposure. Reconciliation mismatch, stale market data, risk heartbeat loss, venue failure, unknown order state, cancel failure, hard loss, and Guardian disagreement must stop or lock the system. Major and critical incidents remain open until a human review records root cause, capital impact, safeguards that worked, required fixes, and reactivation requirements.

## Explicitly not implemented

This phase does not connect a real venue, transmit real orders, store trading secrets, move household funds, enable leverage or margin, scale capital automatically, place AI-generated trades, or allow automated withdrawals. A future real integration requires a separate venue approval, security review, jurisdiction review, deployment boundary, and human-controlled enablement.