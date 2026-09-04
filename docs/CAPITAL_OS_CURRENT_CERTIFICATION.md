# Capital OS current certification

**Certification date:** 2026-09-04  
**Current HEAD:** `2752d566c9cbcffd0845450f648c329f2f5b48c3`  
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

## Evidence summary

| Evidence | Result | Runtime reference |
|---|---|---|
| Generated finance artifacts | PASS | `pnpm run check:generated-finance-artifacts` |
| Generated-artifact failure/recovery regression | PASS | `pnpm run test:generated-finance-artifacts` |
| Workspace/API typechecks | PASS | `pnpm run typecheck`, API typecheck |
| OpenAPI route/method parity | PASS | `scripts/check-api-contract.mjs`; 129 route/method combinations |
| PostgreSQL-backed API suite | PASS | 96 passed, 0 failed, 0 skipped with `CAPITAL_OS_RUN_INTEGRATION=1` |
| Historical P0 evidence | PASS for the documented internal scope | `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md` |
| Current production-candidate command | FAIL-CLOSED | P0 mapping is green, but published-origin and dedicated certification DB configuration are unavailable in this environment |
| Internal reliability command | FAIL-CLOSED | Implementation checks pass; authenticated browser contribution and provider reverification evidence remain open |
| Micro-Live command | BLOCKED | Internal safety core passes; provider, restart, credential, automation, and browser gates remain blocked |
| Future restore verifier | BLOCKED | Refusal-first scaffold; no provider-managed restore was executed |

## Current gate matrix

