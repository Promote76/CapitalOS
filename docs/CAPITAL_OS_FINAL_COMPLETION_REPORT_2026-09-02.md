# Capital OS Final Completion Report

**Date:** 2026-09-02  
**Last updated:** 2026-09-05
**Repository / release:** Current Capital OS workspace; no public release is certified by this report  
**Certification scope:** Internal-only, non-public, non-executing family-capital scope plus separately assessed Controlled Micro-Live boundary
**Release decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**  
**Public Production Candidate status:** **NOT APPLICABLE**

## Executive Summary

Capital OS is a household financial planning and advisory application for budgeting, cash flow, protected goals, Treasury planning, business separation, property decision support, accounting, operations, Strategy Lab research, and Micro-Live rehearsal.

The hardening work established meaningful controls around authenticated identity, household scoping, role checks, effective membership permission loading, origin enforcement, exact-cent financial logic, atomic transfer debits, idempotency boundaries, ledger evidence, Treasury protected-capital state, persistence truth in the UI, generated API contracts, and the disabled Micro-Live execution boundary.

Executable evidence is currently strongest for domain safety, isolated PostgreSQL HTTP behavior, and the authenticated Clerk browser lifecycle. The workspace typechecks, builds, regenerates API clients, passes route parity, and passes 93 API tests, with 27 database-backed tests intentionally skipped when no certification URL is configured. The latest isolated database-backed fixture proves the 149-route tenant preflight, role/effective-permission cases, persisted actor attribution, cross-household and viewer-denial boundaries, contribution/transfer/strategy-allocation idempotency, concurrent capital-request creation, concurrent business-distribution preparation, 100-request contention, and balanced ledger totals. Published-origin probes, a disposable historical-schema upgrade/data-preservation run, and the authenticated onboarding, persistence, sign-out, sign-in, and isolation journey also passed.

Capital OS is qualified only for controlled, in-house evaluation within the documented non-executing scope. Public production release is out of scope. The provider-supported Clerk reverification flow is implemented but its approved authenticated browser evidence remains outside this certification, as does contribution-specific authenticated browser evidence. Durable queue and reconciliation controls are implemented locally, but their database-backed restart run is not claimed as executed evidence.

No real banking, ACH, brokerage, live venue, blockchain, external investor capital, automated withdrawal, or autonomous AI capability was added or enabled.

## P0 certification mapping

The certification runner and this report use the seven in-scope P0 gates below. `IMPLEMENTED`
and `EXECUTED` evidence do not close a gate; only `CERTIFIED` evidence produces
`PASS`. This report includes the expanded isolated fixture, published-origin probes,
and disposable historical-schema upgrade evidence executed on 2026-09-02. The
latest route-isolation evidence was refreshed on 2026-09-05.

| Gate | Status | Implementation | Execution | Certification | Current reason |
|---|---|---|---|---|---|
| P0-01 Caller-controlled identifier / IDOR matrix | PASS | IMPLEMENTED | 149-route inventory, household reads, foreign/malformed identifiers, and mass-assignment probes executed in isolated PostgreSQL | CERTIFIED | No unsafe success, tenant leakage, or server error observed |
| P0-02 Origin / CSRF certification | PASS | IMPLEMENTED | Middleware matrix and published-origin probes executed | CERTIFIED | Five published-origin write-safety probes passed |
| P0-03 Existing-schema upgrade | PASS | IMPLEMENTED (historical artifact) | Disposable historical upgrade and data-preservation comparison executed | CERTIFIED | Representative records, balances, statuses, and audit actor survived |
| P0-05 Authenticated browser journey | PASS | IMPLEMENTED | Authenticated Clerk journey executed; onboarding, persistence, sign-out, sign-in, and second-household isolation assertions passed | CERTIFIED | Lifecycle assertions passed in the documented browser run |
| P0-07 Concurrent idempotency breadth | PASS | IMPLEMENTED | All current keyed economic write paths executed in the isolated fixture | CERTIFIED | Same-key concurrency and mismatched replay cases passed |
| P0-06 Role / effective-permission HTTP certification | PASS | IMPLEMENTED | Role, effective-permission, membership, selection, and tampering probes executed in isolated PostgreSQL | CERTIFIED | Documented HTTP role matrix passed |
| P0-08 Actor attribution certification | PASS | IMPLEMENTED | Persisted actors and denied-action audit behavior queried in isolated PostgreSQL | CERTIFIED | Exercised permitted and denied actions retain correct actor boundaries |

**P0 START:** 1
**P0 CLOSED THIS RUN:** 1
**P0 OPEN:** 0

## Current Architecture

