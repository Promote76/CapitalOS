# Capital OS — Executive Summary & Technical White Paper

**Review date:** September 1, 2026  
**Review basis:** Current repository, checked-in documentation, generated API contracts, and running workflows  
**Document status:** Internal product and engineering reference

---

## 1. Executive summary

Capital OS is a family-capital workspace for disciplined saving, protected reserves, property acquisition planning, business-income separation, strategy research, Treasury allocation, and operational review.

Its central principle is:

> **Household cash is not automatically deployable capital.**

The product is organized around a first duplex acquisition funded by an approximately **$250 weekly rhythm**:

- **$200** to a protected Duplex Reserve
- **$25** to Capital OS
- **$25** to an Opportunity Reserve

The interface presents a calm, light-theme family-office control surface rather than a trading terminal. Green communicates protection and progress, blue active capital, lavender research/opportunity, amber review, and red critical safeguards.

### Bottom line

Capital OS has a credible safety-first foundation:

- Exact-cents financial logic
- PostgreSQL persistence through Drizzle ORM
- Server-side Capital Governor and Treasury rules
- Audit and idempotency concepts
- Human-reviewed operational approvals
- A separate business-capital boundary
- A deliberately disabled Micro-Live execution boundary
- Advisory-only AI

It is not yet a production-grade multi-user financial platform. The most important remaining gaps are authenticated identity, household/tenant isolation, production schema lifecycle discipline, route and browser integration coverage, and the completion of several user-facing workflows that are currently local-state or presentation-only.

### Current maturity summary

| Area | Current state |
| --- | --- |
| Decision control plane | Strongly implemented |
| Treasury and capital safety | Strong foundation |
| Business Engine | First vertical slice implemented |
| Strategy research | Implemented as research-only |
| Micro-Live | Safely disabled and fail-closed |
| Product workflows | Mixed: API-backed and presentation surfaces |
| Authentication | Not production-complete |
| Multi-user tenant isolation | Not demonstrated |
| End-to-end verification | Limited beyond domain tests |

---

## 2. Product overview

Capital OS links household finance to protected goals without collapsing their meanings. It can calculate, explain, remind, review, queue, and recommend. It intentionally does not move money, pay bills, sign contracts, connect a bank without an approved provider path, or enable trading.

### Product surface inventory

| Product area | Current purpose | Current state |
| --- | --- | --- |
| Overview / Dashboard | Household snapshot, goal pace, quick actions, and contribution rhythm | API + fallback |
| Budget / Cash Flow | Planned versus actual spending, obligations, runway, forecast, and Safe-to-Deploy context | API-backed |
| Accounts / Transactions | Manual, provider-neutral account and transaction context; CSV import exists on the API side | Partial |
| Accounting | Authoritative net worth, balance sheet, capital statement, income, cash flow, liquidity, reconciliation, and confidence | API-backed |
| Goals / Contributions | Purpose-led saving and weekly allocation around the duplex acquisition | Mixed |
| Treasury | Capital buckets, policy hierarchy, liquidity ladder, stress tests, reservations, and human-reviewed capital requests | API-backed |
| Properties | Buy box, candidate analysis, readiness, financing, cash-to-close, milestones, and acquisition planning | Decision support |
| Business | Companies, ownership, business accounts, revenue, expenses, reserves, profit, distributions, and owned equity | Current slice |
| Strategies / Strategy Lab | Research hypotheses, immutable versions, deterministic experiments, evidence, and graduation review | Research-only |
| Micro-Live / OMS | Rehearsal, eligibility, pre-trade checks, lifecycle states, reconciliation, incident recovery, and human arming model | Disabled by design |
| Operations | Tasks, approvals, alerts, safe automations, runs, and notification preferences | API-backed |
| Insights / Intelligence | Advisory CIO-style summaries, recommendations, analyst evidence, and scenario planning | Advisory |
| Portfolio / Risk / Settings | Allocation, safeguard, and configuration surfaces | Mostly presentation |
| Reports / Documents | Navigation and review surfaces for future reporting and document workflows | Presentation |

The route inventory is defined in `artifacts/capital-os/src/App.tsx`. The application currently has more than 20 navigable destinations sharing one responsive shell.

---

## 3. Current implementation state

### Data-backed foundation

PostgreSQL and Drizzle are the source of truth for household, capital, finance, Treasury, property, strategy, governance, operations, business, and Micro-Live records.

The generated OpenAPI clients and Zod schemas connect the React UI to the Express API:

```text
React UI
  → generated React Query client
  → Express route
  → generated Zod request/response validation
  → domain service
  → Drizzle/PostgreSQL
  → audit or idempotency record where applicable
```

