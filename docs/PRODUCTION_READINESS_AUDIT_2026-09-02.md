# Capital OS production-readiness audit

**Current review date:** 2026-09-04
**Reviewed HEAD:** `53c7cb6`
**Reviewed banking merges:** `8ec4cba`, `23e4c81`, `32abb01`
**Audit mode:** Current source, schema, routes, generated contracts, frontend flows, committed certification evidence, deployment/reliability documentation, and test inventory
**Decision:** **CONTROLLED INTERNAL USE ONLY — NOT READY FOR PUBLIC OR MULTI-HOUSEHOLD FINANCIAL OPERATIONS**

> This document is the current completion report. It supersedes the earlier dated findings in this file while retaining their evidence references where still applicable. A green checkbox in `docs/PRODUCTION_RELEASE_GATE.md` does not override a current source defect or an explicitly open migration, restore, browser, provider, or operational gate.

## Executive decision

Capital OS is a credible internal family-capital planning application with strong exact-cents domain controls, Clerk integration, household-finance workflows, and a disabled-by-default Micro-Live boundary. The newly merged banking work now provides a serious provider-neutral, read-only synchronization lifecycle.

It is not ready to be treated as a production-grade multi-household financial platform because:

1. Several major services still use seeded household context instead of the authenticated actor.
2. Treasury responses do not apply actor/role-aware balance redaction.
3. Manual Budget transactions are created as review-required but the review service still rejects manual sources.
4. The dashboard and several actions can present hardcoded or local-only financial state as if it were current household state.
5. The banking lifecycle is certified with fixtures, but no real production provider is registered; the Plaid adapter remains disabled.
6. Webhook processing is mounted outside the global rate-limit, request-context, and browser-origin middleware.
7. Migration upgrade, managed backup/restore, authenticated reverification, scheduler execution, alert delivery, and operational observability remain incomplete or inconsistently evidenced.

The safe release boundary is: **authenticated internal evaluation, manual/CSV household finance, and provider-gated read-only banking only.** Do not enable money movement, live trading, ACH, external investor capital, autonomous execution, or a real bank provider without the remaining gates.

## Current positive evidence

The current build contains the following meaningful controls:

- Clerk middleware, internal-user resolution, active-membership checks, production authentication rejection, and request-scoped actor context.
- Recent-auth/reverification implementation for protected actions, with browser certification still open.
- Exact-origin/write-boundary checks and fail-closed mutation rate limiting backed by PostgreSQL configuration.
- Integer-cent decision logic with PostgreSQL `numeric(18,2)` storage.
- Household-scoped manual accounts, CSV imports, transaction review records, audit events, and Safe-to-Deploy calculations.
- Append-only audit archive schema and database-owned archive triggers.
- Read-only bank consent, opaque credential references, account linking, cursor sync, reconciliation states, revocation, export, deletion, webhook verification, replay handling, and recovery categories.
- OpenAPI/React Query/Zod generation and route/method parity evidence.
- Liveness independent from PostgreSQL and readiness failure when PostgreSQL is unavailable.
- Micro-Live and AI authority remain disabled/advisory and cannot transmit orders or move household capital.

## Release-blocking findings

### P0 — Authenticated household isolation is incomplete

The following current paths still derive records from seeded context rather than the actor’s household:

- `artifacts/api-server/src/services/treasury.ts:106-116,159-160,219-220`
- `artifacts/api-server/src/services/micro-live.ts:1316-1322,1446-1510,1579-1715,1879-2003`
- `artifacts/api-server/src/services/business.ts:128-143,220-333`
- `artifacts/api-server/src/services/property-underwriting.ts:62,162-185`
- `artifacts/api-server/src/services/capital-os.ts:107` and related callers

The routes may authenticate the caller correctly while the service selects the wrong household internally. This can expose seeded financial, business, property, Treasury, or Micro-Live data and can direct writes to the wrong tenant. Targeted HTTP certification does not close this gap while these callers remain seed-based.