```text
Authenticated User
        ↓
Clerk Session
        ↓
Internal User
        ↓
Household Membership
        ↓
Effective Permissions
        ↓
Recent Authentication / Step-Up Boundary
        ↓
Household-Scoped API
        ↓
Domain Governor
        ↓
Atomic PostgreSQL Transaction
        ↓
Audit Attribution
        ↓
Persisted Result
```

High-risk authenticated writes now use Clerk's provider-supported reverification contract: the server checks `auth.has({ reverification: "strict" })`, returns Clerk's standardized reverification hint, and the client uses `useReverification()` to open the provider UI and retry the original action. This is implementation evidence only until the approved browser run passes.

## Module Inventory

| Module | Current maturity | Current boundary |
|---|---|---|
| Dashboard | IMPLEMENTED / PARTIAL | Aggregates server data; authenticated browser reload proof passed for the exercised account workflow |
| Budget | IMPLEMENTED / PARTIAL | Household-scoped planning and finance views |
| Cash Flow | IMPLEMENTED / PARTIAL | Server-backed data; accounting cross-view status is explicit, while broader source completeness remains open |
| Accounts | IMPLEMENTED / PARTIAL | Household-scoped balances and atomic transfer path |
| Transactions | IMPLEMENTED / PARTIAL | Ledger-backed paths; the full P0 route/identifier matrix passed in isolated PostgreSQL |
| Goals | IMPLEMENTED | Household predicate and foreign-goal rejection have targeted evidence |
| Treasury | IMPLEMENTED / PREPARED | Persisted requests and protected-capital lock; approvals do not move money |
| Properties | PARTIAL | Planning and underwriting; explicit ownership/acquisition boundary |
| Business | IMPLEMENTED / PARTIAL | Operating cash remains separate from household deployable capital |
| Portfolio | READ-ONLY / ADVISORY | No live venue or household-capital execution |
| Strategies | IMPLEMENTED / PREPARED | Research and eligibility; no order submission |
| Micro-Live | DISABLED BY DESIGN | Rehearsal and eligibility boundaries exist; real transmission is false |
| Accounting | IMPLEMENTED / PARTIAL | Exact-cent and ledger safeguards plus explicit cross-view reconciliation; liability/valuation completeness remains limited by source data |
| Operations | IMPLEMENTED / PREPARED | Persisted tasks/alerts, durable safe-operation jobs, retry/dead-letter state, and safe prepare-only actions; worker deployment remains an operational gate |
| Insights | ADVISORY | No autonomous financial authority |
| Risk | IMPLEMENTED / PARTIAL | Emergency/risk state requires persisted API behavior; reload proof remains open |
| Security | PARTIAL | Clerk bridge, request context, origin checks, and permission checks exist; production step-up/open matrix remain |
| Reports | READ-ONLY / LOCAL-ONLY | No unverified durable export artifact is claimed |
| Documents | READ-ONLY / LOCAL-ONLY | No unverified durable document creation is claimed |
| Settings | PARTIAL | Household/privacy boundaries exist; the P0 HTTP role matrix passed, while broader settings workflows remain |

## Security Certification

| Area | Status | Evidence | Known limitation |
|---|---|---|---|
| Authentication | PARTIAL | Clerk middleware/provider wiring; authenticated browser lifecycle and signed-out protected request both pass | Provider-supported reverification is implemented; approved browser evidence is not certified; public release is out of scope |
| Tenant isolation | PASS for P0-01 | Isolated PostgreSQL fixture executed all 149 route/method pairs and applicable household-read, foreign/malformed-identifier, and mass-assignment probes | Browser lifecycle remains separately open under P0-05 |
| Roles | PASS for P0-06 | Isolated PostgreSQL fixture provisions Owner, Partner, Advisor, and Viewer in both households and passes role, grant/revoke, membership, selection, and tampering cases | Authenticated browser proof remains separately open |
| Effective permissions | PASS for P0-06 | Active membership permissions are loaded and centralized checks pass the stored-permission grant/revoke and role fallback cases | Provider-supported reverification remains an independent evidence gate |
| Step-up | IMPLEMENTED / NOT CERTIFIED | Protected Clerk requests use `auth.has({ reverification: "strict" })`; the client uses `useReverification()` and retries only after the provider hint is satisfied | Approved browser evidence is still required; session age, test headers, and invented OTPs are not proof |
| Origin / CSRF | PASS for P0-02 | Middleware matrix and five published-origin write-safety probes pass, including missing, malformed, cross-site, allowed, and invalid-credential origins | Broader security operations and production configuration evidence remain open |
| IDOR | PASS for P0-01 | Isolated PostgreSQL fixture passed all 149 route/method pairs plus applicable foreign/malformed-identifier and mass-assignment probes | Browser lifecycle is certified separately under P0-05 |
| Mass assignment | PASS for P0-01/P0-06 | Isolated HTTP probes inject household, actor, role, permission, and protected-field tampering into applicable writes | No caller-supplied server-owned field was accepted as another household or actor |
| Audit attribution | PASS for P0-08 | Fixture queries persisted actors for exercised permitted Owner, Partner, Advisor, and granted Viewer actions and verifies denied tampering has no misleading audit row | Broader operational retention/shipping remains open |
| Secret handling | OPEN | No secret values are claimed in this report; runtime configuration uses workspace secret mechanisms | Bundle, logs, errors, audit payload, AI context, vault rotation, and access-audit evidence are not complete |
| Rate limiting | OPEN | Current controls are not certified for horizontal deployment | Shared production rate-limit store/trusted-proxy model is not recorded |

