# Capital OS production-readiness audit

**Audit date:** 2026-09-02  
**Baseline:** 2026-09-01 Capital OS Executive Summary & Technical White Paper  
**Audit mode:** Repository, schema, generated-contract, runtime, test, and documentation verification  
**Decision:** **NOT READY**

> **Certification update:** This audit is retained as the dated baseline and traceability record. The current certification evidence is in `docs/PRODUCTION_CANDIDATE_CERTIFICATION_2026-09-02.md` and supersedes baseline findings that describe the contribution goal IDOR, permissive origin behavior, absent HTTP fixture, and transfer race as current defects. Those controls now have implementation and targeted test evidence, while their broader certification gates remain explicitly open where coverage is incomplete.

## Executive decision

Capital OS is technically credible as a strong family-capital planning prototype and as a carefully constrained advisory system. It is not yet credible as a production-grade family-capital platform for multiple households or protected financial operations.

The deterministic financial domain is the strongest part of the system. The current production blockers are at the trust boundary around that domain:

1. The contribution goal lookup and update now require the current household, and the two-household fixture rejects a foreign goal ID before any write.
2. Production writes now fail closed when the allowed-origin policy is absent, and cross-site writes are rejected by the explicit origin/CSRF boundary.
3. Production schema lifecycle, backups, restore verification, and durable operations are documented but not executable and proven in this repository.
4. A real PostgreSQL two-household HTTP fixture now covers targeted IDOR, role spoofing, recent-auth, contribution idempotency, and concurrent transfer behavior. Full route, role, migration, restore, and browser coverage remains open.
5. Several production-facing actions remain presentation-only or prepared-only; the reviewed UI now labels those boundaries rather than claiming authoritative persistence.

The application should remain in hardening and controlled internal evaluation. It should not be released for real multi-household financial use until the P0 blockers are fixed and the release-gate checklist is evidenced.

## Evidence and environment

### Evidence types used

- Source-code inspection of Express middleware, routes, services, domain modules, frontend workflows, database schema, and generated artifacts.
- PostgreSQL schema inspection and managed-development schema push.
- Runtime HTTP requests against the managed development API.
- Isolated production-mode process tests with an intentionally unavailable database.
- Browser preview capture at 1440×1000.
- OpenAPI/React Query/Zod generation.
- Typechecks, production builds, and the existing Node domain test suite.
- Documentation and package/workflow inspection.

### Runtime results

| Check | Result | Evidence |
|---|---|---|
| Development API `/api` | PASS, `200` | Runtime request with development seed context |
| Development `/api/health/live` | PASS, `200` | `{"status":"ok"}` |
| Development `/api/health/ready` | PASS, `200` | PostgreSQL dependency reported `ok` |
| Development `/api/contributions` | PASS, `200` | Current and legacy rows returned; metadata normalized to objects |
| Production `/api/health/live` with unavailable DB | PASS, `200` | Process remains live without database |
| Production `/api/health/ready` with unavailable DB | PASS, `503` | `DATABASE_NOT_READY`, PostgreSQL unavailable |
| Production `/api/dashboard` signed out with `X-Household-Role: owner` | PASS, `401` | Header did not grant access |
| Browser preview | PASS with expected warning | Approved light UI rendered; only Clerk development-key warning remained |

The development `200` responses for household data are not production authentication evidence. They use the intentional development seed path. The production-like process test is the evidence for rejecting the development role header and unauthenticated household access.

## Baseline versus current state