### Demo and review surfaces

The approved UI remains usable when a backend read is unavailable, but local fallback data and feedback-only buttons can make a presentation surface look more complete than its persistence path.

Examples include:

- Several Dashboard quick actions
- Some Portfolio, Risk, and Settings actions
- Accounting review/export affordances
- Some Reports and Documents views
- Local contribution presentation behavior

### Business Engine slice

The Business Engine separates:

- Operating-company revenue
- Business expenses
- Business-linked accounts
- Reserve targets
- Tax reserves
- Safety buffers
- Business cash
- Owner pay
- Proposed distributions
- Ownership-adjusted business equity

Distribution requests are review-only, and reserve floors are enforced before a distribution can be prepared.

### Development identity

Development defaults to the seeded Morgan household owner and can exercise role paths with `X-Household-Role`. Production defaults to a viewer actor until an authenticated household identity bridge is implemented.

---

## 4. Technical white paper

## 4.1 Architecture and system boundary

Capital OS is a pnpm workspace with two primary runtime artifacts:

1. A React/Vite web application at the Capital OS artifact.
2. An Express 5 API server at the API Server artifact.

A separate mockup-sandbox artifact supports component previews and visual exploration.

The request path is:

```text
Browser / React UI
        │
        │ generated React Query client
        ▼
Express 5 API
        │ security headers, rate limiting, CORS, write-origin boundary,
        │ structured logging, JSON limits
        │
        │ generated Zod validation
        ▼
Domain services
        │ finance, Treasury, property, strategy, business,
        │ accounting, OMS, governance, intelligence
        │
        │ Drizzle transaction boundary
        ▼
PostgreSQL
        │ household-scoped records, ledger, audit, idempotency,
        │ operational state, business records
        │
        └── no bank credentials
            no autonomous payments
            no live venue transport
            no blockchain submission
```

The contract source is `lib/api-spec/openapi.yaml`. Orval generates:

- React Query clients under `lib/api-client-react`
- Zod schemas and types under `lib/api-zod`

## 4.2 Data model

The schema is organized by bounded financial and governance domains rather than by screens.

### Identity and tenancy

- Users
- Households
- Household members
- Household roles
- Household settings

### Household finance

- Provider-neutral bank connection state
- Financial accounts
- Finance categories
- Signed transactions
- Recurring commitments
- Bills
- Upcoming expenses
- Income sources
- Emergency reserves
- Historical finance snapshots

### Capital and ledger

- Internal capital accounts
- Goals
- Allocation rules
- Contributions
- Transfers
- Ledger transactions
- Ledger entries

### Treasury

- Prioritized buckets
- Treasury policy
- Capital reservations
- Capital requests
- Liquidity ladder
- Stress cases
- Treasury health

### Property planning

- Property goals
- Target markets
- Property candidates
- Buy boxes
- Financing scenarios
- Preapproval records
- Property documents
- Milestones
- Readiness and underwriting

### Strategy and intelligence

- Strategies
- Immutable strategy versions
- Strategy performance
- Experiments
- Research journal
- Recommendations
- Insights
- Human feedback

### Governance and Operations

- Risk states and events
- Append-only audit events
- Idempotency keys
- Tasks
- Approvals
- Alerts
- Automations
- Automation runs
- Notification preferences

### Business

- Business entities
- Ownership percentages
- Business-linked accounts
- Revenue
- Expenses
- Reserve planning
- Owner distributions

### Micro-Live

- Execution policy
- Venue state
- Sessions
- Order intents
- Venue orders and events
- Fills
- Position and fill snapshots
- Reconciliation
- Guardian heartbeats
- Trading incidents
- Incident reviews
- Reactivation requirements

Authoritative money uses PostgreSQL `numeric(18,2)`. Service calculations convert validated decimal strings into integer cents and format back to decimal strings at the API boundary. Trading quantities and prices use a finer numeric scale. Calendar dates use date columns rather than timezone-shifting timestamps.

## 4.3 Household finance and Safe-to-Deploy

Household finance is deliberately read-only with respect to external institutions. Manual entry and CSV-first workflows are provider-neutral. The Plaid adapter is disabled until an approved connection exists.

The Capital Governor is the boundary between household context and deployable internal capital.

Safe-to-Deploy:

- Is clamped at zero.
- Is reduced by bills due before expected income.
- Is reduced by required monthly expenses.
- Is reduced by emergency-reserve shortfall.
- Is reduced by protected-goal commitments.
- Is reduced by known required upcoming expenses.
- Is reduced by the configured safety buffer.
- Is bounded by the Capital Governor’s maximum deployable percentage.
- Is reduced when account data is stale, incomplete, or uncertain.