| Gate | Previous result | Current implementation | Runtime test/evidence | Current result | Evidence |
|---|---|---|---|---|---|
| Tenant / IDOR | PARTIAL PASS | Actor-scoped initialization is present across the reviewed modules; complete current 129-route adversarial coverage is not rerun here | Historical isolated fixture passed 108 route/method pairs; current certification command lacks its dedicated DB target | **PARTIAL** | `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`; `artifacts/api-server/src/integration/p0-http.test.ts` |
| Treasury | Not closed | Actor-scoped reads, advisor redaction, locked decisions, linked planning reservations, replay handling, and decision audit are present | PostgreSQL suite passed advisor redaction, owner approval, one reservation, audit attribution, exact replay, and conflicting replay rejection | **PARTIAL** | `artifacts/api-server/src/services/treasury.ts`; `artifacts/api-server/src/integration/p0-http.test.ts` |
| Manual finance | Not closed | Manual review lifecycle and downstream recalculation are implemented | PostgreSQL suite passed create → review → approve/reject → fresh read → budget/cash-flow/Safe-to-Deploy recalculation | **PASS** | `artifacts/api-server/src/integration/p0-http.test.ts`; current 96/96 run |
| Authenticated browser E2E | BLOCKED | Clerk onboarding, saved-write reload, sign-out, repeat sign-in, and second-household isolation are evidenced | Historical authenticated browser run passed the documented P0-05 journey; broader role and recent-auth journey is not complete | **BLOCKED** | `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md` |
| Clerk reverification | BLOCKED | Provider-supported reverification implementation exists | No current provider UI, successful retry, and post-reverification authorization evidence | **BLOCKED** | `docs/PRODUCTION_RELEASE_GATE.md`; internal reliability output |
| Migration upgrade | BLOCKED | Historical schema artifact and additive upgrade path are committed | Disposable branch upgrade preserved representative data, constraints, ownership, balances, and audit actor; current rerun is blocked because no disposable certification DB URL is configured | **PASS** | `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`; `scripts/certify-migrations.mjs` |
| Backup / restore | BLOCKED | Refusal-first verifier only | No approved managed backup, isolated restore, RPO/RTO observation, or restored invariant query | **BLOCKED** | `scripts/verify-future-restore.mjs`; `docs/CAPITAL_OS_INTERNAL_RELIABILITY.md` |
| Worker / scheduler | BLOCKED | Durable job schema and lifecycle helpers exist | No real worker lease, crash/restart, retry, dead-letter, or operator reprocessing run | **PARTIAL** | `artifacts/api-server/src/services/operations.ts`; `docs/CAPITAL_OS_INTERNAL_RELIABILITY.md` |
| Observability | PARTIAL | Metric names, thresholds, and reliability domain checks exist | No concrete telemetry exporter or named destination receiving a synthetic critical alert | **PARTIAL** | `artifacts/api-server/src/domain/reliability.ts`; `docs/CAPITAL_OS_INTERNAL_RELIABILITY.md` |
| Accounting | PARTIAL | Exact-cents and cross-view separation controls exist | Hardcoded/incomplete liabilities, real estate, investment, withdrawal, fee, tax, and return-on-capital values remain | **PARTIAL** | `artifacts/api-server/src/services/accounting.ts` |
| Safe-to-Deploy | PARTIAL | Conservative calculation and manual-review exclusions exist | Domain and finance tests pass, but the complete cross-domain exclusion invariant suite is not certified | **PARTIAL** | `artifacts/api-server/src/services/household-finance.ts`; `artifacts/api-server/src/domain/household-finance.test.ts` |
| Server Emergency Stop | BLOCKED | Emergency Stop remains local React state/toast behavior | No authoritative server state or restart-persistence test | **FAIL** | `artifacts/capital-os/src/App.tsx`; current readiness audit |
| Guardian | PASS | Missing/stale health defaults to STOP and disagreement locks the boundary | Domain and Micro-Live certification tests pass | **PASS** | `artifacts/api-server/src/domain/execution-*.test.ts`; `scripts/certify-micro-live.mjs` |
| OMS | PASS | Durable order-intent/event relationships and fail-closed state transitions exist | Domain and Micro-Live certification tests pass; no real venue order was sent | **PASS** | `artifacts/api-server/src/domain/execution-oms.test.ts`; `scripts/certify-micro-live.mjs` |
| Reconciliation | PASS | Rehearsal reconciliation persists failures and stops exposure | Domain and Micro-Live certification tests pass; production worker restart evidence remains separate | **PASS** | `artifacts/api-server/src/domain/execution-*.test.ts`; `scripts/certify-micro-live.mjs` |
| Micro-Live foundation | Not ready | Internal safety core is present and execution is disabled | Overall certification remains blocked by credential, venue, restart, automation, browser, and real-money labeling gates | **FAIL** | `scripts/certify-micro-live.mjs` |
| Schwab read-only | Not enabled | No approved Schwab provider or credential boundary is registered | No read-only provider security, tenant, audit, or credential certification exists | **BLOCKED** | `artifacts/api-server/src/adapters/banking.ts`; readiness audit |

## Release status counts

There are **17 critical gates** in the matrix:

- **PASS:** 5
- **PARTIAL:** 6
- **BLOCKED:** 4
- **FAIL:** 2

Any PARTIAL, BLOCKED, or FAIL critical gate keeps the production candidate
unreleased.

## Security and financial-integrity status

- Tenant boundaries are actor-scoped in the reviewed services, but the complete
  current identifier matrix is not certified.
- Treasury approvals remain planning reservations only. They do not debit executable
  capital or move money.
- Protected reserves, business cash, planning balances, projected income, and
  unrealized results remain outside executable household capital.
- AI and automation cannot move money, unlock reserves, enable Micro-Live, or submit
  external actions.
- Banking remains consent-gated, read-only, credential-reference based, and
  provider-disabled.
- Exact-cent domain logic and PostgreSQL `numeric(18,2)` storage remain in force.

## Operational status

The API has liveness/readiness separation, structured logs, correlation IDs, and
fail-closed database-backed safety checks. The following are not certified:

- Managed backup and restore
- Durable worker/scheduler execution and restart recovery
- Named alert delivery
- Full telemetry export and queue-lag visibility
- Provider-backed banking delivery
- Server-persistent Emergency Stop

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
non-executing family-capital scope. The highest-priority unresolved blocker is:

> Establish authoritative server-side Emergency Stop and complete the
> infrastructure-backed recovery evidence (managed restore, worker restart
> recovery, and named critical-alert delivery) before any broader release decision.
