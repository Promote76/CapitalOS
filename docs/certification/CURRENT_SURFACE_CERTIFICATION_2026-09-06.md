# Capital OS current-surface certification

**Certification date:** 2026-09-06  
**Certification source HEAD:** `cb10e32673536da9b5c488fdfad1bc05b5771ab3`  
**Working-tree note:** the evidence, documentation, fixture, and reconciliation changes
described here are uncommitted working-tree changes relative to that source HEAD.

## Current inventory and classification

**CURRENT_ROUTE_COUNT:** 163  
**PREVIOUS_EXECUTED_ROUTE_COUNT:** 149  
**NEW / PREVIOUSLY UNCERTIFIED ROUTES:** 14  
**ROUTES INVENTORIED / CERTIFIED / UNCERTIFIED:** 163 / 163 / 0

The authoritative exhaustive route/method inventory is source-derived by
`artifacts/api-server/src/integration/tenant-route-inventory.mjs`; its complete,
route-by-route classification (method, caller-controlled IDs, household scoping,
role boundary, read/write classification, and status) is maintained in
`docs/TENANT_ISOLATION_ROUTE_MATRIX.md`. This report incorporates every one of
those 163 source routes, not a manually maintained subset. Public health,
capability-status, and identity endpoints are classified as public/identity
boundaries; every other route is actor-scoped and household-scoped where it
accesses household data. Reads are non-mutating; POST/PUT/PATCH/DELETE routes are
writes subject to the documented role and ownership predicates.

The 14 delta pairs replayed on the current surface were:

| Method | Path | Domain | Auth / scope / role | Read or write | Financial impact | Coverage |
|---|---|---|---|---|---|---|
| GET | `/budget-planning-periods/:month` | Budget planning | authenticated, actor household | Read | advisory | PASS |
| GET | `/budget-planning-periods/:periodId/weekly-guidance` | Budget planning | authenticated, actor household | Read | advisory | PASS |
| POST | `/budget-planning-periods/:periodId/weekly-guidance/accept` | Budget planning | owner, actor household | Write | draft only | PASS |
| PUT | `/budget-planning-periods/:periodId/weekly-guidance/allocations` | Budget planning | owner, actor household | Write | planning only | PASS |
| POST | `/budget-planning-periods/:periodId/categories` | Budget planning | owner, actor household | Write | planning only | PASS |
| PATCH | `/budget-planning-periods/:periodId/categories/:categoryId` | Budget planning | owner, actor household | Write | planning only | PASS |
| POST | `/budget-planning-periods/:periodId/approve` | Budget planning | owner, actor household | Write | approves plan, not cash | PASS |
| POST | `/budget-planning-periods/:month/copy-forward` | Budget planning | owner, actor household | Write | planning only | PASS |
| POST | `/budget-planning-periods/:periodId/reorder` | Budget planning | owner, actor household | Write | planning only | PASS |
| POST | `/budget-planning-periods/:periodId/close` | Budget planning | owner, actor household | Write | closes plan, not cash | PASS |
| GET | `/budget-planning-periods` | Budget planning | authenticated, actor household | Read | none | PASS |
| GET | `/budget-planning-periods/:periodId/change-history` | Budget planning | authenticated, actor household | Read | none | PASS |
| GET | `/budget-planning-comparison/:month` | Budget planning | authenticated, actor household | Read | advisory | PASS |
| GET | `/budget-planning-periods/:periodId/categories/:categoryId/contributions` | Budget planning | authenticated, actor household | Read | explanatory only | PASS |

`getBudget` was also corrected so fresh/evolved households show the complete
official category taxonomy and all pre-approval targets at `$0`, rather than an
empty list. This is additive and fail-closed; it does not make planning values
authoritative cash or deployable capital.

## Current-surface tenant, role, actor, and budget result

`docs/certification/household-privacy-runs/household-privacy-2026-09-06T22-50-17Z.log`
is the current isolated replay: **163 routes, 379 executed probes, 56 scoped
collection reads, 57 cross-household rejections, 57 malformed rejections, 11
tests passed, 0 failed/skipped.**

**CURRENT-SURFACE TENANT / IDOR:** PASS (P0-01)  
**CURRENT-SURFACE ROLE MATRIX:** PASS (P0-06)  
**ACTOR ATTRIBUTION:** PASS (P0-08)  
**BUDGET ROUTES:** PASS