| Area | September 1 state | Current state | Evidence | Change | Remaining risk | Status |
|---|---|---|---|---|---|---|
| Authentication | Clerk packages/keys existed, but no complete authenticated household bridge | Browser has `ClerkProvider`; API has Clerk middleware and production auth rejection | `artifacts/capital-os/src/App.tsx`; `artifacts/api-server/src/app.ts` and `middleware/request-context.ts`; production `401` smoke test | Resolved at wiring level | No real signed-in session was available for end-to-end verification | PARTIAL |
| Household identity | Seeded actor was the effective identity | Clerk external ID resolves to internal user and active membership; onboarding creates first household | `request-context.ts`; `routes/auth.ts`; `households.ts` | Partially resolved | First active membership is selected silently; no selected-household mechanism | PARTIAL |
| Tenant isolation | Not proven | Most services scope reads/mutations by request household; contribution goal path now has household predicates | `services/capital-os.ts`; `src/integration/p0-http.test.ts`; route matrix | Resolved for tested contribution path | Full caller-controlled identifier matrix remains open | PARTIAL |
| Role enforcement | Domain role helper existed, HTTP enforcement unproven | Protected routes resolve membership permissions server-side; test header is production-rejected | `domain/governance.ts`; `request-context.ts`; role matrix; HTTP fixture | Partially resolved | Full owner/partner/advisor/viewer route matrix and actor queries remain open | PARTIAL |
| Step-up authentication | Missing | Recent-auth middleware protects critical writes; test fixture proves missing step-up is rejected | `request-context.ts`; `ROLE_CERTIFICATION_MATRIX.md`; HTTP fixture | Partially resolved | Final Clerk re-authentication provider is not configured; production E2E remains open | PARTIAL |
| Database migrations | No visible lifecycle | One generated initial SQL artifact exists; package supports generate/push, not migration apply/rollback | `lib/db/migrations`; `lib/db/package.json`; `scripts/post-merge.sh` | Partially resolved | Clean apply from zero and existing-schema upgrade were not proven; post-merge uses push | BLOCKED |
| Database readiness | No liveness/readiness separation | Separate dependency-free liveness and PostgreSQL readiness endpoints | `routes/health.ts`; invalid-DB runtime test | Resolved for basic signal | No timeout, schema-version check, or operational alerting | PARTIAL |
| Backup / restore | Runbook absent or incomplete | Runbook exists, but no backup provider configuration, restore artifact, or drill evidence | `docs/production-hardening-status.md`; repository search | Documentation added | Restore is not executable/proven in this workspace | BLOCKED |
| Persistence truthfulness | UI/API boundaries were mixed | Contributions, business forms, treasury requests, operations, intelligence, and Micro-Live records persist; many quick actions remain local/prepared | `App.tsx`; domain services; page modules | Partially resolved | Export, emergency stop, transfer/strategy/property quick actions can show feedback without durable state | PARTIAL |
| OpenAPI contract integrity | Contract was incomplete | 108 route declarations and 108 OpenAPI operations; generated clients/Zod regenerate | `lib/api-spec/openapi.yaml`; route modules; Orval output | Resolved for count parity | No automated route-contract parity test; security schemes/requirements absent | PARTIAL |
| HTTP integration tests | None | One real PostgreSQL two-household fixture | `artifacts/api-server/src/integration/p0-http.test.ts`; certification command | Resolved for targeted scenarios | Full route response, IDOR, role, and failure matrix remains open | PARTIAL |
| Database integration tests | None | One database-backed HTTP fixture; no separate DB suite | Integration fixture and certification evidence index | Partially resolved | Clean migration, rollback, and broader constraint tests remain open | PARTIAL |
| Browser E2E tests | None | Still none | No Playwright/Cypress/browser test config or script | Unchanged | Onboarding, reload truth, sign-out, role rejection, and tenant navigation are unproven | MISSING |
| Concurrency tests | Pure race scenarios only | Real parallel contribution and transfer requests now execute against PostgreSQL | `src/integration/p0-http.test.ts` | Partially resolved | High-contention transfer and all economic-event idempotency types remain open | PARTIAL |
| Security tests | Domain safety cases existed | 17 security-themed domain cases plus dedicated origin middleware and targeted HTTP coverage | Governance, execution, treasury, finance tests; `safety.test.ts`; HTTP fixture | Partially resolved | Full HTTP IDOR, mass-assignment, invalid-session, secret-leak, and browser matrix remain open | PARTIAL |
| Operational scheduling | Manual operation endpoint only | No cron, queue, worker, or restart recovery for scheduled work | `services/operations.ts`; `routes/operations.ts`; repository search | Unchanged | Automation runs can disappear on restart; automation failure health is hardcoded to zero | MISSING |
| Observability | Structured logging only | Pino logging and correlation IDs exist | `lib/logger.ts`; `middleware/safety.ts`; runtime headers | Partially resolved | No metrics, traces, audit shipping, DB pool signals, queue lag, or alerting | PARTIAL |
| Accounting integrity | Domain accounting existed but was incomplete | API-backed overview and reconciliation fields exist | `services/accounting.ts`; accounting page | Partially resolved | Hardcoded real-estate/investment fields; business equity treatment disagrees across views; empty ledger can appear balanced | PARTIAL |
| Business / household separation | Boundary existed in domain model | Business IDs/accounts and reserve-floor distribution controls exist; UI labels separate books | `services/business.ts`; `pages/business.tsx` | Mostly resolved | No completed distribution bridge; liabilities and double-entry business postings incomplete | PARTIAL |
| Safe-to-Deploy integrity | Conservative calculation existed | Liquid-account calculation excludes business/protected planning balances and uses exact cents | `services/household-finance.ts`; finance domain tests | Mostly resolved | Fixed confidence/buffer and no cross-domain invariant test; related account-type paths need proof | PARTIAL |
| Micro-Live boundary | Simulated and disabled by design | Transmission remains disabled; real adapter registry empty; rehearsal/reconciliation persistence exists | `domain/execution-adapters.ts`; `services/micro-live.ts`; runtime/domain tests | Resolved for disabled boundary | Incident/order-event lifecycle has correctness gaps; no independent failure domain | PARTIAL |
| AI authority | Advisory-only design | Recommendations persist and decision routes record human decisions; forbidden actions remain blocked | `domain/intelligence.ts`; `domain/governance.ts`; intelligence service | Resolved for authority boundary | No external AI interface/abuse test; advisory data still needs full tenant test | PARTIAL |
| Automation authority | Restricted action list existed | Prepare-only actions and safe action validation persist runs | `domain/operations.ts`; `services/operations.ts` | Resolved for authority boundary | No durable scheduler; health does not derive from actual failures | PARTIAL |