## Financial Integrity Certification

| Control | Status | Evidence / limitation |
|---|---|---|
| Exact cents | PASS | Decision logic uses integer cents; domain tests pass |
| PostgreSQL money storage | PASS | Authoritative monetary columns use `numeric(18,2)` |
| Ledger balance | PARTIAL | Contribution and transfer paths exercise balanced entries; broader business/distribution/adjustment coverage remains open |
| Transfer atomicity | PASS for tested scenario | Conditional debit behavior produced one success and one rejection under parallel requests with no negative tested source balance |
| Transfer high contention | PASS | The isolated PostgreSQL fixture completed 100 concurrent `$25` transfers from `$1,000`, reconciled `$1,000` of debits to `$1,000` of credits, and ended at `$0` |
| Idempotency | PARTIAL | Concurrent duplicate contribution requests return one persisted result; transfer replay, capital-request creation, and distribution-preparation one-row assertions pass; broader event coverage remains open |
| Transaction rollback | PARTIAL | Critical writes are transactionally structured; failure injection after each intermediate write has not been fully executed |
| Safe-to-Deploy | PARTIAL | Business cash and planning capital remain separate; the complete cross-domain non-increase invariant suite is open |
| Protected Duplex Reserve | PASS for domain coverage | Protected capital cannot fund strategy, Treasury active allocation, business, opportunity, or Micro-Live paths in tested domain controls |
| Emergency Reserve | PASS for domain coverage | Reserve protection is covered by domain safety cases; browser persistence remains open |
| Business / household boundary | PASS for current boundary | Operating cash, profit, owner pay, and deployable household capital remain separate until an approved bridge |
| Property ownership boundary | PASS for source/domain coverage | Planning candidates do not become owned real estate without explicit acquisition state |
| Net worth | PASS for current accounting scope | Accounting API exposes cross-view reconciliation and keeps planning, Treasury, business, and property scopes separate rather than silently adding them |
| Business equity | OPEN | Liability, real-estate, investment, and business-equity treatment needs reconciliation across views |

## Database, Migration, Backup, and Restore

### Database architecture

Capital OS uses PostgreSQL through Drizzle. The repository contains a generated baseline SQL artifact and migration journal. The application separates liveness from database readiness; readiness fails with `503` during the tested database outage while liveness remains available.

### Certification infrastructure inventory

This inventory separates resources that exist from certification evidence that has actually executed.

| Resource | Availability | Execution status | Observed state / required action |
|---|---|---|---|
| Certification PostgreSQL | AVAILABLE | CERTIFIED for executed gates | Isolated Neon project `capital-os-certification` (`still-band-85811770`), main branch `br-curly-bread-a53x6g2k`, is disposable and separate from Replit `DATABASE_URL`. Clean baseline and database-backed HTTP certification passed. |
| Old-schema test PostgreSQL | AVAILABLE | CERTIFIED for P0-03 | Disposable Neon branches applied the approved historical snapshot, ran the additive current-schema upgrade, and verified preserved representative records, balances, statuses, and audit actor. |
| Clerk test environment | AVAILABLE | EXECUTED / CERTIFIED for P0-05; step-up NOT CERTIFIED | Replit-managed Clerk development tenant completed the authenticated onboarding, persistence, sign-out, sign-in, and isolation journey. Provider-supported reverification needs a separate approved browser run. |
| Browser E2E URL | AVAILABLE | EXECUTED / PASS | Published autoscale URL is available and healthy: `https://capital-os-fund.replit.app`. The documented authenticated browser lifecycle passed. |

### Migration status

