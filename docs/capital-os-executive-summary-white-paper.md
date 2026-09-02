# Capital OS — current executive summary and technical white paper

**Current as of:** 2026-09-02
**Release decision:** **NOT READY**
**Companion audit:** `docs/PRODUCTION_READINESS_AUDIT_2026-09-02.md`
**Release gate:** `docs/PRODUCTION_RELEASE_GATE.md`

## Executive Summary

Capital OS is a polished family-capital planning application centered on a first-duplex acquisition and an approximately $250 weekly capital rhythm:

- $200 Duplex Reserve
- $25 Capital OS
- $25 Opportunity Reserve

The product is strongest as a deterministic, advisory, PostgreSQL-backed planning system. It has exact-cent financial domain logic, protected-goal controls, Treasury review records, business/household separation, advisory intelligence, and a deliberately disabled Micro-Live boundary.

The September 2 post-hardening audit does **not** certify production readiness. The application now has a real Clerk-to-internal-user-to-household-membership path in production, but the trust boundary is not sufficiently proven or complete for multiple households:

- a caller-supplied contribution goal ID is not constrained to the current household and can update a foreign goal;
- browser write-origin controls are fail-open when deployment configuration is absent;
- the database migration lifecycle is not reproducible from zero or proven against an older schema;
- backups and restore are described but not operationally drilled;
- there are no HTTP integration, database integration, authenticated browser E2E, or true concurrency tests;
- several visible workflows are prepared, simulated, read-only, or local-only rather than authoritative writes.

The correct next phase is continued hardening, not a new feature expansion or a real bank/trading integration.

## Product Overview

Capital OS helps a household organize:

1. cash flow and recurring obligations;
2. protected goals and weekly allocations;
3. liquid accounts and accounting views;
4. property decision support for a duplex;
5. Treasury requests and Capital Governor controls;
6. business operating cash and reviewed distributions;
7. research-only strategies;
8. advisory intelligence and safe operations;
9. Micro-Live rehearsal without real venue transmission.

The system is intentionally provider-neutral and manual/CSV-first for banking. AI recommends and explains; it does not move money or change protected policy. Planning data, business cash, property estimates, receivables, and unrealized results do not become household spendable cash without an explicit reviewed bridge.

## Current Implementation State

| Capability | Current state |
|---|---|
| Browser authentication | ClerkProvider, sign-in/sign-up routes, branded auth boundary |
| API authentication | Clerk middleware, internal external-auth identity mapping |
| Household membership | Active membership lookup and onboarding |
| Development data | Morgan demo household only in development |
| Production unauthenticated behavior | Protected routes return `401`; role header does not grant access |
| Financial storage | PostgreSQL `numeric(18,2)` |
| Financial decisions | Integer cents in deterministic server/domain code |
| Ledger | Double-entry-inspired movement history and audit records |
| Idempotency | Household-scoped contribution/transfer keys, with concurrency proof still missing |
| Treasury | Review/preparation records; advisory only |
| Business | Entities, accounts, revenue, expense, reserves, proposed distributions |
| Property | Decision-support goals and readiness; no purchase execution |
| Strategy Lab | Research/backtest/shadow/paper eligibility; no household capital access |
| Micro-Live | Rehearsal/reconciliation/review persistence; real transmission disabled |
| AI | Persisted advisory recommendations and human decisions |
| Operations | Persisted tasks, alerts, approvals, preferences, prepare-only automation runs |
| Readiness | Separate liveness and PostgreSQL readiness checks |

## Changes Since September 1, 2026

| Previous major gap | Result |
|---|---|
| Authentication | **PARTIALLY RESOLVED** — browser and API are wired to Clerk; real signed-in E2E remains unverified |
| Tenant isolation | **PARTIALLY RESOLVED** — broad household predicates exist, but a contribution goal IDOR remains |
| Production schema lifecycle | **PARTIALLY RESOLVED** — generated artifact and managed Publish boundary are documented; reproducibility is not proven |
| Persisted workflows | **PARTIALLY RESOLVED** — several writes now persist; quick actions and exports remain mixed |
| Integration coverage | **UNCHANGED** — 0 HTTP, 0 database, 0 browser E2E cases |
| Operations durability | **UNCHANGED** — no durable scheduler, queue, or restart recovery |
| Accounting completeness | **CLARIFIED** — API-backed but liabilities, valuation, and business-equity treatment remain partial |
| Frontend organization | **UNCHANGED** — approved UI preserved; large `App.tsx` remains a change-risk area |
| Provider workflow discoverability | **UNCHANGED** — no real bank or venue provider is connected |

### Regression review

No visual regression was found in the verified 1440×1000 preview. Tightening the contribution response contract exposed legacy null metadata during review; the service now normalizes that historical value to `{}` without weakening the public contract.

The hardening layer adds useful authorization complexity but still lacks an HTTP test harness. That is a verification risk, not a claim of a functional regression.

## Technical Architecture

```text
Clerk browser session
        ↓
Clerk middleware / same-origin request
        ↓
externalAuthId → internal user → active household membership
        ↓
request-scoped household + role context
        ↓
Express route → generated Zod validation
        ↓
domain service → Drizzle transaction → PostgreSQL
        ↓
audit event / idempotency record / persisted result
```

