# Capital OS production-readiness audit

**Current review date:** 2026-09-04
**Reviewed HEAD:** `38c6775`
**Reviewed working-tree implementation:** actor-scoped household reads, manual transaction review lifecycle, PostgreSQL certification, authenticated browser certification, and the repository TypeScript test runner
**Reviewed banking merges:** `8ec4cba`, `23e4c81`, `32abb01`
**Audit mode:** Current source, schema, routes, generated contracts, frontend flows, committed certification evidence, deployment/reliability documentation, and test inventory
**Decision:** **CONTROLLED INTERNAL USE ONLY — NOT READY FOR PUBLIC OR MULTI-HOUSEHOLD FINANCIAL OPERATIONS**

> This document is the current completion report. It supersedes the earlier dated findings in this file while retaining their evidence references where still applicable. A green checkbox in `docs/PRODUCTION_RELEASE_GATE.md` does not override a current source defect or an explicitly open migration, restore, browser, provider, or operational gate.

## Executive decision

Capital OS is a credible internal family-capital planning application with strong exact-cents domain controls, Clerk integration, household-finance workflows, and a disabled-by-default Micro-Live boundary. The newly merged banking work now provides a serious provider-neutral, read-only synchronization lifecycle.

It is not ready to be treated as a production-grade multi-household financial platform because:

1. Treasury and several remaining operational paths still use seeded context or lack complete actor/identifier certification.
2. Treasury responses do not apply actor/role-aware balance redaction.
3. Treasury role-aware balance redaction and atomic decision handling remain incomplete; the manual transaction review flow itself is now HTTP- and browser-certified.
4. Several local-only financial and safety actions remain, even though misleading empty-household dashboard demo values were removed.
5. The banking lifecycle is certified with fixtures, but no real production provider is registered; the Plaid adapter remains disabled.
6. Webhook processing is mounted outside the global rate-limit, request-context, and browser-origin middleware.
7. Migration upgrade, managed backup/restore, authenticated reverification, scheduler execution, alert delivery, and operational observability remain incomplete or inconsistently evidenced.

The safe release boundary is: **authenticated internal evaluation, manual/CSV household finance, and provider-gated read-only banking only.** Do not enable money movement, live trading, ACH, external investor capital, autonomous execution, or a real bank provider without the remaining gates.

## Current positive evidence

The current build contains the following meaningful controls:

- Clerk middleware, internal-user resolution, active-membership checks, production authentication rejection, and request-scoped actor context.
- Recent-auth/reverification implementation for protected actions; Clerk reverification certification remains open, while manual transaction review browser certification is merged.
- Exact-origin/write-boundary checks and fail-closed mutation rate limiting backed by PostgreSQL configuration.
- Integer-cent decision logic with PostgreSQL `numeric(18,2)` storage.
- Household-scoped manual accounts, CSV imports, transaction review records, audit events, and Safe-to-Deploy calculations.
- Manual transaction creation now reaches the shared review queue; approval/rejection updates review state, budget inclusion, audit attribution, and downstream cash-flow/budget inputs.
- Capital, Business, Property, Treasury, Strategy Lab, Operations, Financing, Micro-Live, and Intelligence authenticated paths now initialize and resolve tenant core records from the request actor rather than the shared demo household.
- Append-only audit archive schema and database-owned archive triggers.
- Read-only bank consent, opaque credential references, account linking, cursor sync, reconciliation states, revocation, export, deletion, webhook verification, replay handling, and recovery categories.
- OpenAPI/React Query/Zod generation and route/method parity evidence.
- Liveness independent from PostgreSQL and readiness failure when PostgreSQL is unavailable.
- Micro-Live and AI authority remain disabled/advisory and cannot transmit orders or move household capital.

## Release-blocking findings

### P0 — Authenticated household isolation is incomplete

The latest implementation removed the previously identified seeded-context lookup from the authenticated Capital, Business, Property, Treasury, Strategy Lab, Operations, Financing, Micro-Live, and Intelligence paths. They now initialize tenant core records from `actor.householdId` and `actor.userId`, and the affected routes pass the actor through.

Remaining seed-dependent or incompletely certified paths include:

- `artifacts/api-server/src/middleware/request-context.ts:276` and `artifacts/api-server/src/services/household-finance.ts:130` retain explicit development/test fallback behavior.
- `artifacts/api-server/src/services/micro-live.ts:60` retains its no-actor development/test seed branch; authenticated callers use actor-scoped initialization.
- The actor-scoped Treasury, Strategy Lab, Operations, and Financing paths still require the complete two-household adversarial identifier matrix before this gate can close.

Production authentication must never reach those fallback branches. A route can authenticate the caller correctly while an incompletely scoped service or caller-controlled identifier still selects the wrong household internally.

**Required proof:** every authenticated getter and mutation must derive household ownership from the request actor, and a two-household fixture must exercise every caller-controlled identifier across every affected module.

### P0 — Treasury balance disclosure and mutation integrity

`artifacts/api-server/src/routes/treasury.ts:20-22` now passes the request actor into `getTreasury()`. `artifacts/api-server/src/services/treasury.ts:25-41,106-143` still returns bucket balances, reservations, and Safe-to-Deploy-derived values without role-aware redaction.

Treasury request decisions at `artifacts/api-server/src/services/treasury.ts:213-255` update request state but do not visibly create an atomic reservation/debit and decision audit event. Creation idempotency does not make decision handling idempotent.

**Required proof:** actor-scoped reads, role-appropriate protected-balance visibility, atomic approval/reservation/audit behavior, and repeated-decision handling.