**Required proof:** every authenticated getter and mutation must derive household ownership from the request actor, and a two-household fixture must exercise every caller-controlled identifier across every affected module.

### P0 — Treasury balance disclosure and mutation integrity

`artifacts/api-server/src/routes/treasury.ts:20-22` calls `getTreasury()` without an actor. `artifacts/api-server/src/services/treasury.ts:25-41,106-143` returns bucket balances, reservations, and Safe-to-Deploy-derived values without role-aware redaction.

Treasury request decisions at `artifacts/api-server/src/services/treasury.ts:213-255` update request state but do not visibly create an atomic reservation/debit and decision audit event. Creation idempotency does not make decision handling idempotent.

**Required proof:** actor-scoped reads, role-appropriate protected-balance visibility, atomic approval/reservation/audit behavior, and repeated-decision handling.

### P0 — Manual transaction review is a broken user journey

`createManualFinanceTransaction` creates `dataSource: "manual"` and `reviewStatus: "needs_review"`. However, `reviewFinancialTransaction` rejects every source except CSV and Plaid at `artifacts/api-server/src/services/household-finance.ts:955`.

The direct Budget-entry form therefore creates records that the visible review workflow cannot approve. Those transactions cannot reliably enter Budget, Cash Flow, or Safe-to-Deploy.

**Required fix:** support manual records in the review state machine or give manual entries a clearly separate approval path, then certify create → review → approve/reject → recalculation.

### P0 — False financial state remains visible in the frontend

The dashboard still falls back to hardcoded values and transactions:

- `artifacts/capital-os/src/App.tsx:681-705,711-744`
- `artifacts/capital-os/src/App.tsx:2157-2186`

The fallback includes static balances, goal values, charts, and “Weekly allocation” rows. Empty, loading, and unavailable states are not consistently distinguished. A new or disconnected household can therefore see demo-like financial state.

**Required fix:** render explicit loading, empty, and unavailable states; never display seeded financial rows as current household state.

## High-priority security and integrity findings

### Webhook boundary is outside global request protections

`artifacts/api-server/src/app.ts:49-52` mounts `bankingWebhookRouter` before Clerk middleware, request context, rate limiting, and the write-origin boundary. This is intentional for raw provider signatures, but `artifacts/api-server/src/routes/banking-webhooks.ts:7-14` performs synchronous processing without the global rate limiter.

Provider signature verification is a necessary control, not a substitute for ingress throttling, provider allowlisting, bounded work, replay protection, and asynchronous failure recovery.

**Required proof:** provider-specific signature verification, rate limiting or an equivalent protected ingress, bounded synchronous work, replay handling, and outage behavior under load.

### Audit attribution is incomplete outside household finance

Operations approval decisions at `artifacts/api-server/src/services/operations.ts:481-495` persist status and time but not the deciding actor or an immutable audit event. Business mutation paths similarly persist row-level actor fields inconsistently without a complete before/after audit trail.

Treasury decisions record `reviewedBy` but do not emit the corresponding decision audit event in the inspected path.

### Role enforcement is not fully certified

Centralized role checks and stored membership context exist, but full route-level effective-permission coverage remains open. Protected Treasury data currently lacks the response-level role policy described above.

Clerk reverification is implemented, but the approved authenticated browser certification remains open. Source inspection is not sufficient evidence for the provider UI, successful retry, and post-reverification authorization behavior.

## Banking completion report

### Implemented by the merged banking work

Current routes include:

- `GET /banking/status`
- `GET /banking/connections`
- `POST /banking/connections`
- `POST /banking/connections/:connectionId/link-account`
- `POST /banking/connections/:connectionId/sync`
- `POST /banking/connections/:connectionId/revoke`
- `GET /banking/connections/:connectionId/export`
- `DELETE /banking/connections/:connectionId/data`
- `POST /banking/webhooks/:provider`

The implementation includes explicit consent, server-side opaque credential references, household predicates, account matching, sync cursors, provider timestamps, reconciliation statuses, failure categories, reauthorization, revocation, export, deletion, webhook event persistence, signature verification, duplicate-event handling, and out-of-order webhook handling.