Protected capital remains ring-fenced. Household finance cannot ACH, pay bills, trade, or store bank credentials.

## 4.4 Treasury and capital governance

Treasury models a hierarchy of:

1. Required household obligations
2. Minimum operating cash
3. Emergency reserve
4. Protected duplex capital
5. Closing-cost reserve
6. Opportunity reserve
7. Liquid Treasury
8. Validated strategy capital

Treasury calculates:

- Health
- Utilization
- Liquidity coverage
- Emergency coverage
- Protected and active capital
- Reservations
- Stress-test outcomes
- Safe-to-Deploy
- Next actions and alerts

Capital requests are submitted for human decision. They do not pull funds directly.

The Capital Governor enforces:

- Minimum cash
- Active-capital limits
- Strategy-allocation limits
- Protected-capital locks
- Weekly risk limits
- Drawdown ceilings
- Emergency stop state

Risk checks happen in domain services rather than UI components.

## 4.5 Business and operating-company boundary

The Business Engine extends Capital OS without merging business and household books.

Business revenue and expenses are recorded against a business entity. Business-linked financial accounts provide operating cash. Reserve targets, tax reserve, and safety buffer establish a distribution floor. Ownership percentage determines the household’s share of business equity.

### Accounting rules

- Owner contributions are not business revenue.
- Intercompany transfers are not business revenue.
- Owner distributions are not ordinary operating expenses.
- Business cash is not household Safe-to-Deploy.
- Proposed distributions reserve capacity but do not move money.
- Only a completed, human-reviewed distribution may become household income.
- Household net worth must include either underlying business assets or ownership-adjusted business equity, not both.

The current Business page communicates this boundary explicitly:

> Business cash is excluded from household Safe-to-Deploy. Distributions require human review and reserve coverage.

## 4.6 Property planning

The property surface supports decision support for a first duplex acquisition:

- Buy-box guardrails
- Target markets
- Property candidates
- Candidate analysis
- Readiness scoring
- Financing scenarios
- Cash-to-close analysis
- Lender and document tracking
- Acquisition milestones
- Deal and downside analysis

This is planning-only. It does not submit offers, approve mortgages, purchase property, or create a binding valuation.

## 4.7 Strategy Lab and Micro-Live

Strategy Lab is a research environment. It supports:

- Hypotheses
- Immutable versions
- Deterministic backtests
- Walk-forward experiments
- Shadow and paper stages
- Execution friction
- Regime metrics
- Drawdown and risk events
- Research journals
- Evidence-based graduation

Strategy promotion is sequential and requires observations, reconciliation accuracy, and no critical errors. No strategy stage enables live trading in the current release.

Micro-Live is a fail-closed control plane, not a live trading product.

The default policy is a small sandbox with separate:

- Venue-capital cap
- Strategy-capital cap
- Market-exposure cap
- Individual-order cap
- Soft loss limit
- Hard loss limit

The boundary also disables:

- Leverage
- Margin
- Borrowing
- Automated scaling
- Withdrawals
- Household bank-to-venue transfers

Household, Duplex Reserve, Emergency Reserve, and other protected capital are inaccessible to the execution boundary.

The checked-in simulated adapter always refuses order transmission. A future real venue would require:

- A reviewed server-side adapter
- Opaque credential references
- An isolated execution account
- Explicit asset and market allowlists
- Independent security review
- Jurisdiction and account-eligibility review
- Terms review
- Withdrawal review with withdrawals disabled
- Venue-authoritative reconciliation
- An independent Guardian boundary
- Explicit human arming

OMS state handling models partial fills, cancel/fill races, rejection, expiration, unknown state, duplicate orders/fills, recovery, and reconciliation mismatch.

Guardian may stop, lock, request cancel-all, and alert a human. Guardian may not trade, increase capital, or change policy.

## 4.8 AI and Operations

AI is advisory-only. It may:

- Summarize financial patterns
- Flag anomalies
- Identify recurring expenses
- Suggest a review
- Explain scenarios

AI cannot:

- Approve a transaction
- Move capital
- Change a protected goal
- Connect a bank
- Pay a bill
- Override risk
- Enable trading
- Change credentials
- Sign contracts
- Submit blockchain transactions

Human approval records intent and audit. It does not create an external payment.

Operations provides:

- Tasks
- Approvals
- Alerts
- Prepare-only automation runs
- Notification channels
- Quiet hours