**PASS for clean baseline and existing-schema upgrade preservation.** `scripts/certify-migrations.mjs` provides a guarded disposable-database reset, baseline apply, and representative-table verification sequence. The approved historical source snapshot is `docs/certification/HISTORICAL_SCHEMA_2026-09-01.sql`, with provenance recorded in `docs/certification/HISTORICAL_SCHEMA_MANIFEST_2026-09-02.md`. The isolated upgrade and data-preservation evidence is recorded in `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-02.md`.

```text
CAPITAL_OS_CERTIFICATION_DB_URL=<dedicated-url> \
CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1 \
pnpm run certify:migrations
```

The command refuses to run when the certification URL equals the shared `DATABASE_URL`. It executed successfully on the isolated Neon certification branch on 2026-09-02 with reset explicitly enabled.

The additive `operations_jobs` table is applied to the development database through the supported Drizzle `push-force` workflow. The repository's existing Drizzle migration metadata has an absolute-output-path incompatibility with the installed generator, so no baseline migration was rewritten and no production DDL was executed. Production schema publication remains a separate managed deployment action.

| Migration requirement | Result |
|---|---|
| Generated baseline artifact | PASS by repository inspection |
| Migration journal | PASS by repository inspection |
| Clean zero-to-current execution | PASS — isolated Neon branch reset, baseline applied, representative tables verified |
| Existing-schema upgrade | PASS — isolated additive upgrade completed on disposable Neon branches |
| Data preservation comparison | PASS — representative records, balances, statuses, and audit actor preserved |
| Rollback / forward-fix | BLOCKED — not executed |
| Incompatible-schema readiness behavior | PARTIAL — database outage readiness is tested; schema incompatibility execution remains open |

## Test Results

| Category | Passed | Failed | Skipped | Blocked | Current result |
|---|---:|---:|---:|---:|---|
| Domain | 63 | 0 | 0 | 0 | PASS |
| HTTP integration | 1 fixture | 0 | 0 | 0 | Targeted scenarios PASS |
| Database integration | 1 fixture | 0 | 0 | 0 | Real PostgreSQL fixture PASS |
| Tenant / IDOR | 149 route/method pairs plus applicable identifier/body probes | 0 | 0 | 0 | PASS for P0-01 |
| Role / permission | Owner/Partner/Advisor/Viewer role and effective-permission fixture paths | 0 | 0 | 0 | PASS for P0-06 |
| Security | 4 middleware tests / 27 scenarios plus domain coverage | 0 | Browser/security matrix | Full HTTP matrix | PARTIAL |
| Concurrency | Targeted race plus 100-request contention and same-key creation executed | 0 | 0 | Broader economic paths | PARTIAL |
| Idempotency | Contribution, transfer, capital-request, and distribution-preparation replay/creation executed; strategy allocation and mismatch assertions added | 0 | 0 | Expanded fixture execution | PARTIAL |
| Financial invariants | Domain coverage | 0 | 0 | Cross-domain and broader ledger cases | PARTIAL |
| Migration | Clean baseline and existing-schema preservation PASS | 0 | 0 | Rollback/forward-fix | PARTIAL |
| Browser E2E | Authenticated Clerk journey executed | 0 | 0 | 0 | PASS |

The default API command reports 93 passing tests and 27 intentionally skipped
database-backed tests without the certification URL. The certification runner
emits all seven in-scope P0 gates individually and exits nonzero whenever any P0
is not `PASS`. The expanded database-backed fixture and authenticated Clerk
browser journey were recorded with zero failures; the internal reliability
command passes implementation checks but remains fail-closed until its explicit
evidence gates are certified.

## P1 Internal Reliability Sprint

The sprint added durable safe-operation state, cross-view accounting reconciliation, provider-neutral reliability metric/alert definitions, and fail-closed Micro-Live recovery behavior. `pnpm run certify:internal-reliability` verifies the implementation and deterministic domain tests. It intentionally exits `2` when implementation checks pass but open evidence gates remain; this prevents implementation presence from being mistaken for certification.