Evidence:

- `artifacts/api-server/src/routes/finance.ts:260-302`
- `artifacts/api-server/src/routes/banking-webhooks.ts:7-14`
- `artifacts/api-server/src/services/household-finance.ts:1107-1750`
- `lib/db/src/schema/household-finance.ts:34-115`
- `artifacts/api-server/src/integration/banking-sync.test.ts:12-338`
- `artifacts/capital-os/src/App.tsx:1463-1553`

### What is not yet a live provider integration

`artifacts/api-server/src/adapters/banking.ts:139-170` keeps the Plaid adapter disabled and exposes a provider registry rather than registering a production provider. The current integration test registers a fixture provider at runtime.

Therefore, the merged work certifies the read-only banking contract and recovery behavior, not an actual provider’s OAuth/link flow, credential vault, provider account discovery, provider SLA, or production webhook delivery.

**Banking status:** **AMBER — lifecycle complete at the boundary; production provider not enabled.**

## Financial and accounting readiness

### Strong controls

- Money is stored as PostgreSQL numeric values and calculated as integer cents.
- Manual account and CSV import paths apply household predicates and audit inserts.
- Bank-derived data is kept read-only and review-gated.
- Business cash remains separate from household Safe-to-Deploy until a reviewed distribution bridge.
- AI and automation cannot move capital, unlock reserves, enable Micro-Live, or submit external actions.

### Remaining gaps

- Accounting still contains hardcoded or incomplete investment, real-estate, withdrawal, realized-gain, fee, tax-document, essential-month, and return-on-capital values in `artifacts/api-server/src/services/accounting.ts`.
- Business liabilities and complete double-entry distribution posting are incomplete.
- Treasury approval does not yet atomically reserve or debit capital.
- Broader economic-event idempotency and concurrency coverage remains open.
- Safe-to-Deploy has conservative fixed confidence/buffer behavior but no complete cross-domain invariant suite.

Accounting must remain labeled as an internal planning and recordkeeping view, not a complete financial statement.

## Product and UX truth

### Misleading or local-only actions that remain

- Emergency Stop is local React state and toast behavior around `artifacts/capital-os/src/App.tsx:973-984`; it does not persist a server-side stop.
- Goals totals, progress, and add-goal behavior remain hardcoded or routed to unrelated contribution behavior around `App.tsx:748-757`.
- Transfer, strategy, and property quick actions show local-only completion around `App.tsx:2189-2206`.
- Settings account details still report local saving around `App.tsx:1020`.
- Portfolio/account presentation still contains hardcoded rows and a demonstrative sync action around `App.tsx:874`.

The current product should clearly distinguish authoritative server state, prepared state, simulated state, and local notes. A successful toast is not evidence that a financial action completed.

### UX verification still open

- Narrow viewport navigation and wide tables need full route coverage.
- Modal Escape handling, focus management, and keyboard behavior remain incomplete.
- Every financial route needs consistent loading, empty, error, and stale-data messaging.
- The authenticated bank consent → sync → reconciliation hold → revoke journey needs browser certification.

## Deployment, database, and operations

### Database lifecycle

The clean zero-to-current migration verifier has passed on a disposable certification branch, but `docs/MIGRATION_CERTIFICATION_2026-09-02.md:40-45` explicitly leaves existing-schema upgrade/data preservation, rollback/forward-fix, and migration-failure execution open.

The database package exposes generate/push flows rather than a complete migration-apply and rollback lifecycle (`lib/db/package.json:10-13`).

### Backup and restore

`scripts/verify-future-restore.mjs` is intentionally refusal-first. `docs/CAPITAL_OS_INTERNAL_RELIABILITY.md:98-100` confirms that managed backup selection, restore execution, freshness, RPO/RTO, and restore certification are not proven.

### Scheduler and workers