## Authentication and identity certification

### Verified implementation

The browser mounts Clerk through `ClerkProvider`, branded sign-in/sign-up routes, and a public/authenticated boundary. The API mounts Clerk middleware before request-context resolution. The server:

1. obtains the external Clerk user ID;
2. resolves or creates the internal user by `externalAuthId`;
3. rejects inactive users;
4. loads active household memberships;
5. selects the first active membership;
6. places the household and role into request-scoped context;
7. passes the actor into protected routes and services.

Onboarding derives the user identity from the authenticated request and creates the household, owner membership, conservative settings, and audit record server-side.

### Header privilege attack

| Scenario | Result |
|---|---|
| Development request with `X-Household-Role` | Accepted intentionally for local/test role exercises |
| Production-mode request without Clerk session and `X-Household-Role: owner` | `401 AUTHENTICATION_REQUIRED`; no privilege escalation |
| Browser-supplied household/user IDs in onboarding | Not accepted as authority; server creates identity and ownership |

The development bypass must remain clearly isolated from production configuration. It is not evidence of production role enforcement by itself.

### Identity gaps

- No real Clerk session was available, so the full signed-in browser journey remains unverified.
- A user with multiple active memberships is silently assigned the first one.
- `GET /api/auth/me` returns membership data without a demonstrated selected-household policy.
- Stored `permissions` are loaded into request context but authorization currently checks the role map rather than the stored per-membership permissions.
- Many audit writes use the seeded/request owner ID rather than the authenticated actor ID. This damages audit attribution even where the authorization decision is correct.

## Tenant isolation and IDOR certification

Most services use household-scoped predicates. Examples include account transfers, finance records, business records, strategies, Micro-Live venues/incidents, and operations objects. That is positive evidence, but it is not enough for certification.

### Release-blocking finding: contribution goal cross-tenant write

`recordContribution` in `artifacts/api-server/src/services/capital-os.ts`:

- accepts `goalId` from the request;
- selects `goals` by `goals.id` only;
- does not require `goals.householdId = current household`;
- later updates that goal by ID only.

The contribution and ledger destinations are selected from the current request household, but the foreign goal can be associated with the contribution and have its progress/protected amount incremented. This is a cross-household write path if an attacker obtains another goal UUID. The current repository has one seeded development household, so a live two-household exploit was not executed; the code path is sufficient to keep the release blocked.

### Other isolation limitations

- Services commonly resolve IDs through `ensureSeedData`, which makes development/test context effectively process-global and prevents meaningful multi-household test coverage.
- Property candidate creation validates the current property goal ID but should enforce the parent household at the service/database boundary as defense in depth.
- Several child update statements rely on a prior scoped select instead of repeating the household predicate in the update.

## Role certification matrix

This is the intended role behavior from the current centralized role map, not an authenticated HTTP certification. “Partial” means a server path exists but the full membership permission model or HTTP proof is incomplete.

