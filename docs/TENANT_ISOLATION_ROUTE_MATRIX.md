# Capital OS tenant-isolation route matrix

**Inventory date:** 2026-09-02  
**Source:** `scripts/check-api-contract.mjs`, `artifacts/api-server/src/routes`, and `artifacts/api-server/src/integration/p0-http.test.ts`
**Inventory result:** 108 Express route/method pairs match the OpenAPI contract.

This is an evidence index, not a source-review substitute. `PASS` means an isolated database-backed fixture exercised valid same-household and foreign-object behavior. `PREFLIGHT` means route discovery or a generic negative probe exists but is not sufficient certification. The latest workspace run on 2026-09-02 passed 66 default API tests and skipped all three opt-in PostgreSQL fixtures because `CAPITAL_OS_CERTIFICATION_DB_URL` was not configured.

| Method / route family | Caller-controlled IDs | Household scope method | A→A test | A→B test | Role test | Status |
|---|---|---|---|---|---|---|
| GET /accounting | Query/body identifiers where applicable | Request-scoped actor reaches household service | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /auth/me; POST /auth/onboard | No caller authority IDs; identity is session-owned | Clerk identity only; test household headers do not authenticate auth routes | N/A | N/A | 401 probe PREFLIGHT | OPEN |
| GET /blockchain/status | None; public capability status | No household data | N/A | N/A | N/A | REVIEWED |
| GET/POST /business; /business/companies; PATCH /business/companies/:businessId; POST /business/revenue; /business/expenses; /business/distributions; PATCH /business/reserves/:businessId | businessId, business/parent IDs in bodies | Household predicates and server-owned business relationships | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /accounts; /goals; /contributions; POST /contributions; POST /transfers; POST /allocations/impact; PUT /allocations; GET /portfolio | goalId, sourceAccountId, destinationAccountId, allocation IDs | Household-scoped service lookups and atomic writes | PASS for prior targeted cases; broader PREFLIGHT | PASS for prior foreign goal denial; broader PREFLIGHT | PASS for prior viewer denial; broader PREFLIGHT | PARTIAL |
| GET /dashboard | Query identifiers where applicable | Request-scoped dashboard aggregation | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET/POST /budget; /cash-flow; /financial-accounts; /bills; /upcoming-expenses; /income; related PATCH/DELETE routes; GET /safe-to-deploy; /finance-insights; /finance-snapshots; /banking/status | accountId, billId, expenseId, incomeId, category and parent IDs | Household predicates on finance records | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /risk; POST /risk/emergency-stop; GET /recommendations; POST /recommendations/:recommendationId/decision; GET /audit | recommendationId, decision IDs | Household-scoped governance and audit services | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /health/live; GET /healthz; GET /health/ready | None; public health | Explicitly public; readiness checks PostgreSQL | N/A | N/A | N/A | PASS |
| GET /household; PATCH /household/privacy | No caller-owned household authority | Request context selects an active persisted membership | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /intelligence; POST /intelligence/refresh; /scenario; /feedback | Affected goal and feedback IDs | Advisory records scoped by request household | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /micro-live; POST /micro-live/rehearsal; /enablement-review; /venues/:venueId/approve; /venues/:venueId/reviews/:kind; /arm; /reconciliation-runs; incident reviews; reactivation completion | venueId, incidentId, requirementId, session/order IDs | Household-scoped Micro-Live services; disabled execution boundary | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET/POST /operations; /operations/tasks; PATCH tasks; approvals; alerts; automations; notification preferences | taskId, approvalId, alertId, automationId | Household-scoped operations services | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET/POST /properties; PATCH /properties/buy-box; POST candidates; candidate analysis; GET strategies; strategy promotion/allocation | candidateId, strategyId, property goal/document IDs | Server-owned property and strategy relationships with household predicates | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /reports | Query/report identifiers where applicable | Request-scoped reporting service | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /strategy-lab; POST strategies; strategy versions; experiments; graduation; journal | strategyId and parent evidence IDs | Strategy Lab service scopes records and keeps capital inaccessible | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |
| GET /treasury; POST /treasury/requests; POST /treasury/requests/:requestId/decision | requestId, bucket and account IDs | Treasury service resolves current household and persisted lock state | PREFLIGHT | PREFLIGHT | PREFLIGHT | OPEN |

## Current executable evidence

- The two-household fixture proves a foreign goal ID is rejected before a contribution is created.
- The same fixture provisions Owner, Partner, Advisor, and Viewer memberships in both households and passes the role-header regression, partner contribution allow, advisor/viewer contribution denial, and contribution mass-assignment assertions on isolated Neon PostgreSQL.
- The same fixture passes recent-auth denial, parallel transfer overdraft prevention, 100-request contention, transfer replay, persisted household/actor attribution, and ledger debit/credit reconciliation on isolated Neon PostgreSQL.
- The route preflight discovers and asserts exactly 108 route/method pairs, compares household-scoped collection reads, sends foreign and malformed path identifiers, injects mass-assignment fields into generic write probes, and fails on unexpected server errors.
- Generic invalid bodies, random fallback IDs, and route-count parity are not IDOR certification. P0-01 remains open until every caller-controlled identifier has a valid owned-object success case, a real foreign-object denial case, and a no-mutation assertion on isolated PostgreSQL.
- The preflight has not executed in the latest workspace run because no dedicated certification database URL was configured. The runner refuses the configured shared target and requires an approved disposable-target sentinel before any reset.
