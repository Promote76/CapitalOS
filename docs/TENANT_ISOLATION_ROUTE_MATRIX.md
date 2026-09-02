# Capital OS tenant-isolation route matrix

**Inventory date:** 2026-09-02  
**Source:** `scripts/check-api-contract.mjs` and `artifacts/api-server/src/routes`  
**Inventory result:** 108 Express route/method pairs match the OpenAPI contract.

This is an evidence index, not a claim that every row has passed HTTP certification. `PASS` means the current database-backed fixture exercised that behavior. `OPEN` means the route is inventoried and source-reviewed but still needs an authenticated HTTP case before the release gate can be checked.

| Method / route family | Caller-controlled IDs | Household scope method | A→A test | A→B test | Role test | Status |
|---|---|---|---|---|---|---|
| GET /accounting | Query/body identifiers where applicable | Request-scoped actor reaches household service; source reviewed | OPEN | OPEN | OPEN | OPEN |
| GET /auth/me; POST /auth/onboard | No caller authority IDs; identity is session-owned | Clerk/test identity resolves user and active membership | OPEN | OPEN | OPEN | OPEN |
| GET /blockchain/status | None; public capability status | No household data | N/A | N/A | N/A | REVIEWED |
| GET/POST /business; /business/companies; PATCH /business/companies/:businessId; POST /business/revenue; /business/expenses; /business/distributions; PATCH /business/reserves/:businessId | businessId, business/parent IDs in bodies | Household predicates and server-owned business relationships | OPEN | OPEN | OPEN | OPEN |
| GET /accounts; /goals; /contributions; POST /contributions; POST /transfers; POST /allocations/impact; PUT /allocations; GET /portfolio | goalId, sourceAccountId, destinationAccountId, allocation IDs | Household-scoped service lookups and atomic writes | PASS for goals/accounts/contribution/transfer | PASS for foreign goal contribution denial | PASS for viewer contribution denial | PARTIAL |
| GET /dashboard | Query identifiers where applicable | Request-scoped dashboard aggregation | OPEN | OPEN | OPEN | OPEN |
| GET/POST /budget; /cash-flow; /financial-accounts; /bills; /upcoming-expenses; /income; related PATCH/DELETE routes; GET /safe-to-deploy; /finance-insights; /finance-snapshots; /banking/status | accountId, billId, expenseId, incomeId, category and parent IDs | Household predicates on finance records | OPEN | OPEN | OPEN | OPEN |
| GET /risk; POST /risk/emergency-stop; GET /recommendations; POST /recommendations/:recommendationId/decision; GET /audit | recommendationId, decision IDs | Household-scoped governance and audit services | OPEN | OPEN | OPEN | OPEN |
| GET /health/live; GET /healthz; GET /health/ready | None; public health | Explicitly public; readiness checks PostgreSQL | N/A | N/A | N/A | PASS |
| GET /household; PATCH /household/privacy | No caller-owned household authority | Request context selects membership; privacy write uses current household | OPEN | OPEN | OPEN | OPEN |
| GET /intelligence; POST /intelligence/refresh; /scenario; /feedback | Affected goal and feedback IDs | Advisory records scoped by request household | OPEN | OPEN | OPEN | OPEN |
| GET /micro-live; POST /micro-live/rehearsal; /enablement-review; /venues/:venueId/approve; /venues/:venueId/reviews/:kind; /arm; /reconciliation-runs; incident reviews; reactivation completion | venueId, incidentId, requirementId, session/order IDs | Household-scoped Micro-Live services; disabled execution boundary | OPEN | OPEN | OPEN | OPEN |
| GET/POST /operations; /operations/tasks; PATCH tasks; approvals; alerts; automations; notification preferences | taskId, approvalId, alertId, automationId | Household-scoped operations services | OPEN | OPEN | OPEN | OPEN |
| GET/POST /properties; PATCH /properties/buy-box; POST candidates; candidate analysis; GET strategies; strategy promotion/allocation | candidateId, strategyId, property goal/document IDs | Server-owned property and strategy relationships with household predicates | OPEN | OPEN | OPEN | OPEN |
| GET /reports | Query/report identifiers where applicable | Request-scoped reporting service | OPEN | OPEN | OPEN | OPEN |
| GET /strategy-lab; POST strategies; strategy versions; experiments; graduation; journal | strategyId and parent evidence IDs | Strategy Lab service scopes records and keeps capital inaccessible | OPEN | OPEN | OPEN | OPEN |
| GET /treasury; POST /treasury/requests; POST /treasury/requests/:requestId/decision | requestId, bucket and account IDs | Treasury service resolves current household and persisted lock state | OPEN | OPEN | OPEN | OPEN |

## Current executable evidence

- The two-household fixture proves a foreign goal ID is rejected before a contribution is created.
- The same fixture provisions Owner, Partner, Advisor, and Viewer memberships in both households and exercises the role-header regression, partner contribution allow, advisor/viewer contribution denial, and contribution mass-assignment assertions when enabled.
- The same fixture proves recent-auth denial, parallel transfer overdraft prevention, 100-request contention expectations, transfer replay, persisted household/actor attribution, and ledger debit/credit reconciliation when enabled.
- The matrix is intentionally not marked complete: route-family inventory is not a substitute for one HTTP test per high-value identifier path.