| Action | Owner | Partner | Advisor | Viewer |
|---|---:|---:|---:|---:|
| View finances | Yes | Yes | Restricted balance semantics | Yes |
| Edit budget | Yes | Yes | No | No |
| Create contribution | Yes | Yes | No | No |
| Submit capital request | Yes | Yes | No | No |
| Approve capital request | Yes | No | No | No |
| Change Treasury policy | Yes | No | No | No |
| Manage business | Yes | Yes | No | No |
| Edit property | Yes | Yes | No | No |
| Promote strategy | Yes | No | Recommendation/review only | No |
| Enable Micro-Live | Gate/role required, but step-up absent | No | Review permissions only | No |
| View accounting | Yes | Yes | Partial/restricted | Yes |
| Export accounting | No durable export workflow | No durable export workflow | No durable export workflow | No durable export workflow |
| Manage household | Yes | No | No | No |

The matrix must not be treated as a release certification until HTTP tests exercise each role against the real route stack.

## Step-up authentication

**Status: MISSING.**

There is no recent-auth timestamp, reauthentication requirement, MFA assertion, step-up middleware, or equivalent session claim enforcement for:

- protected-capital policy changes;
- Treasury policy changes;
- high-impact capital approvals;
- ownership changes;
- permission changes;
- Micro-Live venue review or arming;
- future credential management.

Micro-Live arming uses role permission and logical gates, but its execution remains disabled by design. Disabled execution lowers immediate financial risk; it does not replace step-up controls for future enablement.

## Database lifecycle, readiness, backup, and recovery

### Migration lifecycle

The repository contains one generated initial SQL artifact and Drizzle metadata. The database package exposes:

- `generate`;
- `push`;
- `push-force`.

There is no migration-apply script, rollback mechanism, migration status check, clean-database test, or existing-schema upgrade test. The generated initial migration was attempted against the existing development database and failed because the database already contained the schema. The managed-development schema was then synchronized through the supported development push flow.

The current supported boundary is:

- generated SQL is reviewed and used for CI/release evidence;
- managed development changes flow through post-merge push;
- production changes flow through Publish;
- the API never runs DDL.

This is safer than startup DDL but does not satisfy the audit’s reproducible migration requirement.

### Readiness

The invalid-PostgreSQL runtime test passed:

- liveness remained `200`;
- readiness returned `503` with `DATABASE_NOT_READY`;
- unauthenticated private data remained `401`.

The readiness probe is still minimal: it executes `select 1` without a timeout, schema-version assertion, dependency latency metric, or alert.

### Backup and restore

The repository contains a runbook describing managed PostgreSQL point-in-time backups and isolated restore checks. It does not contain:

- a configured backup target;
- backup freshness evidence;
- retention/RPO/RTO evidence;
- an isolated restored database;
- a restore test result;
- automated restore verification.

**Restore result: NOT EXECUTABLE in this audit environment.**

## Persistence truth audit

### Server-persisted or prepared flows

| Surface | Classification | Evidence / caveat |
|---|---|---|
| Contributions | SERVER-PERSISTED | API transaction writes allocation metadata, ledger movements, goal progress, and audit; idempotency key is stored |
| Transfers | SERVER-PERSISTED but concurrency-risky | API transaction and ledger writes exist; balance precheck is not atomic under concurrent requests |
| Goals | READ-ONLY / PARTIAL | Goal read is API-backed; contribution updates progress; broader goal-edit workflow is not complete |
| Treasury requests | SERVER-PERSISTED / PREPARED | Request and approval records persist; no automatic money movement |
| Business revenue/expenses | SERVER-PERSISTED | Frontend mutations call API and invalidate overview |
| Business distributions | PREPARED | Proposed distribution persists; completed owner distribution bridge is absent |
| Operations tasks/alerts/approvals | SERVER-PERSISTED | CRUD and review records persist; scheduler is absent |
| Intelligence | SERVER-PERSISTED / ADVISORY | Refresh, decisions, and feedback persist; no capital authority |
| Micro-Live rehearsal/reconciliation/reviews | SERVER-PERSISTED / DISABLED BY DESIGN | No real venue transport or order transmission |
| Accounting overview | READ-ONLY / PARTIAL | API-backed but valuation/liability completeness is not established |

### Local-only or presentation-only actions