Restricted automation actions include transfers, protected-capital changes, trading enablement, ownership changes, offer submission, contract signing, and security disabling.

## 4.9 API, validation, and code generation

OpenAPI is the contract source of truth:

```text
lib/api-spec/openapi.yaml
        │
        ├── Orval → React Query client
        └── Orval → Zod schemas and TypeScript types
```

Routes generally validate requests and responses with generated Zod schemas. The frontend consumes generated React Query hooks rather than maintaining separate handwritten API types.

The main current limitation is that the contract is enforced by convention and generation rather than by a comprehensive CI route-parity and HTTP contract test suite.

## 4.10 Persistence, seeding, and deployment

Drizzle discovers the schema from `lib/db/src/schema/index.ts`. Development schema changes use `drizzle-kit push`.

The application currently seeds one development household, the Morgan household, with:

- Owner and membership
- Internal accounts
- Goals
- Weekly allocation rules
- Risk state
- Recommendations
- Treasury policy and buckets
- Household finance records
- Property planning records
- Strategy records
- Operations records
- Business records

Seeding uses additive repair behavior and household-scoped advisory locking for lazy seed paths reached by parallel reads.

Important deployment boundaries:

- Development seed data is not an external bank or brokerage connection.
- Startup DDL and deployment-time production migrations are not used.
- Production schema changes must be applied through the managed Publish workflow.
- The dependency-free health endpoint is liveness, not database readiness.
- There is no visible versioned migration history or full rollback strategy.

## 4.11 Security and governance

### Implemented controls

- Role permission matrix for owner, partner, advisor, and viewer
- Server-side permission checks
- Protected-capital lock
- Reserve floors
- Bounded allocation
- Emergency stop
- Exact-cents calculations
- Transactional ledger and audit writes for key capital movements
- Household-scoped idempotency for contributions and transfers
- Reason and evidence fields for approvals
- Incident review and reactivation requirements
- Security headers
- Disabled `x-powered-by`
- Structured pino logging with sensitive-header redaction
- In-memory rate limiting
- CORS configuration
- Write-origin boundary
- Advisory-only AI
- No bank credentials, payment transport, chain submission, or live venue transport

### Highest-priority security gap

Authentication and tenant isolation are not production-complete.

Clerk packages, managed keys, and a proxy template exist, but the application does not yet wire:

- Authenticated API middleware
- Browser provider
- Sign-in and sign-up routes
- Authenticated user resolution
- User-to-household membership mapping
- Authenticated role enforcement
- Step-up verification for sensitive actions

Development uses a seeded actor and can exercise role paths using `X-Household-Role`. Production defaults to a seeded viewer actor. This is safer than granting production privilege from a browser header, but it is not a production identity system.

Other important gaps:

- CORS and write-origin protection depend on configuration.
- Rate limiting is process-local and IP-based.
- Micro-Live route-level validation is less consistent than the domain validation.
- No comprehensive security, load, or authenticated browser test suite is visible.

---

## 5. Verification and engineering state

The repository contains a broad TypeScript workspace with React/Vite frontend code, Express API code, Drizzle/PostgreSQL schema, generated API artifacts, documentation, and domain tests.

The latest recorded verification includes:

- API TypeScript typecheck passing
- Frontend TypeScript typecheck passing
- API production build passing
- Frontend production build passing with required runtime configuration
- OpenAPI, Zod, React Query, and TypeScript clients regenerated
- Development database schema pushed successfully
- **62 of 62 direct API domain tests passing**
- Running API and web workflows
- Successful runtime requests to reviewed endpoints
- Responsive Business and Operations pages rendered successfully

The direct test command is intentionally focused on:

```text
artifacts/api-server/src/domain/*.test.ts
```

This provides strong confidence in deterministic calculations and state-machine rules. It does not prove production behavior across authentication, HTTP routes, database transactions, browser flows, concurrency under load, or deployment recovery.

| Verification layer | Current confidence | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Pure domain tests | Strong | Money math, governors, state transitions, research/execution boundaries | HTTP, DB, identity, browser, deployment |
| Typecheck/build | Strong | Workspace contracts compile and artifacts bundle | Runtime data correctness or authorization |
| Runtime smoke checks | Targeted | Workflows start and reviewed endpoints/pages respond | Full user journeys and failure recovery |
| Security/auth readiness | Incomplete | Defensive domain rules and HTTP hardening exist | Authenticated multi-user security and step-up control |

---

## 6. Strengths

### Product strengths

- Clear and differentiated family-capital narrative
- Strong purpose-based capital hierarchy
- Calm, consistent family-office visual language
- Repeated safety communication across high-risk surfaces
- Clear separation of protected, active, opportunity, review, and critical states
- Property, strategy, business, Treasury, and household finance boundaries are visible