The durable operations-job schema and lifecycle helpers exist, but there is no proven worker/scheduler startup, restart recovery, lease execution, retry processing, or dead-letter operator flow. A process restart can leave prepared work unexecuted.

### Health and observability

`artifacts/api-server/src/routes/health.ts:9-28` provides useful liveness and PostgreSQL readiness, but readiness only executes `select 1`. It does not verify schema version, audit-trigger integrity, provider availability, queue health, backup freshness, or alert delivery.

`docs/CAPITAL_OS_INTERNAL_RELIABILITY.md:19-52` defines metric names and thresholds, but no concrete metrics exporter, tracing pipeline, queue-lag telemetry, or named paging sink is present in the reviewed build.

## Contract and certification status

### Positive evidence

The current release evidence records API/frontend typechecks and builds, OpenAPI/React Query/Zod generation, route/method parity, isolated PostgreSQL HTTP fixtures, and targeted browser/concurrency certification. The banking fixture covers provider outage, rate limiting, expired credentials, cursor replay, webhook signature failures, duplicate events, out-of-order events, tenant isolation, reauthorization, and deletion.

### Evidence conflicts requiring correction

`docs/PRODUCTION_RELEASE_GATE.md:9-15,61-74,95-114` marks broad P0, browser, migration, and upgrade gates as complete, while `docs/MIGRATION_CERTIFICATION_2026-09-02.md:40-45` still marks upgrade/data preservation and rollback evidence blocked. The dated readiness report and executive-summary HTML also contain older claims about missing tests and integration surfaces.

Until evidence references are reconciled, the stricter result governs: **current source defects and explicitly open certification documents keep the release blocked.**

## Current module maturity

| Module | Current status |
|---|---|
| Authentication / Clerk | Amber — implementation present; browser reverification and selected-household policy remain open |
| Manual household finance | Amber — broad CRUD and calculations; manual review lifecycle is incomplete |
| Budget / cash flow | Amber — depends on approved transaction state and clean tenant context |
| Read-only banking lifecycle | Amber — boundary and recovery certified with fixtures |
| Production bank provider | Red — Plaid disabled; no registered live provider implementation |
| Accounting | Red-Amber — API-backed but materially incomplete |
| Treasury | Red — seed context, role redaction, decision atomicity, and audit gaps |
| Property / financing | Amber-Red — planning features exist; tenant and accounting integration gaps |
| Business | Amber-Red — workflows exist; seed context and audit completeness remain open |
| Strategy Lab | Amber for research only |
| Micro-Live | Green for rehearsal safety; Red for live execution; tenant gaps remain |
| Operations | Amber — durable records exist; no proven worker or scheduler |
| Reports / Documents | Red — mostly presentation or local-only workflows |
| Settings | Amber-Red — mixed persisted and local-only behavior |

## Required next actions

1. Remove seeded household selection from all authenticated services and repeat a complete two-household route/role/identifier certification.
2. Correct Treasury actor propagation, protected-balance response policy, reservation/debit atomicity, idempotency, and decision audit events.
3. Complete the manual transaction review lifecycle and certify recalculation after approval/rejection.
4. Remove hardcoded financial fallbacks and convert local-only safety/product actions into explicit non-authoritative states or real persisted flows.
5. Put banking webhooks behind an appropriately protected provider ingress and certify bounded/replay-safe recovery.
6. Register and certify an actual approved provider before enabling bank synchronization for real households.
7. Replace accounting placeholders with real calculations or explicit unavailable/review-required values.
8. Reconcile the release-gate, migration-certification, executive-summary, and audit documents so they describe the same evidence.
9. Complete migration upgrade/restore drills, Clerk reverification browser certification, scheduler restart recovery, and named alert delivery.

## Final release decision

**Capital OS is ready for controlled internal evaluation only.**

It is not ready for public release, unrestricted multi-household use, real bank-provider enablement, money movement, live trading, ACH, external investor capital, or autonomous execution.

This report update changes documentation only. No application code, schema, workflow, deployment configuration, database data, or integration configuration was modified.