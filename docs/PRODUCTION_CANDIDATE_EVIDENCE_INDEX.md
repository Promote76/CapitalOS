# Capital OS production-candidate evidence index

**Evidence date:** 2026-09-02  
**Decision:** **NOT READY**

This index distinguishes executable evidence from source review and blocked infrastructure evidence. It must not be used to check a release-gate item unless the referenced evidence actually exists.

| Area | Evidence | Result | Gate state |
|---|---|---|---|
| Identity | Clerk middleware/provider source review; signed-out production-like request returns 401 | PASS at wiring/smoke level; real signed-in journey absent | OPEN |
| Tenant isolation | `src/integration/p0-http.test.ts` against PostgreSQL | Foreign goal denied; viewer write denied; two-household fixture passes | PARTIAL |
| Authorization | Membership lookup, effective permission list, role/domain tests | Server path exists; full role HTTP matrix absent | OPEN |
| Origin / CSRF | `src/middleware/safety.test.ts` | 24 state-changing-method/origin scenarios fail closed or continue as expected; full HTTP route matrix remains open | PARTIAL |
| Financial concurrency | Database-backed HTTP fixture | Targeted race passed previously; 100-request contention, ledger totals, and transfer replay are implemented but awaiting dedicated execution | PARTIAL |
| Idempotency | Contribution and transfer replay fixture paths; domain idempotency tests | Contribution proof exists; transfer path is instrumented; capital-request/distribution matrix absent | OPEN |
| Migration | Generated Drizzle SQL and migration journal inspection | No clean-zero or older-schema execution | BLOCKED |
| Backup / restore | Existing runbook only | No managed backup reference or isolated restore execution | BLOCKED |
| Browser E2E | Preview screenshot only | No authenticated Playwright journey | BLOCKED |
| Accounting | Exact-cent and empty-ledger domain tests | Empty evidence no longer reports reconciled; cross-view accounting remains partial | OPEN |
| Operations | Prepare-only domain tests and structured logs | No durable scheduler, restart recovery, or alert history | BLOCKED |
| Micro-Live | Domain safety tests and disabled adapter boundary | Real transmission remains disabled; full persistence-failure drill absent | PARTIAL |
| Build | Workspace typecheck, API/frontend builds, code generation, route parity | Passed | PASS |

## Commands

```text
pnpm run certify:production-candidate
```

The command runs code generation, typechecks, both production builds, default API tests, route parity, and—when `CAPITAL_OS_CERTIFICATION_DB_URL` points to a dedicated disposable PostgreSQL database—the database-backed HTTP fixture with role, mass-assignment, actor, contention, ledger, and replay assertions. It exits nonzero while required certification infrastructure gates remain open.