### Manual transaction review lifecycle is implemented and certified

`createManualFinanceTransaction` creates `dataSource: "manual"` and `reviewStatus: "needs_review"`. `reviewFinancialTransaction` now accepts manual rows, and `getTransactionReviewQueue` includes manual rows alongside CSV/Plaid rows.

The focused HTTP regression in `artifacts/api-server/src/integration/p0-http.test.ts` covers manual create → queue visibility → approval → cash-flow recalculation → budget recalculation. The repository test entry point now uses the workspace TypeScript runner and resolves the existing extensionless imports. The isolated PostgreSQL suite completed with **96 passed, 0 failed, 0 skipped**, including manual approval/rejection, fresh reads, budget, cash-flow, and Safe-to-Deploy recalculation.

**Evidence status:** the isolated PostgreSQL HTTP suite completed with 96/96 passing, and the authenticated browser certification was completed in merged task `#81` at HEAD `38c6775`. Broader role, tenant-isolation, and financial-state gates remain separate.

### P0 — False financial state has been reduced; local-only actions remain

The empty-household dashboard demo values were removed in commit `58a2856`. Current dashboard copy and state handling distinguish server-returned data, loading, unavailable, and empty states:

- `artifacts/capital-os/src/App.tsx:373`
- `artifacts/capital-os/src/App.tsx:698-801`

This does not close the broader persistence-truth issue. Export view, some goal/transfer/strategy/property quick actions, settings save feedback, and demonstrative portfolio sync behavior remain local-only or prepared-only and must not be interpreted as authoritative financial state.

**Required proof:** certify the affected browser states and either persist each critical action or label it explicitly as local-only/prepared/blocked.

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

The committed release evidence records API/frontend typechecks and builds, OpenAPI/React Query/Zod generation, route/method parity, isolated PostgreSQL HTTP fixtures, and targeted browser/concurrency certification. The banking fixture covers provider outage, rate limiting, expired credentials, cursor replay, webhook signature failures, duplicate events, out-of-order events, tenant isolation, reauthorization, and deletion. The current working-tree verification additionally passes the full workspace typecheck, API contract parity for 129 routes, the PostgreSQL-backed API suite at 96/96, an API health request, and a clean API workflow restart.

The manual-finance HTTP regression has now been executed against PostgreSQL through the workspace TypeScript runner; its 96/96 result is runtime evidence for the HTTP portion of the flow, not a substitute for the still-open authenticated browser certification.

### Evidence conflicts requiring correction

`docs/PRODUCTION_RELEASE_GATE.md:9-15,61-74,95-114` marks broad P0, browser, migration, and upgrade gates as complete, while `docs/MIGRATION_CERTIFICATION_2026-09-02.md:40-45` still marks upgrade/data preservation and rollback evidence blocked. The dated readiness report and executive-summary HTML also contain older claims about missing tests and integration surfaces.

Until evidence references are reconciled, the stricter result governs: **current source defects and explicitly open certification documents keep the release blocked.**

## Current module maturity

| Module | Current status |
|---|---|
| Authentication / Clerk | Amber — implementation present; browser reverification and selected-household policy remain open |
| Manual household finance | Amber — isolated PostgreSQL HTTP certification passed; authenticated browser certification remains open |
| Budget / cash flow | Amber — depends on approved transaction state and clean tenant context |
| Read-only banking lifecycle | Amber — boundary and recovery certified with fixtures |
| Production bank provider | Red — Plaid disabled; no registered live provider implementation |
| Accounting | Red-Amber — API-backed but materially incomplete |
| Treasury | Red — seed context, role redaction, decision atomicity, and audit gaps |
| Property / financing | Amber-Red — planning features exist; tenant and accounting integration gaps |
| Business | Amber-Red — authenticated reads and writes are actor-scoped; audit completeness and broader adversarial certification remain open |
| Strategy Lab | Amber for research only |
| Micro-Live | Green for rehearsal safety; Red for live execution; broader adversarial tenant certification remains open |
| Operations | Amber — durable records exist; no proven worker or scheduler |
| Reports / Documents | Red — mostly presentation or local-only workflows |
| Settings | Amber-Red — mixed persisted and local-only behavior |

## Required next actions

1. Complete the two-household route/role/identifier certification for the remaining Treasury, Strategy Lab, Operations, and optional fallback paths.
2. Correct Treasury actor propagation, protected-balance response policy, reservation/debit atomicity, idempotency, and decision audit events.
3. Execute the manual transaction review certification and verify fresh-read recalculation after approval/rejection.
4. Convert remaining local-only safety/product actions into explicit non-authoritative states or real persisted flows.
5. Put banking webhooks behind an appropriately protected provider ingress and certify bounded/replay-safe recovery.
6. Register and certify an actual approved provider before enabling bank synchronization for real households.
7. Replace accounting placeholders with real calculations or explicit unavailable/review-required values.
8. Reconcile the release-gate, migration-certification, executive-summary, and audit documents so they describe the same evidence.
9. Complete migration upgrade/restore drills, Clerk reverification browser certification, scheduler restart recovery, and named alert delivery.

## Final release decision

**Capital OS is ready for controlled internal evaluation only.**

It is not ready for public release, unrestricted multi-household use, real bank-provider enablement, money movement, live trading, ACH, external investor capital, or autonomous execution.

This audit update changes documentation only. It records the current working-tree implementation and verification state; it does not change application code, schema, workflow, deployment configuration, database data, or integration configuration.