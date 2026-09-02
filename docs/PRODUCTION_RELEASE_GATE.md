# Capital OS production release gate

**Current decision:** **NOT READY**  
**Audit:** `docs/PRODUCTION_READINESS_AUDIT_2026-09-02.md`  
**Rule:** Do not check a box without attached evidence from source inspection, schema inspection, an automated test, a runtime request, a browser workflow, or a configuration inspection.

## P0 release blockers

- [ ] Contribution goal lookup and update require the current household ID.
- [ ] Two independent households can be created in a test fixture and cannot read or mutate each other.
- [ ] HTTP IDOR tests cover every route with a caller-controlled path or body identifier.
- [ ] Production browser writes fail closed when no explicit allowed-origin policy is configured.
- [ ] CSRF/same-site credential policy is implemented and tested for allowed, disallowed, and malformed origins.
- [ ] A clean database can be created from zero and brought to the current schema through the supported managed lifecycle.
- [ ] An existing older schema can be upgraded without losing households, users, memberships, ledger, goals, Treasury, business, strategy, accounting, or audit data.
- [ ] A managed PostgreSQL backup is restored into an isolated database.
- [ ] Restore verification passes for identity, tenant isolation, ledger balance, Treasury, protected capital, business ownership, accounting, strategy state, and audit history.
- [ ] Authenticated HTTP/browser tests cover onboarding, sign-in, sign-out, reload, and household-scoped dashboard access.
- [ ] Production-like role tests prove owner, partner, advisor, and viewer behavior over HTTP.
- [ ] Real concurrent transfer tests prove no overdraft and no ledger imbalance.
- [ ] Concurrent idempotency tests prove one economic event for contribution, transfer, capital request, and business distribution preparation.
- [ ] Audit attribution records the authenticated actor rather than always using the household owner.

## P1 release risks

- [ ] Effective per-membership permissions are enforced rather than merely loaded.
- [ ] Step-up/recent-auth requirements protect policy changes, approvals, ownership changes, permission changes, and Micro-Live boundaries.
- [ ] Operational scheduling is durable across process restart.
- [ ] Automation health derives from actual run history, including failures and missed work.
- [ ] Reconciliation/Guardian work has retries, durable failure records, and a dead-letter/escalation path.
- [ ] Structured metrics and alerts exist for readiness, authorization denials, database failures, audit writes, idempotency conflicts, automation failures, and reconciliation failures.
- [ ] Process-local rate limiting is replaced or explicitly protected by shared production infrastructure.
- [ ] Accounting liability, real-estate, investment, and business-equity treatment is reconciled across views.
- [ ] Empty-ledger accounting cannot report balanced/reconciled without evidence.
- [ ] Treasury decisions use the persisted protected-capital lock state.
- [ ] Micro-Live order-event persistence uses the correct order-intent relationship and validates sequences.
- [ ] Secret references have a vault, rotation, access-audit, and least-privilege workflow.

## Required financial invariants

- [ ] All authoritative money remains PostgreSQL `numeric(18,2)` at rest and integer cents in decision logic.
- [ ] Debits equal credits for contribution, transfer, allocation, deallocation, business contribution, business distribution, and adjustment.
- [ ] Household Safe-to-Deploy cannot increase from business cash, receivables, planning balances, property estimates, projected income, or unrealized P&L.
- [ ] Business cash remains separate from household Safe-to-Deploy until a completed human-reviewed owner distribution bridge.
- [ ] Protected Duplex Reserve and emergency reserves cannot fund strategy, Treasury active allocation, business, opportunity, or Micro-Live paths.
- [ ] Property planning fields cannot create an owned family asset without an explicit acquisition state/workflow.
- [ ] AI cannot move money, change protections, override risk, enable trading, change credentials, or submit legal/chain transactions.
- [ ] Automation cannot move money, unlock reserves, enable Micro-Live, change ownership, sign contracts, or submit offers.
- [ ] Micro-Live real venue order transmission remains disabled by design.

## Persistence truth gates

- [ ] Every visible “saved”, “completed”, “reviewed”, “exported”, and “updated” action is classified as server-persisted, prepared, local-only, blocked, or simulated.
- [ ] No local-only action claims that financial, legal, permission, or ownership state changed.
- [ ] Every critical write survives page reload and a fresh API read.
- [ ] Contribution reload proves allocation metadata, ledger movement, goal progress, Treasury relationship, and audit record remain consistent.
- [ ] Treasury request/review state survives reload without implying money movement.
- [ ] Business distribution state clearly distinguishes proposed/prepared from completed household income.
- [ ] Accounting/report/document exports either persist a durable artifact or are explicitly labeled local-only.

## Contract and build gates

- [ ] OpenAPI route/method parity is checked automatically.
- [ ] Generated React Query and Zod artifacts are regenerated from the committed OpenAPI contract.
- [ ] Auth and forbidden responses have complete schemas and global security annotations.
- [ ] API typecheck passes.
- [ ] Frontend typecheck passes.
- [ ] API production build passes.
- [ ] Frontend production build passes.
- [ ] Domain tests pass with zero failures.
- [ ] HTTP integration tests pass.
- [ ] Database integration tests pass.
- [ ] Browser E2E tests pass.
- [ ] Concurrency tests pass.
- [ ] Migration tests pass.
- [ ] `git diff --check` passes.

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
- [ ] Two-household isolation is verified over HTTP.
- [ ] Clean migration and upgrade tests pass.
- [ ] Backup restore drill passes.
- [ ] Authenticated browser critical journeys pass.
- [ ] P0 blockers equal zero.

Until every P0 item is checked with evidence, the only valid release decision is **NOT READY**.