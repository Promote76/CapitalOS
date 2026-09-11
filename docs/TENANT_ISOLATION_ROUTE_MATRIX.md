# Capital OS tenant-isolation route matrix

**Inventory date:** 2026-09-10
**Source:** `artifacts/api-server/src/integration/tenant-route-inventory.mjs` (authoritative), `artifacts/api-server/src/routes`, and `artifacts/api-server/src/integration/p0-http.test.ts`
<!-- tenant-route-inventory: 251 -->
**Inventory result:** 251 Express route/method pairs match the executable route inventory.

The machine-readable count above is checked by the route parity release check; adding
an endpoint without refreshing this evidence fails certification with a stale-count
error.

This is an evidence index, not a source-review substitute. `PASS` means the isolated
database-backed fixture exercised the applicable route and identifier/body boundary.
The full 251-route preflight target is the authoritative inventory. RC1 acceptance
uses the exact-source certification recorded in
`docs/certification/RC1_READINESS_CERTIFICATION.json`; historical 170-route and
246-route runs are retained only as historical evidence and do not certify the
current surface. Public health and auth routes are explicitly handled as
public/identity boundaries rather than household-scoped object routes.

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
| GET /family-office; GET /family-office/real-estate; POST /family-office/refresh; POST /family-office/research; POST /family-office/research/digestion/preview; POST /family-office/proposals/:proposalId/decision; POST /family-office/shadow/portfolios; POST /family-office/shadow/intents; POST /family-office/tax-liens | proposalId, shadowPortfolioId, householdId mass-assignment field, research/provider/refresh body | Request-scoped household predicates; role and recent-auth middleware; provider fail-closed handling; bounded refresh ledger; Shadow-only persistence | PASS | PASS | PASS | PASS |
| Existing Schwab portfolio routes plus GET /integrations/schwab/market-data and /market-data/status; POST /market-data/connect, /refresh, /disconnect; shared GET /integrations/schwab/oauth/callback | OAuth callback state only; market-data accepts a bounded symbol list; no household or actor query/body fields | Authenticated actor household; both apps share the registered callback URL but use separate credentials, state, browser cookies, lifecycle generations, encrypted tokens, and disconnect boundaries | PASS | PASS | PASS | PASS |
| GET /research/schwab/instruments; /quotes/:symbol; /price-history | One normalized symbol; fixed fundamental projection; bounded daily date range; no household, connection, account, or provider-path input | Active authenticated actor household resolves its own encrypted Market Data connection; foreign household fixture receives `MARKET_DATA_DISCONNECTED` without a provider call | PASS | PASS | PASS | PASS |
| GET /research/schwab/certification; POST /research/schwab/certification | No caller-controlled household, connection, account, provider-path, trading, transfer, or execution fields | Authenticated actor household resolves its own encrypted Market Data connection; the POST runs exactly three fixed read-only GETs and persists only redacted provider evidence | PASS | PASS | PASS | PASS |
| GET/POST /research/sec/filings; POST /research/sec/filings/:filingId/review | ticker and filingId only; no caller-controlled household or authority fields | Drafts and immutable reviewed evidence are household-scoped; cross-household review is rejected and only approved normalized SEC facts enter dossier selection | PASS | PASS | PASS | PASS |
| GET/POST /research/schwab/market-snapshots; POST /research/schwab/market-snapshots/:snapshotId/review | Ticker and bounded daily date range; snapshotId for immutable disposition; no household, connection, account, provider-path, or execution fields | Actor household resolves its own Market Data connection and snapshot rows; contribute collects a non-authoritative draft, approve records one immutable reviewed evidence row | PASS | PASS | PASS | PASS |

## Current executable evidence

- The two-household fixture proves a foreign goal ID is rejected before a contribution is created.
- The same fixture provisions Owner, Partner, Advisor, and Viewer memberships in both households and passes the role-header regression, partner contribution allow, advisor/viewer contribution denial, and contribution mass-assignment assertions on isolated Neon PostgreSQL.
- The same fixture passes recent-auth denial, parallel transfer overdraft prevention, 100-request contention, transfer replay, persisted household/actor attribution, and ledger debit/credit reconciliation on isolated Neon PostgreSQL.
- The route inventory gate discovers and asserts exactly 251 route/method pairs and requires the exact-source RC1 certification to record that same count as executed. Historical route replays are not promoted to current evidence.
- Parameterized routes require non-error same-household behavior, reject foreign identifiers without a successful write/read response, and reject malformed identifiers with a 4xx response. Parameterless writes must not return another household's identifiers after body tampering.
- The 2026-09-07 guarded replay remains historical evidence for its earlier surface. It is not evidence for the current 251-route inventory.
