# Capital OS current certification

**Certification date:** 2026-09-05
**Current HEAD:** `68e0c29`
**Previous certification:** **NOT READY** (`docs/PRODUCTION_CANDIDATE_CERTIFICATION_2026-09-02.md`)  
**Current decision:** **NOT READY — CONTROLLED INTERNAL EVALUATION ONLY**

This is the single current certification document. Earlier reports remain historical
evidence and are not rewritten. The stricter result governs whenever a source claim,
test result, or infrastructure-dependent evidence conflicts.

## Scope and non-goals

Capital OS remains an internal, family-capital-only, advisory and non-executing
planning system.

The following remain disabled:

- Real bank-provider enablement
- Money movement and ACH
- Brokerage or live-trading orders
- External investor capital
- Autonomous AI execution
- Micro-Live execution

No real order was sent, no live venue was enabled, and no production credential was
introduced during this certification.

## Changes since the previous certification

- Authenticated Capital, Business, Property, Treasury, Strategy Lab, Operations,
  Financing, Micro-Live, and Intelligence paths use actor-scoped tenant
  initialization rather than the shared demo household.
- Manual household finance now has PostgreSQL-backed create, review, approval,
  rejection, fresh-read, budget, cash-flow, and Safe-to-Deploy coverage.
- Treasury reads and decisions have an actor boundary, advisor protected-balance
  redaction, request-linked planning reservations, transaction locking, replay
  conflict handling, and decision audit events.
- Read-only banking lifecycle behavior is implemented with fixture-provider
  recovery coverage; no real provider is registered.
- Generated finance artifact freshness now checks OpenAPI clients, Zod validators,
  database declarations, migration SQL, and migration metadata.
- The production-candidate check fails closed when generated finance artifacts are
  stale.
- Hermetic regression coverage verifies the generated-artifact checker restores
  committed files after both successful and intentionally failing regeneration.
- Schema-drift detection has been hardened for generator upgrades.
- A household-scoped server execution-control plane now persists a fail-closed
  state machine, records successful and denied transition attempts, reconciles
  the legacy emergency-stop path, and blocks OMS order-intent creation unless
  the control state, Guardian, and risk governor all permit execution.
- The execution-control plane passed EC-01 through EC-17 against a dedicated
  disposable PostgreSQL target, including a fresh API process restart probe.
- Risk and Micro-Live pages now read the authoritative server state; the browser
  Emergency Stop sends a confirmed, idempotent server command rather than
  changing local React state only.
- Durable operations now persist leases, attempts, workers, schedules, leadership,
  retries, dead letters, audit lifecycle events, runtime queue/scheduler metrics,
  and safe response projections; the Operations page exposes queue state and
  authorized reprocessing without exposing raw payloads.
- Authenticated OpenMetrics telemetry now exports low-cardinality API, database,
  financial-integrity, operations, execution-safety, provider-neutral, and
  read-only banking health without private identifiers or raw financial values.
- Deterministic critical alerts now persist incidents, deduplicate occurrences,
  retry through the durable queue, dead-letter after bounded attempts, support
  authorized replay and recovery notices, and deliver to a named Slack destination.
- Financial-integrity closure now has an isolated disposable PostgreSQL
  certification covering the current route inventory, tenant/IDOR, Treasury,
  Accounting, Safe-to-Deploy, and combined adversarial scenarios.
- Accounting no longer presents unavailable property, withdrawal, realized-gain,
  fee, tax, or return-on-capital values as authoritative zeroes.

## Evidence summary