| Surface/action | Classification | Product-truth concern |
|---|---|---|
| Dashboard Export view | LOCAL-ONLY | Toast says snapshot prepared; no export artifact is persisted |
| Dashboard allocation menu/edit | LOCAL-ONLY / PARTIAL | Visible action does not establish a durable allocation update in that path |
| Dashboard emergency stop | LOCAL-ONLY | React state and toast; no server stop mutation |
| Quick-action transfer | LOCAL-ONLY / BROKEN WORKFLOW | Modal completes through shared UI callback, but only contribution calls the API |
| Quick-action strategy/property note | LOCAL-ONLY | Presentation feedback without authoritative record |
| Accounting Prepare review | LOCAL-ONLY | Feedback only; no review/export record |
| Treasury stress test | SIMULATED | Scenario analysis only |
| Reports/Documents/Insights empty-state create actions | PRESENTATION ONLY | Route opens a review/note path rather than a durable report/document/insight workflow |
| Hardcoded dashboard/goals trajectory values | PRESENTATION ONLY | Seed/presentation values are not all read from authoritative state |

No current finding shows a protected financial write falsely committed after a failed API response. The more common product-truth issue is that a review/preparation/local action is broad enough to be mistaken for a persisted business workflow.

## Financial and accounting certification

### Positive controls

- PostgreSQL money columns use `numeric(18,2)`.
- Service calculations use integer cents.
- Contribution allocation preserves configured split totals.
- Ledger movement and audit writes are generally placed in one transaction.
- Protected capital and AI forbidden-action checks exist in deterministic server/domain code.
- Business cash is excluded from household Safe-to-Deploy by the current source selection.
- Micro-Live rejects protected-capital reachability and real order transmission.

### Remaining integrity findings

1. **Accounting completeness:** real estate and investment fields are hardcoded to zero; business equity treatment differs between accounting and business views; liabilities are incomplete.
2. **Business distribution bridge:** proposed distributions are not actual reviewed household income transfers and business domain calculations do not post full double-entry entries.
3. **Safe-to-Deploy confidence:** fixed buffer and confidence values are conservative but not derived from operational data; no cross-domain invariant suite proves every path cannot increase Safe-to-Deploy improperly.
4. **Audit attribution:** server actor context is wired, but the complete role/action audit query suite remains open.
5. **Concurrency breadth:** the atomic transfer path and targeted race pass; high-contention transfer and all economic-event idempotency types remain to be certified.

## Micro-Live, AI, and automation authority

### Micro-Live

The real execution boundary is still safe:

- simulated adapter refuses place/cancel;
- rehearsal explicitly reports no transmission;
- reviewed adapter registry is empty;
- real venue reconciliation is rejected;
- snapshot reports no household/protected capital or AI order authority.

The boundary is **DISABLED BY DESIGN**, not production trading readiness. Additional correctness gaps remain:

- order-event timeline lookup uses a session ID against an order-intent foreign key;
- no service/route ingests and validates persisted order-event sequences;
- nullable external event IDs allow duplicate events without an external identifier;
- reconciliation can lose durable evidence if persistence fails after venue fetch/disconnect;
- incident completion does not independently recreate/enforce a recovery session.

### AI

AI is advisory-only in the deterministic domain. Recommendations and human decisions persist, and forbidden actions include moving money, changing protection, overriding risk, trading, credentials, and contracts. No AI path was found that can directly execute a protected financial action.

### Automation

Safe action validation blocks capital movement, protected-capital unlocks, Micro-Live enablement, ownership changes, contracts, and offers. Runs are recorded as `PREPARED`. There is no durable executor or scheduler, so automation authority is constrained but operational delivery is incomplete.

## OpenAPI and generated-client audit

| Check | Result |
|---|---|
| Route method declarations | 108 across 17 route modules |
| OpenAPI operations | 108 |
| Operation IDs | 108 |
| React Query API functions | 108 |
| React Query hook exports | 61 |
| Zod generated output | Regenerated successfully |
| OpenAPI → Orval → React Query/Zod | PASS |
| Automated route-contract parity test | PASS — 108 route/method pairs |
| Global `securitySchemes` / security requirements | PASS — Clerk bearer security with health opt-outs |
| Auth response contract depth | PARTIAL |

The contribution response contract was tightened to include allocation metadata. Legacy null metadata is normalized to `{}` at the service boundary, and the endpoint was runtime-verified at `200`.

## Test inventory

The default test command runs domain, middleware, and integration files. The database-backed fixture is intentionally skipped unless `CAPITAL_OS_RUN_INTEGRATION=1` is set; the production-candidate certification command requires a dedicated certification database before counting it as release evidence.

