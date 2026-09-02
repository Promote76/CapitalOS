# Capital OS P0 remediation report

**Date:** 2026-09-02  
**Release decision:** **NOT READY**  
**Scope:** Focused remediation sprint following the production-readiness audit.

## Remediation completed in this sprint

### Tenant isolation and authorization

- Contribution goal lookup and goal progress update now require both the caller's household ID and the goal ID.
- Internal capital movement validates both account IDs against the current household before creating a ledger transaction.
- Protected risk, recommendation, property, strategy, operations, business, Treasury, and Micro-Live child-record updates now include household predicates where the caller supplies an identifier.
- Business reserve and property-candidate writes use server-owned identity/relationship fields rather than trusting body-owned record IDs.
- Membership permissions are now effective for request authorization; when a request has an active security context, permission checks use the stored effective permission set instead of only the role label.
- Protected account balances are redacted from the accounts endpoint for roles that cannot view them.
- Audit writes on contribution, transfer, strategy allocation, recommendation, emergency-stop, and property-note actions use the authenticated actor ID rather than the household owner ID.

### Financial concurrency and invariants

- Source-account debits use a conditional SQL update, so concurrent transfers cannot overdraw an account.
- Contribution, transfer, and strategy-allocation idempotency checks acquire a PostgreSQL transaction advisory lock before reading or writing the economic event.
- Empty or zero-value ledger evidence is no longer considered balanced.
- Treasury decision logic reads the persisted Risk Governor protected-capital lock instead of hardcoding an unlocked state.

### Request and contract boundaries

- Missing production write-origin configuration now fails closed.
- Cross-site browser writes are rejected with an explicit CSRF error.
- High-risk authenticated writes require recent authentication; the test-only database fixture has a separate step-up proof and production Clerk sessions use the issued-at freshness window.
- OpenAPI now declares the Clerk session and recent-authentication security boundaries.
- An executable route/method parity check covers all 108 Express route/method pairs.

### Micro-Live correctness

- Snapshot event reads resolve order events through order intents belonging to the session and household.
- Venue fills discovered during reconciliation are persisted as idempotent fill snapshots.
- Reactivation requirement completion scopes its incident query by household.
- Real venue transmission, household-capital access, and protected-capital access remain disabled.

## Automated evidence

Passing checks:

- API typecheck.
- API production contract parity check: 108 route/method pairs.
- 65 passing automated tests in the default API test command.
- Origin-policy and CSRF middleware tests.
- Empty-ledger accounting invariant test.
- Authenticated two-household HTTP fixture covering cross-household goal IDOR, role-header spoof resistance, viewer denial, recent-auth denial, concurrent contribution idempotency, and concurrent transfer overdraft prevention. It passes against the managed development database when run with the repository TypeScript runner; it is skipped in the default isolated test command because it creates temporary PostgreSQL fixtures.
- `git diff --check`.

The database-backed fixture was run with:

```text
cd artifacts/api-server
CAPITAL_OS_RUN_INTEGRATION=1 NODE_ENV=test CAPITAL_OS_TEST_CONTEXT=1 node ../../node_modules/.pnpm/tsx@4.23.1/node_modules/tsx/dist/cli.mjs --test src/integration/p0-http.test.ts
```

## Evidence still required

The following gates remain open and prevent a release claim:

- Execute the database-backed two-household HTTP suite in an isolated CI database and attach its output.
- Add and execute a true concurrent transfer test proving no overdraft and balanced ledger rows.
- Add coverage for every route with a caller-controlled identifier, including all finance, operations, business, property, strategy, Treasury, and Micro-Live paths.
- Prove clean-schema creation, existing-schema upgrade, rollback/forward-fix behavior, and restore integrity using the managed PostgreSQL lifecycle.
- Run an isolated managed backup/restore drill.
- Run authenticated browser E2E journeys for sign-in, onboarding, reload, household isolation, role behavior, and persisted writes.
- Replace the Clerk issued-at freshness boundary with the production Clerk step-up/re-authentication provider once that provider flow is configured and evidenced.
- Add durable scheduler/queue retry, restart recovery, dead-letter, and operational telemetry evidence.
- Reconcile accounting treatment across liability, real-estate, investment, and business-equity views.

The release gate therefore remains **NOT READY**. No checklist item is marked complete without runtime or environment evidence.