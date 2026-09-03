# Capital OS internal release gate

**Current decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**
**Audit:** `docs/PRODUCTION_READINESS_AUDIT_2026-09-02.md`  
**Rule:** Do not check a box without attached evidence from source inspection, schema inspection, an automated test, a runtime request, a browser workflow, or a configuration inspection.

## P0 release blockers

- [x] **P0-01 Caller-controlled identifier / IDOR matrix.** The isolated PostgreSQL fixture exercised all 108 route/method pairs plus applicable household-read, same-household, foreign/malformed-identifier, and mass-assignment probes without unsafe success, leakage, or server errors. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] **P0-02 Origin / CSRF certification.** Five published-origin probes passed, including missing, malformed, cross-site, allowed, and invalid-credential-origin writes. Evidence: `scripts/certify-production-origin.mjs`, `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] **P0-03 Existing-schema upgrade.** Historical data survived the additive current-schema upgrade on disposable Neon branches. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] **P0-05 Authenticated browser journey.** The secure programmatic Clerk rerun passed visible first-user onboarding, household creation, a saved manual-account write, reload persistence, visible sign-out to the public boundary, repeat sign-in, and second-household isolation. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] **P0-06 Role / effective-permission HTTP certification.** The isolated PostgreSQL fixture passed the documented role, effective-permission, membership, selection, role/body-tampering, and denied-action cases. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] **P0-07 Concurrent idempotency breadth.** The isolated HTTP fixture passed same-key concurrency and mismatched-payload cases for contribution, transfer, strategy allocation, capital request, and business distribution. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] **P0-08 Actor attribution certification.** The isolated PostgreSQL fixture queried persisted actors for the exercised permitted and denied actions and verified that denied tampering did not create a misleading audit row. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
## P1 release risks

- [ ] Effective per-membership permissions are enforced rather than merely loaded.
- [ ] **Step-up/reverification certification.** The implementation uses Clerk's provider-supported reverification contract for policy changes, approvals, ownership changes, permission changes, and Micro-Live boundaries; the approved authenticated browser evidence is still open.
- [ ] Operational scheduling is durable across process restart.
- [x] Automation health derives from actual persisted job history, including failures and dead-lettered work. Evidence: `artifacts/api-server/src/services/operations.ts`, `docs/CAPITAL_OS_INTERNAL_RELIABILITY.md`.
- [x] Reconciliation/Guardian work has durable failure records and a stop/escalation path. Evidence: `artifacts/api-server/src/services/micro-live.ts`, `docs/CAPITAL_OS_INTERNAL_RELIABILITY.md`.
- [x] Structured metric names and alert severity/response definitions exist for readiness, authorization denials, database failures, audit writes, idempotency conflicts, automation failures, and reconciliation failures. Evidence: `artifacts/api-server/src/domain/reliability.ts`.
- [ ] Process-local rate limiting is replaced or explicitly protected by shared production infrastructure.
- [x] Accounting exposes an explicit cross-view reconciliation status and keeps planning, Treasury, business, and property scopes separate from household net worth. Evidence: accounting domain tests and `/api/accounting/overview`.
- [x] Empty-ledger accounting cannot report balanced/reconciled without evidence. Evidence: accounting domain tests.
- [x] Treasury decisions use the persisted protected-capital lock state. Evidence: source inspection and treasury tests.
- [x] Micro-Live order-event persistence uses the correct order-intent relationship and validates sequences. Evidence: source inspection and Micro-Live tests.
- [ ] Secret references have a vault, rotation, access-audit, and least-privilege workflow.

## Step-up evidence status

- [x] **Implementation.** Clerk-backed requests now check `auth.has({ reverification: "strict" })`, return Clerk's standardized reverification hint, and the Capital OS client wraps protected actions with `useReverification()` so the provider UI can verify and retry the original action.
- [ ] **Certification.** A project owner with Clerk dashboard access must configure/confirm the supported reverification factor in the approved Clerk Development environment, then run a browser test user through a stale protected action, the provider reverification UI, a successful retry, and authorization denial that remains denied after reverification.
- **Not evidence:** session age, `iat` freshness, `X-Test-Step-Up`, invented OTPs, or source inspection alone.

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
- [x] Browser E2E tests pass for the authenticated P0-05 critical journey.
- [x] Concurrency tests pass for the executed contribution/transfer, high-contention, capital-request, and business-distribution scenarios.
- [x] Clean migration tests and the historical data-preserving upgrade pass on disposable isolated PostgreSQL branches. Evidence: `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.
- [x] `git diff --check` passes.

## Operational configuration gates

- [ ] Production Clerk instance and allowed origins are configured.
- [ ] Internal database is managed and schema publication path is documented for the release.
- [ ] Durable queue/scheduler configuration is recorded.
- [ ] Rate-limit store and trusted proxy configuration are recorded.
- [ ] Structured log retention and audit-log shipping are configured.
- [ ] Readiness, authorization, database, automation, and reconciliation alerts are configured.
- [ ] No secrets appear in frontend bundles, logs, error responses, audit payloads, or AI context.

## Internal reliability sprint evidence

- [x] Durable safe-operation queue schema and lifecycle helpers exist with unique household job keys, transactional claims, retry/backoff fields, dead-letter state, and stale-worker recovery.
- [x] Automation failure counts are derived from persisted failed/dead-lettered jobs.
- [x] Micro-Live reconciliation failures persist a failed run, stop the session, create an incident, and append an audit event.
- [x] Missing, stale, or invalid Guardian heartbeats resolve to `STOP`; no heartbeat is treated as healthy.
- [x] Future restore verification is represented by a refusal-first scaffold only. Managed backup/restore remains deferred and is not certified.
- [ ] Database-backed queue lifecycle, restart recovery, and exact `$250` contribution browser evidence still require an approved authenticated run.

## Current evidence snapshot

As of 2026-09-02:

- [x] API and frontend typechecks pass.
- [x] API, frontend, and mockup builds pass with managed build environment variables.
- [x] OpenAPI/React Query/Zod generation passes.
- [x] 63 pure domain tests pass; 0 fail; 0 skip.
- [x] Liveness remains healthy during an unavailable-database process test.
- [x] Readiness returns `503` during the same database failure.
- [x] Production-like signed-out dashboard access returns `401` despite `X-Household-Role: owner`.
- [x] Real Micro-Live transmission remains disabled.
- [ ] Public production identity session is verified end-to-end; public release is out of scope.
- [x] Two-household isolation is verified over HTTP across all 108 discovered route/method pairs and applicable identifier/body probes in the isolated fixture.
- [x] Isolated PostgreSQL fixture passes duplicate contribution, parallel transfer, 100-request `$25` contention with balanced ledger totals, concurrent capital-request creation, concurrent business-distribution preparation, and actor-attributed audit assertions.
- [x] Certification evidence index, route matrix, role matrix, and UI persistence matrix are recorded.
- [x] Clean migration and existing-schema upgrade evidence are recorded for disposable isolated PostgreSQL branches.
- [x] Authenticated browser critical journey passes, including visible onboarding, saved-write reload, sign-out, repeat sign-in, and second-household isolation.
- [x] In-scope P0 blockers equal zero.
- [x] `pnpm run certify:internal-reliability` implementation checks pass; the command exits fail-closed until its explicit evidence gates are supplied.

The in-house release scope excludes public access and does not authorize banking, live trading, external investor capital, blockchain transactions, or autonomous execution.