### Engineering strengths

- Exact-cents financial calculations
- PostgreSQL as the source of truth
- Good separation between pure domain logic and routes/services
- Generated API contract and client pipeline
- Strong pure tests for capital governance and state transitions
- Protected-capital and AI authority boundaries are enforced server-side
- Micro-Live is disabled by default and fail-closed
- Business Engine uses reserve floors and human-reviewed distribution preparation
- Additive and concurrency-safe development seeding

---

## 7. Limitations and production risks

1. **Authentication and tenant isolation:** The current seeded actor model is not a production identity or multi-household isolation solution.
2. **Database lifecycle:** There is no visible versioned migration history, schema CI, rollback strategy, or formal backup/restore runbook.
3. **Dependency readiness:** The health endpoint is liveness-only and can report healthy while data routes are unavailable.
4. **Product truthfulness:** Some UI actions appear saved or complete while remaining local state or feedback-only behavior.
5. **Integration coverage:** Route, database, HTTP contract, browser, concurrency, load, and security tests are limited.
6. **Operations observability:** Automation failure health is not fully derived from recorded automation runs, and no durable scheduler or queue is evident.
7. **Accounting completeness:** Investment growth and universal posting/invariant workflows remain incomplete.
8. **Micro-Live interpretation:** A readiness score must not be interpreted as enabled live execution; real venue transport is intentionally absent.
9. **Frontend organization:** The large all-in-one `App.tsx` increases change risk and makes route-level ownership and testing harder.
10. **Provider workflow discoverability:** CSV support exists at the API layer but is not fully surfaced in the Accounts UI.

---

## 8. Recommended maturation path

### 1. Complete authenticated identity before production use

Wire Clerk into the API and browser boundaries. Resolve authenticated users to real household memberships and roles. Remove privilege-by-header behavior outside explicit test mode. Add authenticated role, tenant-isolation, and step-up tests.

### 2. Make the database lifecycle explicit

Establish versioned migration and rollback practices. Separate development seed repair from production startup. Add readiness checks that report database dependency state.

### 3. Close the planning-to-governor integrity loop

Add invariant tests proving that planning balances, property values, business cash, receivables, and unrealized profit cannot silently raise household Safe-to-Deploy without an explicit reconciliation bridge.

### 4. Productize existing surfaces

Replace feedback-only save, export, sync, transfer, strategy, and property-note actions with server-backed workflows. Expose CSV import in Accounts. Preserve contribution allocation metadata in the UI. Clearly distinguish fallback data from authoritative data.

### 5. Expand integration coverage

Add:

- OpenAPI route-parity checks
- HTTP contract tests
- Database transaction tests
- Browser end-to-end tests for critical capital flows
- Concurrency tests for seeding and idempotency
- Security and load tests

### 6. Improve operational truth

Derive automation failure health from run records. Add structured metrics and tracing. Implement a durable scheduler or queue for reconciliation, Guardian checks, and safe automation. Formalize backup, restore, and incident runbooks.

### 7. Keep real execution last

If a real venue is ever considered, preserve the current isolation and require independent security, jurisdiction, terms, withdrawal, credential, adapter, reconciliation, Guardian, and human-arming review as a separate release boundary.

---

## 9. Conclusion

Capital OS is a promising governed capital workspace, not an autonomous financial platform.

Its differentiated thesis is to protect the family balance sheet first, make capital purpose visible, keep business and household economics separate, and make higher-risk actions reviewable. Its strongest work is in deterministic domain logic and explicit safety boundaries. The codebase demonstrates that money movement, trading, blockchain, business distributions, and AI authority can be constrained rather than merely described.

The next milestone is not more automation. It is:

- Trustworthy identity
- Tenant isolation
- Production schema discipline
- Persisted user workflows
- End-to-end verification

Once those foundations are complete, the existing Treasury, Business, Operations, Accounting, property, strategy, and Micro-Live control planes will have a more credible path from polished prototype to production-grade family capital operating system.

---

## Primary evidence reviewed

- `replit.md`
- `docs/ARCHITECTURE.md`
- `docs/capital-os-architecture.md`
- `docs/DATA_MODEL.md`
- `docs/CAPITAL_PROTECTION.md`
- `docs/AI_GOVERNANCE.md`
- `docs/MICRO_LIVE_POLICY.md`
- `lib/api-spec/openapi.yaml`
- `lib/db/src/schema/`
- `artifacts/api-server/src/`
- `artifacts/capital-os/src/`