| Evidence                                       | Result                                                                                                                                                  | Runtime reference                                                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated finance artifacts                    | PASS                                                                                                                                                    | `pnpm run check:generated-finance-artifacts`                                                                                                                                  |
| Generated-artifact failure/recovery regression | PASS                                                                                                                                                    | `pnpm run test:generated-finance-artifacts`                                                                                                                                   |
| Workspace/API typechecks                       | PASS                                                                                                                                                    | `pnpm run typecheck`, API typecheck                                                                                                                                           |
| OpenAPI route/method parity                    | PASS                                                                                                                                                    | `scripts/check-api-contract.mjs`; 149 route/method combinations                                                                                                               |
| PostgreSQL-backed API suite                    | PASS                                                                                                                                                    | 123 passed, 0 failed, 0 skipped with `CAPITAL_OS_RUN_INTEGRATION=1`                                                                                                           |
| Execution-control focused fixture              | PASS against the dedicated isolated certification target; 3 passed, 0 failed, 0 skipped                                                                 | `docs/certification/EXECUTION_CONTROL_CERTIFICATION_2026-09-04.md`; `artifacts/api-server/src/integration/execution-control.test.ts`                                          |
| Execution-control certification command        | PASS — EC-01 through EC-17 collected                                                                                                                    | `pnpm run certify:execution-control`; `docs/certification/EXECUTION_CONTROL_CERTIFICATION_2026-09-04.md`                                                                      |
| Historical P0 evidence                         | PASS for the documented internal scope                                                                                                                  | `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`                                                                                                                       |
| Current production-candidate command           | FAIL-CLOSED                                                                                                                                             | P0 mapping is green, but published-origin and broader production-candidate evidence remain unavailable; execution-control was certified separately against a dedicated target |
| Internal reliability command                   | FAIL-CLOSED                                                                                                                                             | Implementation checks pass; authenticated browser contribution and provider reverification evidence remain open                                                               |
| Micro-Live command                             | BLOCKED                                                                                                                                                 | Internal safety core passes; provider, restart, credential, automation, and browser gates remain blocked                                                                      |
| Durable operations recovery certification      | PASS — 29 tests passed, 0 failed, 0 skipped; OR-01 through OR-24 all passed against a fresh disposable PostgreSQL target                                | `docs/certification/OPERATIONS_RECOVERY_CERTIFICATION_2026-09-04.md`; `pnpm run certify:operations-recovery`                                                                  |
| Observability certification                    | PASS — 26 assertions passed, 0 failed, 0 skipped; OB-01 through OB-25 all passed against a fresh disposable PostgreSQL target with a real Slack receipt | `docs/certification/OBSERVABILITY_CERTIFICATION_2026-09-04.md`; `pnpm run certify:observability`                                                                              |
| Financial-integrity certification              | PASS — TI 15/15, TR 12/12, AC 14/14, SD 20/20 on a fresh disposable PostgreSQL target | `docs/certification/FINANCIAL_INTEGRITY_CERTIFICATION_2026-09-05.md`; `pnpm run certify:financial-integrity`                                                                  |

## Current gate matrix