| P1 area | Status | Evidence / limitation |
|---|---|---|
| Durable safe operations | IMPLEMENTED | Household-scoped job keys, transactional claims, retry/backoff, dead-letter, and stale-worker recovery are persisted; a restart-backed database fixture is still open |
| Accounting reconciliation | IMPLEMENTED | API exposes accounting-scope net worth and separate planning/Treasury/business/property statuses |
| Metrics and alerts | IMPLEMENTED | Provider-neutral names, severity levels, and fail-closed responses are committed; deployment sink/configuration remains open |
| Micro-Live durability | IMPLEMENTED | Recovery failure persists `FAILURE`, stops the session, opens an incident, and audits the transition; real transmission remains disabled |
| Rate-limit topology | DOCUMENTED | Shared store/trusted-proxy requirements are documented; current limiter is not a horizontal production guarantee |
| Contribution browser proof | OPEN | Exact `$250` allocation, reload, duplicate submission, and failure UX need a fresh approved authenticated Clerk browser run |
| Provider step-up | IMPLEMENTED / OPEN EVIDENCE | Server-side Clerk reverification and client retry flow are wired for protected actions; no approved browser evidence has been executed. A project owner with Clerk dashboard access must configure/confirm the supported factor in the approved Development environment and run the browser matrix. Session age, test headers, and invented OTPs are not used as proof. |
| Restore | DEFERRED | Refusal-first future verifier scaffold only; managed backup/restore is not a release gate and is not certified |

## Exact Repeatable Commands

```text
# Workspace typecheck
pnpm run typecheck

# API typecheck
pnpm --filter @workspace/api-server run typecheck

# API production build
pnpm --filter @workspace/api-server run build

# Frontend production build
pnpm --filter @workspace/capital-os run build

# Default API/domain/middleware/integration test command
pnpm --filter @workspace/api-server run test

# OpenAPI / Express route parity
pnpm --filter @workspace/api-server run check-contract

# Guarded disposable migration baseline
CAPITAL_OS_CERTIFICATION_DB_URL=<dedicated-url> \
CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1 \
pnpm run certify:migrations

# Full internal-candidate evidence command
pnpm run certify:production-candidate

# Internal reliability implementation and evidence boundary
pnpm run certify:internal-reliability

# Future restore verifier scaffold (refusal-first; never a certification)
pnpm run verify-future-restore
```

The final certification command exits `0` for the current recorded in-scope evidence. Any foundational check or in-scope gate failure remains fail-closed and exits nonzero.

## UI Persistence Truth

| Workflow | Classification | Current truth |
|---|---|---|
| Contribution | PERSISTED | Calls the server API; allocation, ledger, goal, Treasury relationship, and audit are server-owned; browser reload proof is certified for the exercised saved-account workflow, while contribution-specific browser allocation proof remains unexercised |
| Transfer quick action | PERSISTED when API-backed | Must use the validated transfer API; failed requests must not show local completion |
| Allocation edit | PREPARED / LOCAL-ONLY unless API-backed | No durable update is claimed without a fresh API read |
| Emergency Stop | PERSISTED only through risk API | If not wired to persisted risk state, it must be labeled preview/local-only; reload proof is open |
| Strategy note | LOCAL-ONLY / PREPARED | Does not claim a saved strategy record without an API write |
| Property note | LOCAL-ONLY / PREPARED | Does not create owned property or acquisition state |
| Accounting review | LOCAL-ONLY / PREPARED | No durable review artifact is claimed without an API write |
| Reports and exports | LOCAL-ONLY / READ-ONLY | No durable server report is claimed |
| Treasury request/review | PERSISTED / PREPARED | Request and review state persist; approval does not move money |
| Business distribution | PREPARED | Proposed/prepared state does not increase household cash |
| Micro-Live rehearsal | PERSISTED / DISABLED | Rehearsal may persist; real transmission remains disabled |

No reviewed local-only action claims that financial, legal, permission, or ownership state changed. The remaining persistence gaps are workflows not exercised by the authenticated browser run, including contribution-specific allocation metadata and cross-view reconciliation.

## Operations and Recovery

| Capability | Status | Current limitation |
|---|---|---|
| Liveness/readiness | PARTIAL | Separate endpoints and outage behavior are tested |
| Structured logs | IMPLEMENTED | Pino logs and correlation IDs exist |
| Scheduler / queue | IMPLEMENTED / PREPARED | Durable safe-operation jobs, transactional claims, retry/backoff, dead-letter, and stale-worker recovery exist; worker deployment/restart execution remains open |
| Retries | IMPLEMENTED / PREPARED | Bounded attempts and delayed retry timestamps are persisted; database-backed lifecycle execution remains open |
| Dead letter / escalation | IMPLEMENTED / PREPARED | Dead-letter state, persisted failures, incidents, and audit events exist; alert sink configuration remains open |
| Automation health | IMPLEMENTED | Safe action validation and failure counts derive from persisted job state |
| Reconciliation / Guardian | IMPLEMENTED / DISABLED | Failure state is durable and Guardian fails closed to `STOP`; real transmission remains disabled |
| Observability | IMPLEMENTED / PARTIAL | Provider-neutral metric names and alert responses are defined; external sink and retention configuration remain open |
| Audit retention | OPEN | Retention and shipping configuration are not recorded |
| Rate-limit deployment | OPEN | Shared multi-instance model is not recorded |