The Budget adversarial replay covered Owner A, Advisor A, Viewer A, and Owner B
against valid/foreign/malformed/nonexistent identifiers, supplied household and
actor IDs, role/permission tampering, protected fields, collection isolation, and
persisted mutation/audit checks. No cross-household success, actor spoofing, role
escalation, protected-field override, partial foreign mutation, or adversarial
identifier server error was accepted. Three earlier safe failed fixture attempts
only exposed stale setup. They are not production failures; the final run created
a legitimate approved plan without weakening controls.

The canonical server/database `$250` fixture is PASS: `$200` Duplex Reserve,
`$25` Capital OS, `$25` Opportunity Reserve; one contribution for the idempotency
key, three ledger movements, balanced ledger, and `409` for mismatched replay.
**DUPLEX $200 PROTECTION: PASS.** Financial integrity on fresh disposable
PostgreSQL is PASS: TI 15/15, TR 12/12, AC 14/14, SD 20/20.

## Browser, provider, and deployment evidence

An authenticated Owner browser session succeeded. **$250 CONTRIBUTION BROWSER:
BLOCKED.** There is no browser-visible control or evidence for the active
80/10/10 Duplex/Capital OS/Opportunity sleeve rule. The dialog accepts only an
amount and says the active household rule applies server-side. Budget was visible,
the allocation template contained expense categories only, and Safe-to-Deploy was
visibly `$0`. No contribution was submitted and no real money moved.

**SAFE-TO-DEPLOY BROWSER: BLOCKED.** It cannot be compared after the blocked
browser contribution. This does not downgrade the server/database Duplex
protection PASS.

**CLERK STEP-UP: BLOCKED.** The current command without a published origin reports
BA 0/20 and RV 0/12. Retained redacted historical production evidence supports
RV-01 and RV-02 only (2/12); the broader BA and RV matrices remain blocked.

**DURABLE WORKER RESTART: PASS** — OR-01..OR-24 / 29 tests:
`docs/certification/operations-recovery-runs/operations-recovery-2026-09-06T22-53-10Z.log`.  
**ALERT SINK: PASS** — OB-01..OB-25 / 26 assertions and a real attached Slack
receipt: `docs/certification/observability-runs/observability-2026-09-06T22-53-53Z.log`.  
**EXECUTION CONTROL: PASS** — EC-01..EC-17:
`docs/certification/execution-control-runs/execution-control-2026-09-06T22-55Z.log`.
Execution remains disabled.

**RATE-LIMIT TOPOLOGY: DOCUMENTED-CONSTRAINT.** PostgreSQL shared
`rate_limit_buckets` exists, but horizontal deployment/trusted-proxy topology has
not been independently certified. Controlled internal use is constrained to a
single instance; no horizontal-rate-limit claim is made.

## Regression and release decision

PASS: workspace typecheck; API typecheck/build; Capital OS build when `PORT` and
`BASE_PATH` are supplied; API tests (108 pass, 31 database-gated skips, zero
failures); contract check (163); generated finance artifacts; and the
production-candidate command. Its published origin and dedicated external
certification-DB probes were BLOCKED. Internal-reliability checks PASS but exit 2
by design for open evidence; Micro-Live internal core PASS but certification is
BLOCKED/DISABLED; browser auth is BLOCKED; raw migrations are BLOCKED without a
dedicated URL, although disposable migrations ran within the current fixtures.

**REAL MONEY MOVED:** $0; **REAL ORDERS SENT:** 0.  
**REAL BANKING / ACH / SCHWAB TRADING / MICRO-LIVE EXECUTION / LIVE TRADING / AI
EXECUTION / BLOCKCHAIN TRANSACTIONS:** DISABLED.

**INTERNAL CONTROLLED USE:** READY only for current internal,
family-capital-only, advisory, non-executing scope.  
**PUBLIC PRODUCTION:** NOT CERTIFIED.  
**CERTIFICATION DRIFT:** RESOLVED for route inventory and current-surface tenant
evidence. P1 browser/provider/deployment evidence remains open.

**NEXT HIGHEST-PRIORITY BLOCKER:** no browser-visible control/evidence for the
active 80/10/10 household sleeve allocation, preventing canonical authenticated
`$250` contribution and post-contribution Safe-to-Deploy comparison certification.