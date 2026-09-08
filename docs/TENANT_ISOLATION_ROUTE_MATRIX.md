# Capital OS tenant-isolation route matrix

**Inventory date:** 2026-09-07
**Source:** `artifacts/api-server/src/integration/tenant-route-inventory.mjs` (authoritative), `artifacts/api-server/src/routes`, and `artifacts/api-server/src/integration/p0-http.test.ts`
<!-- tenant-route-inventory: 188 -->
**Inventory result:** 188 Express route/method pairs match the executable route inventory.

The machine-readable count above is checked by the route parity release check; adding
an endpoint without refreshing this evidence fails certification with a stale-count
error.

This is an evidence index, not a source-review substitute. `PASS` means the isolated
database-backed fixture exercised the applicable route and identifier/body boundary.
The full 188-route preflight target is defined below. The latest clean guarded
replay passed on 2026-09-07: 393 executed probes, 58 scoped collection reads,
58 cross-household rejections, and 58 malformed rejections (12 tests passed,
0 failed/skipped). This supersedes the historical 163-route replay and the
focused seven-route Family Office replay. Public health and auth routes are
explicitly handled as public/identity boundaries rather than household-scoped
object routes.

| Method / route family | Caller-controlled IDs | Household scope method | A→A test | A→B test | Role test | Status |
|---|---|---|---|---|---|---|
| GET /accounting | Query/body identifiers where applicable | Request-scoped actor reaches household service | PASS | PASS | PASS | PASS |
| GET /auth/me; POST /auth/onboard | No caller authority IDs; identity is session-owned | Clerk identity only; test household headers do not authenticate auth routes | N/A | N/A | 401 probe PASS | REVIEWED |
| GET /blockchain/status | None; public capability status | No household data | N/A | N/A | N/A | REVIEWED |
| GET/POST /business; /business/companies; PATCH /business/companies/:businessId; POST /business/revenue; /business/expenses; /business/distributions; PATCH /business/reserves/:businessId | businessId, business/parent IDs in bodies | Household predicates and server-owned business relationships | PASS | PASS | PASS | PASS |
| GET /accounts; /goals; /contributions; POST /contributions; POST /transfers; POST /allocations/impact; PUT /allocations; GET /portfolio | goalId, sourceAccountId, destinationAccountId, allocation IDs | Household-scoped service lookups and atomic writes | PASS | PASS | PASS | PASS |
| GET /dashboard | Query identifiers where applicable | Request-scoped dashboard aggregation | PASS | PASS | PASS | PASS |
| GET/POST /budget; /cash-flow; /financial-accounts; /bills; /upcoming-expenses; /income; related PATCH/DELETE routes; GET /safe-to-deploy; /finance-insights; /finance-snapshots; /banking/status | accountId, billId, expenseId, incomeId, category and parent IDs | Household predicates on finance records | PASS | PASS | PASS | PASS |
| GET/POST /budget-planning-periods; weekly guidance/read acceptance; category create/update/archive/reorder; approve/close; history/comparison/contribution detail | periodId, categoryId, month, snapshot IDs | Actor household predicates, snapshot ownership checks, optimistic versions, idempotency, and recent-auth lifecycle gates | PASS | PASS | PASS | PASS |
| GET /risk; POST /risk/emergency-stop; GET /recommendations; POST /recommendations/:recommendationId/decision; GET /audit | recommendationId, decision IDs | Household-scoped governance and audit services | PASS | PASS | PASS | PASS |
| GET /health/live; GET /healthz; GET /health/ready | None; public health | Explicitly public; readiness checks PostgreSQL | N/A | N/A | N/A | PASS |
| GET /household; PATCH /household/privacy | No caller-owned household authority | Request context selects an active persisted membership | PASS | PASS | PASS | PASS |
| GET /intelligence; POST /intelligence/refresh; /scenario; /feedback | Affected goal and feedback IDs | Advisory records scoped by request household | PASS | PASS | PASS | PASS |
| GET /micro-live; POST /micro-live/rehearsal; /enablement-review; /venues/:venueId/approve; /venues/:venueId/reviews/:kind; /arm; /reconciliation-runs; incident reviews; reactivation completion | venueId, incidentId, requirementId, session/order IDs | Household-scoped Micro-Live services; disabled execution boundary | PASS | PASS | PASS | PASS |
| GET/POST /operations; /operations/tasks; /operations/daily-ops; PATCH tasks; daily-ops journal and guided-run actions; approvals; alerts; automations; notification preferences | taskId, approvalId, alertId, automationId, guided-run IDs | Household-scoped operations services; Daily Ops journal and guided-run history remain review-only | PASS | PASS | PASS | PASS |
| GET/POST /properties; PATCH /properties/buy-box; POST candidates; candidate analysis; GET strategies; strategy promotion/allocation | candidateId, strategyId, property goal/document IDs | Server-owned property and strategy relationships with household predicates | PASS | PASS | PASS | PASS |
| GET /reports | Query/report identifiers where applicable | Request-scoped reporting service | PASS | PASS | PASS | PASS |
| GET /strategy-lab; POST strategies; strategy versions; experiments; graduation; journal | strategyId and parent evidence IDs | Strategy Lab service scopes records and keeps capital inaccessible | PASS | PASS | PASS |
| GET /treasury; POST /treasury/requests; POST /treasury/requests/:requestId/decision | requestId, bucket and account IDs | Treasury service resolves current household and persisted lock state | PASS | PASS | PASS | PASS |
| GET /family-office; GET /family-office/real-estate; POST /family-office/refresh; POST /family-office/research; POST /family-office/proposals/:proposalId/decision; POST /family-office/shadow/portfolios; POST /family-office/shadow/intents; POST /family-office/tax-liens | proposalId, shadowPortfolioId, householdId mass-assignment field, research/provider/refresh body | Request-scoped household predicates; role and recent-auth middleware; provider fail-closed handling; bounded refresh ledger; Shadow-only persistence | PASS | PASS | PASS | PASS |

## Current executable evidence

- The two-household fixture proves a foreign goal ID is rejected before a contribution is created.
- The same fixture provisions Owner, Partner, Advisor, and Viewer memberships in both households and passes the role-header regression, partner contribution allow, advisor/viewer contribution denial, and contribution mass-assignment assertions on isolated Neon PostgreSQL.
- The same fixture passes recent-auth denial, parallel transfer overdraft prevention, 100-request contention, transfer replay, persisted household/actor attribution, and ledger debit/credit reconciliation on isolated Neon PostgreSQL.
- The route preflight discovers and asserts exactly 188 route/method pairs, compares household-scoped collection reads, sends same-household, foreign, and malformed path identifiers, injects mass-assignment fields into applicable generic write probes, and fails on unexpected server errors. The next clean guarded replay must include the new Business Income routes alongside the existing Daily Ops and Family Office routes.
- Parameterized routes require non-error same-household behavior, reject foreign identifiers without a successful write/read response, and reject malformed identifiers with a 4xx response. Parameterless writes must not return another household's identifiers after body tampering.
- The latest executed preflight on the disposable target on 2026-09-07 had zero failures: 393 total probes, 58 scoped collection-read comparisons, 58 cross-household rejections, and 58 malformed-identifier rejections. The same run passed the role, recent-auth, malformed-input, mass-assignment, Shadow-only, and no-execution assertions for the complete current surface.