| Gate                      | Previous result | Current implementation                                                                                                                                                                                                                                                                 | Runtime test/evidence                                                                                                                                                                                                      | Current result | Evidence                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant / IDOR             | PARTIAL PASS    | Actor-scoped initialization and current route coverage are implemented                                                                                                                                                                                                               | Isolated disposable PostgreSQL certification passed the discovered 149-route inventory, household isolation, foreign/malformed identifiers, role boundaries, tampering, and audit probes | **PASS**       | `docs/certification/FINANCIAL_INTEGRITY_CERTIFICATION_2026-09-05.md`; `artifacts/api-server/src/integration/p0-http.test.ts`; `scripts/certify-financial-integrity.mjs` |
| Treasury                  | Not closed      | Actor-scoped reads, advisor redaction, locked decisions, linked planning reservations, replay handling, concurrency protection, and decision audit are implemented                                                                                                                   | Isolated disposable PostgreSQL certification passed actor boundary, redaction, owner approval, reservation, concurrency, double-reservation protection, replay, conflict, cross-household isolation, and audit cases | **PASS** | `docs/certification/FINANCIAL_INTEGRITY_CERTIFICATION_2026-09-05.md`; `artifacts/api-server/src/services/treasury.ts`; `scripts/certify-financial-integrity.mjs` |
| Manual finance            | Not closed      | Manual review lifecycle and downstream recalculation are implemented                                                                                                                                                                                                                   | PostgreSQL suite passed create → review → approve/reject → fresh read → budget/cash-flow/Safe-to-Deploy recalculation                                                                                                      | **PASS**       | `artifacts/api-server/src/integration/p0-http.test.ts`; current 99/99 run                                                                                                                                                                                                                                         |
| Authenticated browser E2E | BLOCKED         | Clerk onboarding, saved-write reload, sign-out, repeat sign-in, and second-household isolation are evidenced                                                                                                                                                                           | Historical authenticated browser run passed the documented P0-05 journey; broader role and recent-auth journey is not complete                                                                                             | **BLOCKED**    | `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`                                                                                                                                                                                                                                                           |
| Clerk reverification      | BLOCKED         | Provider-supported reverification implementation exists                                                                                                                                                                                                                                | No current provider UI, successful retry, and post-reverification authorization evidence                                                                                                                                   | **BLOCKED**    | `docs/PRODUCTION_RELEASE_GATE.md`; internal reliability output                                                                                                                                                                                                                                                    |
| Migration upgrade         | BLOCKED         | Historical schema artifact and additive upgrade path are committed                                                                                                                                                                                                                     | Disposable branch upgrade preserved representative data, constraints, ownership, balances, and audit actor; current rerun is blocked because no disposable certification DB URL is configured                              | **PASS**       | `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`; `scripts/certify-migrations.mjs`                                                                                                                                                                                                                         |
| Worker / scheduler        | BLOCKED         | Durable job schema, lease-owner fencing, retry/dead-letter lifecycle, scheduler leadership, opt-in runtime loops, lifecycle audit events, and runtime metrics exist                                                                                                                    | OR-01 through OR-24 all passed on a fresh disposable PostgreSQL target; child-process graceful shutdown, hard crash recovery, contention, scheduler recovery, audit attribution, and metrics evidence retained             | **PASS**       | `docs/certification/OPERATIONS_RECOVERY_CERTIFICATION_2026-09-04.md`; `artifacts/api-server/src/services/operations.ts`; `artifacts/api-server/src/services/operations-scheduler.ts`; `artifacts/api-server/src/integration/operations-recovery-certification.test.ts`; `scripts/certify-operations-recovery.mjs` |
| Observability             | PARTIAL         | Authenticated OpenMetrics export, safe low-cardinality API/database/financial/operations/execution/provider/banking metrics, deterministic persisted alert rules, durable retry/dead-letter/replay, recovery notices, actor attribution, and a named Slack destination are implemented | OB-01 through OB-25 passed on a fresh disposable PostgreSQL target; a controlled synthetic critical alert, replay, and recovery notice received real Slack provider receipts                                               | **PASS**       | `docs/certification/OBSERVABILITY_CERTIFICATION_2026-09-04.md`; `artifacts/api-server/src/integration/observability-certification.test.ts`; `scripts/certify-observability.mjs`                                                                                                                                   |
| Accounting                | PARTIAL         | Exact-cent arithmetic, ledger balance checks, cross-view separation, and explicit unavailable-value handling are implemented                                                                                                                                                            | Isolated disposable PostgreSQL certification passed exact-cent, ledger, cross-view, source-boundary, unknown-value, and API regression checks | **PASS** | `docs/certification/FINANCIAL_INTEGRITY_CERTIFICATION_2026-09-05.md`; `artifacts/api-server/src/services/accounting.ts`; `scripts/certify-financial-integrity.mjs` |
| Safe-to-Deploy            | PARTIAL         | Conservative server-side calculation and manual-review exclusions exist                                                                                                                                                                                                               | Isolated disposable PostgreSQL certification passed protected-reserve, business-cash, paper/unrealized P&L, property candidate, Treasury reservation, stale-data, unknown-funds, and concurrent-reservation checks | **PASS** | `docs/certification/FINANCIAL_INTEGRITY_CERTIFICATION_2026-09-05.md`; `artifacts/api-server/src/services/household-finance.ts`; `scripts/certify-financial-integrity.mjs` |
| Server Emergency Stop     | BLOCKED         | PostgreSQL-backed household control state, deterministic STOP transition, audit/idempotency records, legacy risk reconciliation, and OMS enforcement are implemented                                                                                                                   | Dedicated isolated target passed EC-01 through EC-17; STOP remained household-scoped and persisted through a fresh API process restart; audit attribution, replay, denied transition, and OMS pre-intent evidence retained | **PASS**       | `docs/certification/EXECUTION_CONTROL_CERTIFICATION_2026-09-04.md`; `artifacts/api-server/src/services/execution-control.ts`; `scripts/certify-execution-control.mjs`                                                                                                                                             |
| Guardian                  | PASS            | Missing/stale health defaults to STOP and disagreement locks the boundary                                                                                                                                                                                                              | Domain and Micro-Live certification tests pass                                                                                                                                                                             | **PASS**       | `artifacts/api-server/src/domain/execution-*.test.ts`; `scripts/certify-micro-live.mjs`                                                                                                                                                                                                                           |
| OMS                       | PASS            | Durable order-intent/event relationships and fail-closed state transitions exist                                                                                                                                                                                                       | Domain and Micro-Live certification tests pass; no real venue order was sent                                                                                                                                               | **PASS**       | `artifacts/api-server/src/domain/execution-oms.test.ts`; `scripts/certify-micro-live.mjs`                                                                                                                                                                                                                         |
| Reconciliation            | PASS            | Rehearsal reconciliation persists failures and stops exposure                                                                                                                                                                                                                          | Domain and Micro-Live certification tests pass; production worker restart evidence remains separate                                                                                                                        | **PASS**       | `artifacts/api-server/src/domain/execution-*.test.ts`; `scripts/certify-micro-live.mjs`                                                                                                                                                                                                                           |
| Micro-Live foundation     | Not ready       | Internal safety core is present and execution is disabled                                                                                                                                                                                                                              | Certification correctly reports the internal core as PASS but keeps Micro-Live BLOCKED because credential, venue, restart, automation, browser, and real-money labeling evidence is absent                                 | **BLOCKED**    | `scripts/certify-micro-live.mjs`                                                                                                                                                                                                                                                                                  |
| Schwab read-only          | Not enabled     | No approved Schwab provider or credential boundary is registered                                                                                                                                                                                                                       | No read-only provider security, tenant, audit, or credential certification exists                                                                                                                                          | **BLOCKED**    | `artifacts/api-server/src/adapters/banking.ts`; readiness audit                                                                                                                                                                                                                                                   |

