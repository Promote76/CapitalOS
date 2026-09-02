# Capital OS production release gate

**Current decision:** **NOT READY**  
**Audit:** `docs/PRODUCTION_READINESS_AUDIT_2026-09-02.md`  
**Rule:** Do not check a box without attached evidence from source inspection, schema inspection, an automated test, a runtime request, a browser workflow, or a configuration inspection.

## P0 release blockers

- [ ] **P0-01 Caller-controlled identifier / IDOR matrix.** Selected two-household and mass-assignment cases execute, but the complete route-by-route matrix remains open.
- [x] **P0-02 Origin / CSRF certification.** Five published-origin probes passed, including missing, malformed, cross-site, allowed, and invalid-credential-origin writes. Evidence: `scripts/certify-production-origin.mjs`, `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] **P0-03 Existing-schema upgrade.** Historical data survived the additive current-schema upgrade on disposable Neon branches. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [ ] **P0-04 Managed backup / restore.** Provider-managed backup reference, isolated restore, and invariant verification remain unavailable.
- [ ] **P0-05 Authenticated browser journey.** Clerk onboarding, sign-in, sign-out, reload, and household-scoped dashboard proof remain unexecuted.
- [ ] **P0-06 Role / effective-permission HTTP certification.** Selected role paths execute; the complete grant, revoke, membership-change, and tampering matrix remains open.
- [x] **P0-07 Concurrent idempotency breadth.** The isolated HTTP fixture passed same-key concurrency and mismatched-payload cases for contribution, transfer, strategy allocation, capital request, and business distribution. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [ ] **P0-08 Actor attribution certification.** Representative audit attribution executes; the complete permitted-action audit query remains open.

## P1 release risks

- [ ] Effective per-membership permissions are enforced rather than merely loaded.
- [ ] Step-up/recent-auth requirements protect policy changes, approvals, ownership changes, permission changes, and Micro-Live boundaries.
- [ ] Operational scheduling is durable across process restart.
- [ ] Automation health derives from actual run history, including failures and missed work.
- [ ] Reconciliation/Guardian work has retries, durable failure records, and a dead-letter/escalation path.
- [ ] Structured metrics and alerts exist for readiness, authorization denials, database failures, audit writes, idempotency conflicts, automation failures, and reconciliation failures.
- [ ] Process-local rate limiting is replaced or explicitly protected by shared production infrastructure.
- [ ] Accounting liability, real-estate, investment, and business-equity treatment is reconciled across views.
- [x] Empty-ledger accounting cannot report balanced/reconciled without evidence. Evidence: accounting domain tests.
- [x] Treasury decisions use the persisted protected-capital lock state. Evidence: source inspection and treasury tests.
- [x] Micro-Live order-event persistence uses the correct order-intent relationship and validates sequences. Evidence: source inspection and Micro-Live tests.
- [ ] Secret references have a vault, rotation, access-audit, and least-privilege workflow.

## Required financial invariants

- [x] All authoritative money remains PostgreSQL `numeric(18,2)` at rest and integer cents in decision logic. Evidence: schema/source inspection and domain tests.
- [x] Debits equal credits for the currently exercised contribution and transfer paths. Broader business/distribution/adjustment coverage remains open.
- [ ] Household Safe-to-Deploy cannot increase from business cash, receivables, planning balances, property estimates, projected income, or unrealized P&L.
- [x] Business cash remains separate from household Safe-to-Deploy until a completed human-reviewed owner distribution bridge. Evidence: domain/source review; bridge remains prepared-only.
- [x] Protected Duplex Reserve and emergency reserves cannot fund strategy, Treasury active allocation, business, opportunity, or Micro-Live paths. Evidence: domain safety tests.
- [x] Property planning fields cannot create an owned family asset without an explicit acquisition state/workflow. Evidence: property domain/source review.
- [x] AI cannot move money, change protections, override risk, enable trading, change credentials, or submit legal/chain transactions. Evidence: governance tests.
- [x] Automation cannot move money, unlock reserves, enable Micro-Live, change ownership, sign contracts, or submit offers. Evidence: operations safety tests.
- [x] Micro-Live real venue order transmission remains disabled by design. Evidence: execution domain tests.

## Persistence truth gates

- [x] Every reviewed visible action is classified as server-persisted, prepared, local-only, blocked, or simulated. Evidence: `docs/UI_PERSISTENCE_TRUTH_MATRIX.md`.
- [x] No reviewed local-only action claims that financial, legal, permission, or ownership state changed. Evidence: frontend source review and persistence matrix.
- [ ] Every critical write survives page reload and a fresh API read.
- [ ] Contribution reload proves allocation metadata, ledger movement, goal progress, Treasury relationship, and audit record remain consistent.
- [ ] Treasury request/review state survives reload without implying money movement.
- [ ] Business distribution state clearly distinguishes proposed/prepared from completed household income.
- [ ] Accounting/report/document exports either persist a durable artifact or are explicitly labeled local-only.

## Contract and build gates

- [x] OpenAPI route/method parity is checked automatically.
- [x] Generated React Query and Zod artifacts are regenerated from the committed OpenAPI contract.
- [x] Auth and forbidden responses have complete schemas and global security annotations.
- [x] API typecheck passes.
- [x] Frontend typecheck passes.
- [x] API production build passes.
- [x] Frontend production build passes.
- [x] Domain tests pass with zero failures.
- [x] HTTP integration tests pass against the isolated certification PostgreSQL fixture.
- [x] Database integration tests pass against the isolated certification PostgreSQL fixture.
- [ ] Browser E2E tests pass.
- [x] Concurrency tests pass for the executed contribution/transfer, high-contention, capital-request, and business-distribution scenarios.
- [x] Clean migration tests and the historical data-preserving upgrade pass on disposable isolated PostgreSQL branches. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] `git diff --check` passes.

## Operational configuration gates

- [ ] Production Clerk instance and allowed origins are configured.
- [ ] Production database is managed and schema publication path is documented for the release.
- [ ] Backup freshness, retention, RPO, and RTO are recorded.
- [ ] Restore drill date, source backup, isolated target, and integrity results are recorded.
- [ ] Durable queue/scheduler configuration is recorded.
- [ ] Rate-limit store and trusted proxy configuration are recorded.
- [ ] Structured log retention and audit-log shipping are configured.
- [ ] Readiness, authorization, database, automation, and reconciliation alerts are configured.
- [ ] No secrets appear in frontend bundles, logs, error responses, audit payloads, or AI context.

## Current evidence snapshot

As of 2026-09-02:

- [x] API and frontend typechecks pass.
- [x] API, frontend, and mockup builds pass with managed build environment variables.
- [x] OpenAPI/React Query/Zod generation passes.
- [x] 62 pure domain tests pass; 0 fail; 0 skip.
- [x] Liveness remains healthy during an unavailable-database process test.
- [x] Readiness returns `503` during the same database failure.
- [x] Production-like signed-out dashboard access returns `401` despite `X-Household-Role: owner`.
- [x] Real Micro-Live transmission remains disabled.
- [ ] Production identity session is verified end-to-end.
- [x] Two-household isolation is verified over HTTP for the current fixture scenarios; systematic route coverage remains open.
- [x] Isolated PostgreSQL fixture passes duplicate contribution, parallel transfer, 100-request `$25` contention with balanced ledger totals, concurrent capital-request creation, concurrent business-distribution preparation, and actor-attributed audit assertions.
- [x] Certification evidence index, route matrix, role matrix, and UI persistence matrix are recorded.
- [x] Clean migration and existing-schema upgrade evidence are recorded for disposable isolated PostgreSQL branches; managed production restore remains open.
- [ ] Backup restore drill passes.
- [ ] Authenticated browser critical journeys pass.
- [ ] P0 blockers equal zero.

Until every P0 item is checked with evidence, the only valid release decision is **NOT READY**.