| Test category | Files/cases | Result |
|---|---:|---|
| Pure domain tests | 11 files / 62 cases | 62 passed, 0 failed, 0 skipped, 0 todo |
| HTTP integration tests | 1 targeted fixture | Passes with dedicated database and TypeScript runner |
| Database integration tests | 1 database-backed fixture | Passes for targeted scenarios; no separate lifecycle suite |
| Browser E2E tests | 0 | Blocked; authenticated environment unavailable |
| True concurrency tests | 2 targeted request races | Contribution idempotency and transfer overdraft pass |
| Migration tests | 0 executed | Guarded clean-baseline tooling exists; dedicated database unavailable |
| Dedicated security suites | 3 middleware cases plus integration | Full IDOR/origin/browser matrix remains open |
| Recovery tests | Pure OMS/recovery scenarios inside domain suite | Not real DB/venue recovery |
| Security-themed domain cases | 17 cases across 4 files | Passed as part of 62 |

The 62 passing cases are valuable financial and safety-domain evidence. The targeted HTTP fixture adds real PostgreSQL evidence, but neither suite certifies every route, browser journey, migration, restore, or production-operational boundary.

## Build verification

| Check | Result |
|---|---|
| Library typecheck | PASS |
| API typecheck | PASS |
| Frontend typecheck | PASS |
| API production build | PASS |
| Frontend production build | PASS |
| Mockup production build | PASS with `PORT=8081 BASE_PATH=/` |
| OpenAPI generation | PASS |
| React Query generation | PASS |
| Zod generation | PASS |
| `git diff --check` | PASS |

The mockup build requires the managed preview environment variables when invoked directly. This is a documented environment requirement, not an application compile failure.

## Security and operations audit

### P0 blockers after certification update

| Problem | Evidence | Impact | Exact fix | Required proof |
|---|---|---|---|---|
| Cross-tenant contribution goal write | **RESOLVED** — current-household predicates are enforced in select/update | Targeted foreign-goal mutation is rejected | Keep route matrix and foreign-parent regression coverage current | `src/integration/p0-http.test.ts` |
| Write-origin control is fail-open | **RESOLVED for missing-policy/cross-site cases** — production writes fail closed | Targeted browser-origin attacks are rejected | Complete malformed/allowed-origin/browser matrix | `src/middleware/safety.test.ts` |
| Production data lifecycle not proven | Push-only package/post-merge flow; migration apply-from-zero failed against current DB; no rollback/restore evidence | Schema drift or data recovery failure can corrupt availability and trust | Establish a supported baseline/version strategy compatible with managed development push and Publish; run clean and upgrade tests; execute isolated restore drill | Migration and restore evidence attached to release |
| Multi-tenant authorization not certified | Targeted two-household HTTP fixture exists; full route matrix remains open | Unreached identifier paths may regress | Complete route-level authorization, role, and mass-assignment matrix | `docs/TENANT_ISOLATION_ROUTE_MATRIX.md` |

### P1 risks

1. Full high-contention transfer and economic-event idempotency coverage remains open.
2. Stored membership permissions are wired into centralized checks; explicit grant/revocation HTTP proof remains open.
3. Temporary recent-auth middleware exists; provider-supported Clerk step-up remains unconfigured.
4. No durable scheduler/queue/worker; automation health is hardcoded to zero failures.
5. No metrics, traces, audit shipping, or operational alerting beyond structured logs.
6. Accounting/business equity/liability treatment is incomplete and inconsistent.
7. Micro-Live order-event association and reconciliation failure persistence are incorrect/partial.
8. Many local/prepared UI actions are not durable workflows.
9. Per-process IP rate limiting is not safe for horizontal deployment and has no eviction/Retry-After.
10. Venue credential references and configuration state lack demonstrated vault, rotation, and access-audit boundaries.

### Secret leak audit

No raw credentials, private keys, Plaid tokens, or authorization tokens were found in the inspected source or generated API output. Logger redaction covers authorization and cookie headers. The remaining risk is architectural: venue credential references are stored and credential configuration state is exposed more broadly than a fully isolated secret-management boundary would permit.

### Origin, rate-limit, and failure-mode results

- Liveness is independent from PostgreSQL and passed during an invalid-DB process test.
- Readiness fails with `503` when PostgreSQL is unavailable.
- Production private routes reject signed-out requests even when the role header is present.
- Origin enforcement is conditional on configuration and therefore not release-safe by default.
- Rate limiting is process-local, IP-based, has no shared store, and has no demonstrated eviction or `Retry-After`.
- API errors include correlation IDs and generated validation rejects malformed request bodies/parameters.
- Financial authority is generally fail-closed at domain guards, but the tenant goal path and race conditions prevent certification.

## Feature maturity matrix