### Recovery procedure

- **Database failure:** keep liveness available, fail readiness closed, stop writes that require the database, preserve correlation IDs, and require human review before reopening.
- **Authentication failure:** deny protected requests, do not accept caller-supplied household or role headers, inspect Clerk configuration without exposing credentials, and reopen only after signed-out/signed-in identity checks pass.
- **Scheduler failure:** keep safe prepare-only actions non-executing, preserve durable failure state when available, prevent duplicate work through idempotency, and require human review before replay.
- **Security incident:** activate emergency/risk controls, deny cross-household and high-risk writes, preserve audit/correlation evidence, rotate affected provider credentials through the supported secret mechanism, and do not reconnect a venue or bank during investigation.
- **Financial integrity incident:** stop affected economic writes, reconcile debits and credits, inspect idempotency and audit records, preserve the original transaction boundary, and require human approval before any recovery action.

## AI Authority

AI can provide advisory analysis, explain deterministic outputs, summarize information, and propose research-oriented recommendations within the application’s advisory boundary.

AI cannot:

- move money or submit bank/ACH transactions;
- change protected-capital policy or unlock reserves;
- override risk governors;
- enable or transmit live trading;
- access or expose credentials;
- change household ownership or permissions;
- sign contracts or submit legal/chain transactions;
- autonomously scale a strategy.

**AI capital execution:** disabled.  
**AI risk override:** disabled.  
**AI credential access:** disabled.

## Micro-Live Status

| Attribute | Status |
|---|---|
| Readiness | Advisory/eligibility only |
| Execution status | **DISABLED BY DESIGN** |
| Venue transport | No reviewed real venue adapter; simulated adapter refuses place/cancel |
| Capital accessibility | Household and protected capital are unreachable by the execution boundary |
| Guardian state | Simulated fail-closed domain controls |
| Automation order authority | Disabled |
| AI order authority | Disabled |
| Remaining requirements | Additional persisted order-event, reconciliation-failure, incident-recovery, and provider review evidence before any future controlled integration |

## Execution Scope

The execution prompt represents a new trust boundary. It does not reinterpret the
existing internal certification as authorization for live trading.

| Scope | Certification status | Current state | Evidence boundary |
|---|---|---|---|
| Internal Core Certification | **PASS** | Ready for controlled internal use | Seven in-scope P0 gates remain certified; this scope is family-capital-only and non-executing |
| Micro-Live Certification | **BLOCKED** | **DISABLED** | The server-side rehearsal controls, OMS, Guardian, reconciliation, incident, and capital-isolation boundaries are implemented; no independently recorded provider evidence manifest, reviewed real venue, credential workflow, authenticated arming evidence, durable worker restart evidence, or real fills exist |
| Limited-Live Certification | **NOT CERTIFIED** | **LOCKED** | Graduation evidence is absent; no automatic scaling or promotion is permitted |

The controlled Micro-Live envelope is capped at $20 total capital, $10 venue
exposure, $10 strategy exposure, $5 market exposure, $1 per order, $5
inventory, a $0.75 daily soft loss, a $1.50 daily hard loss, and 4%/6%
soft/hard drawdown. Leverage, withdrawals, automatic refill, AI execution, and
automation-driven strategy discretion remain disabled. The new
`pnpm run certify:micro-live` command reports every ML-01 through ML-20 gate and
exits fail-closed when a critical gate is blocked or failed.

The certification command accepts only an operator-supplied, venue-bound
evidence manifest via `MICRO_LIVE_CERTIFICATION_EVIDENCE`. The manifest must
prove exactly one reviewed provider venue, one dedicated Micro-Live account,
manual funding of the approved envelope, read-only transport, durable restart
recovery, authenticated arming, and first-fill hold behavior. It must also
state `limitedLiveStatus: LOCKED`. The manifest contains evidence references,
not credentials or fabricated fills; without it the command remains
`BLOCKED` and Micro-Live remains `DISABLED`. See
`docs/MICRO_LIVE_CERTIFICATION_EVIDENCE.md`.

No real order, fill, venue credential, or funding action is claimed in this
report. Micro-Live remains disabled until a separately reviewed provider
integration and all critical execution evidence are completed. Limited-Live
remains locked regardless of rehearsal readiness.

## Release Gate

