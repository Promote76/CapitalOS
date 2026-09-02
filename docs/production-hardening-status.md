# Capital OS production hardening status

Updated: 2026-09-02

This release hardens the identity boundary and the most important operational controls without claiming that production readiness is complete. The status labels below are intentional. The dated certification in `docs/PRODUCTION_READINESS_AUDIT_2026-09-02.md` is the current source for the complete evidence table and ranked blockers.

## Status summary

### IMPLEMENTED

- Clerk middleware is mounted on the API and ClerkProvider is mounted on the web app.
- Browser auth uses Clerk cookies and same-origin API requests; the web client does not attach bearer tokens.
- Clerk users resolve to internal users through a unique external authentication identifier.
- Household membership and active role/permission resolution happen server-side before domain services run.
- Production requests without a valid Clerk session return `401 AUTHENTICATION_REQUIRED`.
- Authenticated users without an active household membership return `403 HOUSEHOLD_MEMBERSHIP_REQUIRED`.
- First-household onboarding is explicit, transactional, audited, and creates conservative non-executing defaults.
- Development keeps a seeded owner for local review. `X-Household-Role` is test-only and is not a production control.
- Authenticated household service context is request-scoped. New households do not receive Morgan demo balances or business activity.
- Liveness and readiness are separate: `/api/health/live` does not touch Postgres, while `/api/health/ready` verifies Postgres and returns `503` when unavailable.
- Correlation IDs are accepted only in a bounded safe format or generated server-side and returned in API responses.
- Micro-Live route bodies and parameters use generated validators. Real order transmission remains disabled.
- Drizzle has an explicit migration output for review and CI. Managed development schema changes use post-merge push and production schema changes use the Publish diff flow; API startup does not apply DDL.
- Existing financial, governance, exact-cents, idempotency, and Micro-Live domain tests pass.

### PARTIAL

- Fine-grained permissions currently load membership permissions into request context but enforce the centralized role map; effective per-membership grants/revocations are not yet applied.
- A user currently resolves to the first active household membership. Household switching and an explicit selected-household session claim remain to be implemented before multi-household users are enabled.
- Database row scoping is enforced by the request-scoped service context for many services, but the contribution goal path currently accepts a goal ID without a household predicate and remains a release-blocking IDOR risk.
- Account closure is modeled by the internal user status field and membership deactivation path, but deletion/export workflows and retention schedules are not yet complete.
- Operational rate limiting is process-local. A shared production limiter is still required for multi-instance deployments.
- The generated OpenAPI document includes the new auth and health routes, but auth response schemas and global security annotations should be expanded before external client publication.
- Backup and restore procedures are documented as release runbooks, but no operational backup evidence or isolated restore drill has been completed.
- UI actions outside contributions and existing transactional flows still include review-only/local presentation states; they are not presented as durable financial operations.

### BLOCKED

- Production onboarding cannot be verified end-to-end in this workspace without a real signed-in Clerk session.
- A production restore drill is blocked until the deployment owner provides an approved backup target and maintenance window.
- Shared rate limiting and centralized audit export are blocked on selecting the production infrastructure for those services.
- Production release is blocked by the contribution goal tenant-integrity defect, fail-open write-origin behavior, absent HTTP/database/browser/concurrency coverage, and unproven migration/restore lifecycle.

### NOT IMPLEMENTED

- Real venue transport, live order transmission, autonomous capital movement, and AI-controlled risk changes.
- Automated account deletion, legal retention enforcement, or irreversible personal-data erasure.
- Production bank aggregation or provider-specific credential storage.
- A full browser E2E suite against a deployed authenticated environment.

## Release gates

The hardening release is not safe to call complete until the following are true:

1. A signed-in user can complete onboarding, refresh, sign out, and sign back in while seeing only their household.
2. A second household cannot read or mutate the first household by changing path IDs, headers, or request bodies.
3. `/api/health/live` succeeds during a database outage and `/api/health/ready` fails closed with `503`.
4. A reviewed migration is applied through the release step and is recorded in the migration journal.
5. A backup is restored in an isolated database and the application passes the persistence truth audit.
6. The browser suite covers auth redirects, onboarding, viewer write rejection, idempotent contribution replay, CSRF/origin rejection, and disabled Micro-Live execution.

The current audit additionally requires the contribution goal IDOR to be fixed and a two-household HTTP authorization matrix to pass before this release can be considered a production candidate.

## Migration lifecycle

1. Change the Drizzle schema and run `pnpm --filter @workspace/db run generate`.
2. Review the generated SQL for destructive statements, data loss, enum changes, and lock duration.
3. Run the migration in a disposable or staging database and execute the API test suite.
4. Let the development post-merge setup apply the reviewed schema to the managed development database.
5. Re-publish the application so the Publish flow diffs and applies the reviewed schema to production; resolve any rename prompt explicitly.
6. Start the API only after schema publication; the API does not create tables or run migrations.
7. Record the migration tag, schema version, test result, and rollback/forward-fix decision in the release record.

## Backup and restore runbook

### Backup

- Use the managed Postgres provider's encrypted, point-in-time backup facility.
- Confirm the latest successful backup timestamp and retention window before a release.
- Export a schema/migration journal snapshot and the application release identifier into the release record.
- Do not treat a CSV export or application report as a database backup.

### Restore drill

- Restore into an isolated database with no public ingress.
- Apply only migrations newer than the restored backup.
- Run liveness/readiness, identity resolution, household isolation, ledger balancing, idempotency replay, and Micro-Live disabled-execution checks.
- Compare persisted contribution counts, ledger debits/credits, audit event counts, and active memberships with the source snapshot.
- Destroy the isolated restore only after evidence is attached to the release record.

### Incident recovery

- Freeze protected financial writes and Micro-Live arming first.
- Preserve correlation IDs, audit events, migration journal state, and database error logs.
- Prefer a forward fix or point-in-time restore over manually editing financial rows.
- Re-run the persistence truth audit before reopening writes.

## Persistence truth audit

For every visible action, the release reviewer must classify it as one of:

- **Persisted:** server response and a fresh read show the same durable state.
- **Prepared:** the server creates a reviewable record but does not execute the protected action.
- **Local-only:** the UI changes presentation state only and must not imply that money, permissions, or legal state changed.
- **Blocked:** the operation is deliberately rejected by auth, role, Governor, or disabled-execution controls.

Financial invariants remain server-side: integer-cent calculations, balanced ledger entries, household-scoped idempotency, protected-capital locks, no negative spendable cash, and no business-to-household bridge without human-reviewed distribution.

## Trust dashboard evidence

The trust dashboard should show the last liveness/readiness result, migration version, backup freshness, last restore drill, active Clerk/session boundary, membership count, audit write health, idempotency conflict count, job/automation health, and Micro-Live execution status. Until those signals are wired to durable operational telemetry, their status is `PARTIAL`, not `IMPLEMENTED`.