PostgreSQL is the source of truth. The API does not run startup DDL. Managed development schema changes use the supported development push flow; production schema changes use the Publish database flow. Generated Drizzle SQL is retained for review and CI, but a reproducible apply-from-zero migration test and existing-schema upgrade test are still missing.

The API has:

- structured Pino logs;
- correlation IDs with bounded validation;
- standard error envelopes;
- separate liveness and readiness endpoints;
- generated OpenAPI, React Query, and Zod artifacts.

It does not yet have durable metrics, traces, queue telemetry, centralized audit shipping, or production alerting.

## Data Model

The core model includes:

- households, users, and household memberships;
- accounts, goals, allocation rules, contributions, and ledger entries;
- finance accounts, categories, expenses, bills, income, and snapshots;
- risk states, capital requests, audit events, idempotency keys, and recommendations;
- businesses, ownership, business accounts, revenue, expenses, reserves, and distributions;
- property candidates, readiness milestones, documents, strategies, experiments, and evidence;
- Micro-Live sessions, venues, reviews, requirements, snapshots, fills, incidents, and recovery records;
- operations tasks, approvals, alerts, automations, notification preferences, and runs.

Authoritative money is stored as decimal PostgreSQL numerics and converted to integer cents for decisions. Calendar-only dates and timestamps need further system-wide timezone review.

## Household Finance and Protected Goals

The weekly allocation model preserves the configured $250 rhythm and stores allocation metadata with contribution records. A successful contribution can write:

1. allocation split;
2. Treasury-to-destination ledger movements;
3. protected duplex goal progress;
4. contribution record;
5. audit event.

The contribution path is not yet safe for production because its optional `goalId` is checked by ID alone rather than ID plus current household. A foreign UUID could mutate another household’s goal. This is a release-blocking integrity defect.

Safe-to-Deploy uses liquid checking, savings, and money-market balances; bills; essential expenses; reserve shortfall; protected commitments; upcoming required expenses; a safety buffer; and a deployable percentage cap. Business cash, protected duplex capital, planning balances, and unrealized values are excluded by current source selection. The calculation remains conservative but uses fixed confidence/buffer inputs and lacks a full cross-domain invariant suite.

## Treasury

Treasury provides an advisory review surface and persisted capital-request records. Approval is human-gated and does not itself move money. Protected capital remains a separate boundary.

The Treasury implementation must still be corrected to use the persisted protected-capital lock state rather than a hardcoded unlocked decision field. This is a P1 financial-integrity risk even though the UI describes Treasury as advisory-only.

## Business

Business records are household-scoped and distinguish business accounts from household capital. Owner contributions and intercompany transfers are not ordinary revenue. Owner distributions are not ordinary expenses. Reserve-floor rules constrain proposed distributions.

The UI clearly states that business operating cash is separate from household Safe-to-Deploy. The completed owner-distribution bridge is not implemented: distribution state is proposed/prepared rather than an actual reviewed household income transfer. Business liabilities and full double-entry postings are also incomplete, and accounting and business views do not use the same equity treatment.

## Property

Property is decision support. Candidates, readiness, financing assumptions, documents, and acquisition notes do not purchase property or create an owned household asset. The property state boundary is appropriate in concept but needs stronger household predicates and explicit acquisition-state tests before multi-tenant certification.

## Strategies

Strategy Lab is research-only. It can model reproducible simulations, evidence gates, execution friction, paper eligibility, and human reviews. It cannot access household protected capital or submit orders. Strategy promotion is not equivalent to live execution.

## Micro-Live

Micro-Live is **DISABLED BY DESIGN**:

- the simulated adapter refuses place/cancel;
- rehearsal reports `liveOrderTransmission: false`;
- the reviewed adapter registry is empty;
- real venue reconciliation is rejected;
- protected capital and household capital are not reachable by the execution boundary.

Persistence exists for rehearsal, reconciliation, reviews, requirements, positions, fills, incidents, and recovery records. This does not make live trading ready. Remaining issues include:

- order-event timeline lookup uses a session ID where the schema expects an order-intent ID;
- no service currently ingests and validates persisted event sequences;
- nullable external event IDs can permit duplicates;
- reconciliation persistence can fail after venue fetch/disconnect without a durable retry/dead-letter path;
- incident completion does not independently recreate or enforce a recovery session;
- there is no independent Guardian failure domain.

## AI

AI is advisory. Recommendations are deterministic around current signals and confidence, then persisted with decisions and feedback. Forbidden actions include moving money, changing protected policy, overriding risk, enabling live trading, changing credentials, signing contracts, and submitting transactions.

No direct AI capital authority was found. Full authenticated tenant tests are still required for recommendation reads, decisions, and feedback.

## Operations

Operations persists tasks, alerts, approvals, notification preferences, and prepare-only automation runs. Automation blocks capital movement, protected-capital unlocks, Micro-Live enablement, ownership changes, contracts, and offers.