| Category | Status | Reason |
|---|---|---|
| Identity | PARTIAL | Clerk wiring, authenticated browser identity lifecycle, and signed-out rejection pass; provider-supported step-up remains open |
| Tenant isolation | PASS for P0-01 | All 149 discovered route/method pairs and applicable tenant-boundary probes pass in isolated PostgreSQL |
| Authorization | PASS for P0-06 | Role, effective-permission, membership, selection, tampering, and denied-action probes pass in isolated PostgreSQL |
| Origin / CSRF | PASS for published-origin boundary | Middleware matrix and five published-origin write-safety probes pass; authenticated browser journey is certified separately under P0-05 |
| Concurrency | PARTIAL | Targeted transfer race, 100-request contention with balanced ledger totals, concurrent capital-request creation, and concurrent distribution preparation pass; broader economic paths remain open |
| Idempotency | PASS for current keyed economic writes | All current keyed economic write paths pass same-key concurrency and mismatched replay checks in the isolated fixture |
| Migration | PASS for disposable existing-schema upgrade | Historical records, balances, statuses, and audit actor survived the additive current-schema upgrade |
| Browser E2E | PASS for P0-05 | Authenticated Clerk journey passed visible onboarding, saved-write reload, sign-out, repeat sign-in, and second-household isolation |
| Accounting | IMPLEMENTED / PARTIAL | Exact cents, empty-ledger safeguards, and explicit cross-view separation pass; source-data completeness remains limited |
| Operations | IMPLEMENTED / PREPARED | Durable queue lifecycle and fail-closed safe actions exist; restart-backed worker execution is not certified |
| Security | PARTIAL | Core middleware and domain boundaries exist; full route, secret, rate-limit, and production step-up proof is open |
| Micro-Live | PASS for disabled boundary | Real transmission and capital access remain disabled by design |

## Resolved During Hardening

These are listed as resolved only where current source and targeted test evidence support the claim:

1. **Contribution Goal IDOR:** goal lookup/update require the current household; foreign-goal contribution is rejected without a partial write.
2. **Fail-open origin policy:** production state-changing requests fail closed when no explicit allowed-origin policy is configured; cross-site writes are rejected. Five published-origin probes also passed.
3. **Transfer overdraft race:** tested parallel debits use an atomic balance condition and do not overdraw the source account.
4. **Contribution idempotency:** concurrent duplicate requests return the same persisted result rather than creating duplicate economic events.
5. **Treasury protected-capital lock:** decision logic uses persisted lock state.
6. **Empty-ledger false positive:** empty or zero-value ledger evidence does not count as reconciled.
7. **Micro-Live event relationship:** order-event persistence uses the order-intent relationship and validates sequences in the current tested boundary.
8. **OpenAPI security and parity:** Clerk bearer security/forbidden responses are represented and 149 route/method pairs pass parity. The shared authoritative inventory also checks the tenant evidence documents and fails clearly when a route addition leaves their counts stale.
9. **UI false-success claims:** reviewed local-only actions no longer claim that authoritative financial, legal, permission, or ownership state was saved.
10. **Clean migration baseline:** `CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1 pnpm run certify:migrations` reset and applied the generated baseline on the isolated Neon certification branch and verified representative tables with exit code `0`.
11. **High-contention transfer ledger:** the isolated PostgreSQL HTTP fixture completed 100 concurrent `$25` transfers from `$1,000`, produced 40 successes/60 overdraft rejections, ended at `$0`, and reconciled `$1,000` debits to `$1,000` credits.
12. **Capital-request and business-distribution idempotency:** concurrent same-key HTTP requests returned the same persisted record for each operation, created one row per operation, and recorded the authenticated actor in one audit event per created record.
13. **Published-origin certification:** missing, malformed, cross-site, allowed, and invalid-credential-origin write probes returned the expected fail-closed responses.
14. **Existing-schema upgrade preservation:** representative users, memberships, accounts, ledger entries, balances, transaction state, and audit actor survived the isolated additive upgrade.
15. **Current keyed-write idempotency breadth:** strategy allocation and mismatched replay cases were added to the isolated fixture; the full fixture passed with zero failures.
16. **Authenticated browser lifecycle:** the Clerk browser run passed visible first-user onboarding, household creation, saved-write reload, sign-out to the public boundary, repeat sign-in, and second-household isolation.

## Remaining Risks

### P0

No in-scope P0 risks remain. The seven in-scope P0 gates are certified.

### P1