| Module | UI state | API state | Persistence | Auth | Tenant isolation | Tests | External integration | Production readiness |
|---|---|---|---|---|---|---|---|---|
| Dashboard | IMPLEMENTED / mixed | IMPLEMENTED | PARTIAL | PARTIAL | PARTIAL | Domain only | None | PARTIAL |
| Budget | IMPLEMENTED | IMPLEMENTED | SERVER-PERSISTED for supported writes | PARTIAL | PARTIAL | Domain only | None | PARTIAL |
| Cash Flow | IMPLEMENTED | IMPLEMENTED | READ-ONLY | PARTIAL | PARTIAL | Domain only | None | PARTIAL |
| Accounts | IMPLEMENTED | IMPLEMENTED | READ-ONLY | PARTIAL | PARTIAL | Domain only | None | PARTIAL |
| Transactions | IMPLEMENTED | IMPLEMENTED | SERVER-PERSISTED for supported records | PARTIAL | PARTIAL | Domain only | None | PARTIAL |
| Accounting | IMPLEMENTED | IMPLEMENTED | READ-ONLY / PARTIAL | PARTIAL | PARTIAL | Accounting domain only | None | PARTIAL |
| Goals | IMPLEMENTED | IMPLEMENTED | PARTIAL | PARTIAL | BLOCKED by goal IDOR | Domain only | None | BLOCKED |
| Treasury | IMPLEMENTED | IMPLEMENTED | PREPARED | PARTIAL | PARTIAL | Treasury domain only | None | PARTIAL |
| Properties | IMPLEMENTED / decision support | IMPLEMENTED | PARTIAL | PARTIAL | PARTIAL | Property domain only | None | PARTIAL |
| Business | IMPLEMENTED / mixed | IMPLEMENTED | SERVER-PERSISTED / PREPARED | PARTIAL | PARTIAL | Business domain only | None | PARTIAL |
| Strategies | IMPLEMENTED / research UI | IMPLEMENTED | SERVER-PERSISTED / advisory | PARTIAL | PARTIAL | Strategy domain only | None | PARTIAL |
| Micro-Live | IMPLEMENTED safety UI | IMPLEMENTED | SERVER-PERSISTED rehearsal/review | PARTIAL | PARTIAL | Strong pure safety tests | Real venue disabled | DISABLED BY DESIGN |
| Operations | IMPLEMENTED | IMPLEMENTED | SERVER-PERSISTED / PREPARED | PARTIAL | PARTIAL | Operations domain only | No durable scheduler | PARTIAL |
| Insights | IMPLEMENTED / mixed | IMPLEMENTED | ADVISORY / PARTIAL | PARTIAL | PARTIAL | Intelligence domain only | None | PARTIAL |
| Portfolio | IMPLEMENTED | IMPLEMENTED | READ-ONLY | PARTIAL | PARTIAL | Domain only | None | PARTIAL |
| Risk | IMPLEMENTED | IMPLEMENTED | SERVER-PERSISTED state | PARTIAL | PARTIAL | Domain/governance only | None | PARTIAL |
| Settings | IMPLEMENTED / mixed | PARTIAL | PARTIAL | PARTIAL | PARTIAL | No HTTP tests | None | PARTIAL |
| Reports | PRESENTATION ONLY | READ-ONLY / PARTIAL | LOCAL-ONLY | PARTIAL | PARTIAL | None | None | MISSING |
| Documents | PRESENTATION ONLY / notes | PARTIAL | PARTIAL | PARTIAL | PARTIAL | None | None | MISSING |
| Security | PRESENTATION / middleware | PARTIAL | Audit events and logs | PARTIAL | PARTIAL | Domain only | Clerk present | PARTIAL |

## Documentation truth audit

### Corrected during this audit

- `docs/capital-os-architecture.md` no longer says production defaults to a viewer actor. It now states that production requires Clerk identity and returns `401` without a session.
- The architecture document no longer describes concurrent transfer safety as complete; it records the unresolved balance race.
- The architecture verification command labels database push as managed-development-only and points to this audit for unverified boundaries.
- `docs/production-hardening-status.md` remains intentionally conservative and is superseded for the complete current finding set by this report.

### Remaining aspirational language

- “Atomic” must be read as transaction grouping, not proof against concurrent overdraft.
- “Reconciled” must not be treated as complete accounting truth while valuation/liability coverage is partial.
- “Prepared” and “advisory” are not completed financial/legal actions.
- “Micro-Live” readiness does not imply execution enablement.