## Release status counts

There are **16 critical gates** in the matrix:

- **PASS:** 12
- **PARTIAL:** 0
- **BLOCKED:** 4
- **FAIL:** 0

Any PARTIAL, BLOCKED, or FAIL critical gate keeps the production candidate
unreleased.

## Security and financial-integrity status

- Tenant boundaries are actor-scoped and the current 149-route identifier matrix
  passed isolated adversarial certification.
- Treasury approvals remain planning reservations only. They do not debit executable
  capital or move money.
- Accounting exposes unavailable values explicitly rather than presenting
  unsupported zeros as authoritative financial data.
- Safe-to-Deploy excludes protected reserves, business cash, planning balances,
  projected income, paper/unrealized results, property candidates, stale data,
  unknown funds, and duplicate concurrent reservations.
- Protected reserves, business cash, planning balances, projected income, and
  unrealized results remain outside executable household capital.
- AI and automation cannot move money, unlock reserves, enable Micro-Live, or submit
  external actions.
- Banking remains consent-gated, read-only, credential-reference based, and
  provider-disabled.
- Exact-cent domain logic and PostgreSQL `numeric(18,2)` storage remain in force.

## Operational status

The API has liveness/readiness separation, structured logs, correlation IDs, and
fail-closed database-backed safety checks. Provider-backed banking delivery
remains outside the current internal scope.

## Banking and execution status

**REAL BANK PROVIDER:** Not registered; fixture-provider lifecycle only  
**MONEY MOVEMENT:** DISABLED  
**MICRO-LIVE:** Foundation safety core present; certification BLOCKED  
**LIVE TRADING:** DISABLED  
**AI EXECUTION:** DISABLED  
**SCHWAB READ-ONLY:** BLOCKED  
**SCHWAB TRADING:** DISABLED  
**MICRO-LIVE EXECUTION:** DISABLED

## Final release decision

**PRODUCTION CANDIDATE: NOT READY**

Capital OS is approved only for controlled internal evaluation within the
non-executing family-capital scope. The unresolved blockers are listed in the
gate matrix above.