| Issue | Impact | Current safeguard | Required fix | Release effect |
|---|---|---|---|---|
| Contribution-specific browser allocation proof is unexercised | The complete contribution allocation and cross-view reload assertions are not yet browser-certified | Authenticated browser lifecycle and server-side contribution tests pass | Add the contribution-specific browser assertions when the next browser certification run is available | P1 evidence gap; P0-05 current lifecycle gate is certified |
| Provider-supported Clerk step-up browser evidence absent | The implementation cannot be treated as certified without observing the provider flow | Clerk `auth.has({ reverification: "strict" })` plus client `useReverification()` | Run the approved Development browser matrix with a real supported factor and attach the result | P1; no high-risk production promotion |
| Durable worker restart evidence absent | A worker deployment could mishandle in-flight safe work | Durable job state, retry/backoff, dead-letter, and stale-worker recovery | Execute an isolated database-backed restart/claim/recovery fixture | P1 evidence gap |
| Metrics/alert sink configuration absent | Failures may not be detected or escalated outside the process | Provider-neutral metric names, severity, and fail-closed responses | Configure and verify the deployment sink and operator routing | P1 deployment block |
| Shared rate limiting not configured | Per-process controls may fail under multiple instances | No multi-instance claim | Record single-instance constraint or provide shared limiter/trusted proxy | P1 deployment block |
| Cross-view source completeness limited | Net worth and business reporting may diverge when external valuations are incomplete | Accounting API explicitly separates non-accounting scopes | Add approved source adapters and reconciliation evidence before relying on those valuations | P1 financial reporting risk |
| Micro-Live production integration not certified | A future venue integration would require stronger operational evidence | Real execution disabled; failures persist and stop | Keep disabled, then execute an isolated recovery/incident fixture before any controlled integration | P1 future-integration block |

### P2

| Issue | Impact | Current safeguard | Required fix | Release effect |
|---|---|---|---|---|
| Large frontend surface increases change risk | Future UI edits may regress persistence truth | Explicit UI matrix and source review | Decompose incrementally after P0 certification | No current promotion by itself |
| Some reports/documents remain local-only | Users may expect durable artifacts | UI labels classify them local/read-only | Add durable artifact workflow only with explicit product scope | No current financial authority |

### P3

No separately assessed P3 issue changes the current release decision. New product capabilities remain out of scope until the P0/P1 evidence gaps are closed.

## Authorized Current Scope

Within the current non-executing family-capital scope, Capital OS may be used for controlled evaluation of:

- household financial planning and budgeting;
- cash-flow review and goal planning;
- protected saving recommendations;
- Treasury recommendations and prepared requests;
- business operating tracking separated from household deployable capital;
- property underwriting and decision support;
- accounting review within the documented partial valuation scope;
- Strategy Lab research and eligibility review;
- advisory intelligence;
- prepare-only operational workflows;
- Micro-Live rehearsal and disabled-by-design safety review.

These uses remain subject to authentication, household scope, role/permission boundaries, human review, and the documented internal-only boundaries in this report.

## Prohibited / Disabled Scope

Capital OS is not authorized by this report to:

- move money through a bank or payment rail;
- submit ACH or automated withdrawals;
- execute live brokerage or venue orders;
- use protected capital for strategy, Treasury active allocation, business, opportunity, or Micro-Live;
- scale strategies automatically;
- accept or deploy outside investor capital;
- grant autonomous AI execution;
- withdraw or administer venue credentials;
- execute property contracts or tax filings;
- submit blockchain transactions.

## Deployment Requirements

| Requirement | Classification | Current status |
|---|---|---|
| Clerk production instance and supported step-up | Public release only | Reverification is implemented but not browser-certified; public release is out of scope |
| Managed PostgreSQL | Internal requirement | Must use the managed publication path and dedicated lifecycle evidence |
| Explicit allowed origins | Internal requirement | `CAPITAL_OS_ALLOWED_ORIGIN` is configured for `https://capital-os-fund.replit.app`; published-origin probes pass |
| Durable queue/scheduler | Public/operational expansion | Implemented/prepared; worker deployment and restart evidence remain open |
| Structured logging/correlation | Internal requirement | Implemented at current level |
| Audit retention/shipping | Public/operational expansion | Append-only application contract documented; external sink/retention not configured |
| Shared rate limiter or single-instance constraint | Public/operational expansion | Single-process internal constraint documented; shared store not configured |
| Alerting | Public/operational expansion | Metric/severity contract implemented; deployment routing not configured/evidenced |
| Real banking, ACH, live trading, blockchain | Future / prohibited for this certification | Disabled and out of scope |

## Final Determination

**Capital OS is qualified only as an internal-only candidate for its current non-executing family-capital scope.**

The reason is scope-based: all seven in-scope P0 gates are `PASS`. This does not authorize public release, external users, banking, live trading, or any other prohibited capability. Provider-supported step-up browser evidence, contribution-specific browser evidence, and deployment-level operational evidence remain open; the newly implemented reverification and reliability controls are explicitly not treated as certification until those evidence gates execute.