There is no durable scheduler, queue, worker, retry policy, or restart recovery. Automation health currently hardcodes zero failures instead of deriving failure state from durable run history. This is not production-grade operational execution.

## Accounting

Accounting is API-backed and uses assets minus liabilities for net worth. Ledger entries and reconciliation are surfaced.

Current limitations:

- real-estate and investment fields are hardcoded or incomplete;
- business equity treatment differs between accounting and business views;
- business liabilities are incomplete;
- an empty ledger can be treated as balanced by an `every()`-style check;
- advisor-restricted views can omit protected balances rather than providing a complete redacted total;
- report/export and tax flows are support-only or presentation-only.

The current design avoids double-counting by using included financial-account balances for current net worth, while planning balances and business cash remain separate unless explicitly reconciled.

## Security

### Implemented controls

- production Clerk middleware and browser ClerkProvider;
- external auth ID mapped to internal user;
- active membership requirement;
- production rejection of unauthenticated requests;
- development/test role header isolated from production;
- generated request and response validation;
- correlation IDs;
- security headers;
- protected-capital and AI/automation authority gates;
- secret values not found in inspected source, generated clients, or logs;
- real Micro-Live transport disabled.

### Incomplete controls

- no step-up/recent-auth boundary;
- role map is used instead of stored effective per-membership permissions;
- no two-household HTTP security suite;
- write-origin enforcement is conditional on deployment configuration;
- no CSRF token or explicit same-site credential policy;
- process-local IP rate limiting is not horizontally safe;
- venue secret references lack a demonstrated vault/rotation/access-audit workflow;
- several audit records attribute actions to the household owner instead of the authenticated actor.

## Testing

| Category | Current inventory |
|---|---|
| Pure domain | 11 files, 62 cases, 62 passing |
| HTTP integration | 0 |
| Database integration | 0 |
| Authenticated browser E2E | 0 |
| True concurrency | 0 |
| Migration tests | 0 |
| Dedicated security suites | 0 |
| Recovery | Pure OMS/recovery scenarios only |

The 62 domain cases cover exact-cent arithmetic, financial allocation, accounting rules, role denial, protected capital, strategy stages, AI authority, operations safety, property underwriting, and Micro-Live state logic. They do not certify the deployed HTTP, database, browser, migration, or multi-tenant boundary.

Current build evidence:

- library/API/frontend typechecks pass;
- API/frontend/mockup builds pass with managed build environment variables;
- OpenAPI → React Query/Zod generation passes;
- `git diff --check` passes;
- production-like liveness/readiness failure behavior passes;
- production-like role-header injection does not bypass authentication.

## Strengths

1. Clear family-capital purpose and excellent visual hierarchy.
2. Strong deterministic financial domain model.
3. Exact-cents calculations and decimal storage.
4. Protected goal and Capital Governor concepts are explicit.
5. Business and household boundaries are visible and mostly enforced.
6. AI and automation have conservative authority limits.
7. Micro-Live is correctly isolated and disabled by default.
8. PostgreSQL/Drizzle and generated contract pipeline provide a sound foundation.
9. Liveness/readiness and correlation IDs provide a useful operational base.
10. The team has documented the difference between planning, advisory, prepared, and executable states.

## Limitations

The platform is not currently a safe general-purpose multi-household financial system because identity, authorization, migration, recovery, persistence truth, and operational evidence are incomplete. The most serious concrete defect is the cross-household contribution goal write. The most serious evidence gap is the complete absence of HTTP/database/browser/concurrency tests.

## Maturation Path

### P0 — before any production financial use

1. Fix the contribution goal household predicate and review every path identifier for equivalent issues.
2. Make write-origin and CSRF controls fail closed in production.
3. Build two-household authenticated HTTP fixtures and test reads, writes, IDOR, headers, mass assignment, and roles.
4. Establish a managed-database-compatible migration baseline and clean/upgrade tests.
5. Execute an isolated backup/restore drill with ledger, identity, Treasury, business, strategy, accounting, and audit checks.

### P1 — before production candidate

1. Make transfer balance updates atomic and test concurrent requests.
2. Enforce effective membership permissions and add step-up authentication.
3. Add durable scheduling, retries, restart recovery, and actual automation health.
4. Add metrics, alerts, audit shipping, and database/queue telemetry.
5. Reconcile accounting, business equity, liabilities, and Safe-to-Deploy invariants.
6. Correct Micro-Live order-event association and failure persistence.
7. Classify and complete remaining local-only UI actions.

### Not the next phase

Do not add real bank aggregation, automated ACH, external investor funds, live trading, autonomous AI execution, or blockchain submission until the P0 and P1 trust boundaries are evidenced.

## Conclusion

Capital OS has moved from a strong but mostly seeded prototype toward a credible technical foundation. It has not crossed the production-grade boundary.

The correct release statement is:

> **NOT READY — strong deterministic financial prototype; production trust boundary, migration/recovery lifecycle, and end-to-end evidence remain incomplete.**

The full evidence table, exact blockers, score, feature maturity matrix, and release checklist are maintained in the dated production-readiness audit and release-gate documents.