## Failure-mode review

| Subsystem | If it fails | Current behavior | Assessment |
|---|---|---|---|
| Authentication | Clerk/session unavailable | Protected production route rejects access | FAIL CLOSED for data access |
| Database | PostgreSQL unavailable | Liveness stays up; readiness returns `503`; data route cannot be certified | GOOD boundary, minimal telemetry |
| AI provider | Advisory refresh unavailable | Existing persisted view/error handling remains; no financial authority | FAIL CLOSED for capital authority |
| Bank provider | No provider configured | Manual/CSV-first architecture; no autonomous movement | DISABLED / safe |
| Job queue | Process restarts | No durable scheduler exists, so scheduled work is absent | INCOMPLETE |
| Market data | Stale/unavailable | Micro-Live domain gates stale data and blocks exposure | FAIL CLOSED in pure domain |
| Guardian | Stale/disagreement | Domain controls stop/lock exposure | SIMULATED, same failure domain |
| Frontend | API unavailable | Local review state can remain visible with status messaging | Must distinguish read-only/local from persisted |

## Production trust score

**46 / 100 — release-blocked, not an average-based approval.**

| Dimension | Score | Basis |
|---|---:|---|
| Identity | 60 | Clerk bridge and production rejection exist; no real session E2E |
| Tenant isolation | 25 | Broad scoping, but a concrete cross-tenant goal write exists |
| Authorization | 42 | Role gates exist; stored permissions/step-up/HTTP proof are incomplete |
| Database lifecycle | 25 | Generated artifact and managed flow; no reproducible migration proof |
| Financial integrity | 68 | Strong exact-cents/domain invariants; accounting/race gaps remain |
| Persistence | 56 | Several server-backed workflows; many local/prepared actions |
| Integration testing | 35 | 62 domain cases plus targeted PostgreSQL HTTP/concurrency evidence; browser and lifecycle suites remain open |
| Security | 38 | Useful middleware and domain restrictions; origin/IDOR/secret architecture gaps |
| Operations | 22 | Persisted records but no durable scheduler or executor |
| Recovery | 18 | Runbook only; no restore drill |
| Observability | 35 | Structured logs/correlation IDs, no metrics or alerting |

The score cannot override the P0 blockers.

## Changes since September 1, 2026

| Previous gap | Result |
|---|---|
| Authentication | PARTIALLY RESOLVED |
| Tenant isolation | PARTIALLY RESOLVED, with a new confirmed goal-IDOR blocker |
| Production schema lifecycle | PARTIALLY RESOLVED; still incomplete |
| Persisted workflows | PARTIALLY RESOLVED |
| Integration coverage | UNCHANGED |
| Operations durability | UNCHANGED |
| Accounting completeness | UNCHANGED / clarified |
| Frontend organization | UNCHANGED; `App.tsx` remains a high change-risk file |
| Provider workflow discoverability | UNCHANGED; no real provider connection |

### Regression review

No visual regression was found in the captured preview. One contract regression was discovered during the audit: making contribution metadata required exposed legacy null rows and produced `400` responses. The service boundary now normalizes those legacy rows to `{}`.

The hardening work also increased authorization complexity without yet providing a complete HTTP test harness. That is not a functional regression, but it increases the risk of future context propagation mistakes.

## Recommended next phase

**Continue hardening before adding new product features.**

Priority order:

1. Complete HTTP fixtures for every household-scoped identifier, all roles, mass assignment, origin variants, and economic-event idempotency.
2. Execute the guarded clean migration baseline and add an older-schema upgrade/data-preservation path.
3. Perform an approved isolated backup/restore drill.
4. Replace temporary recent-auth freshness with provider-supported Clerk step-up and complete actor-attribution queries.
5. Add durable scheduling/queue infrastructure and operational telemetry.
7. Add durable scheduling/queue infrastructure and operational telemetry.
8. Only then expand reporting, provider integrations, or controlled Micro-Live preparation.

Do not choose a real bank connection, live trading, ACH, or autonomous AI execution as the next build target while the current trust boundary remains uncertified.

## Exact audit files

### Created

- `docs/PRODUCTION_READINESS_AUDIT_2026-09-02.md`
- `docs/PRODUCTION_RELEASE_GATE.md`

### Updated

- `docs/capital-os-executive-summary-white-paper.md`
- `docs/capital-os-executive-summary-white-paper.html`
- `docs/capital-os-architecture.md`
- `docs/production-hardening-status.md`
