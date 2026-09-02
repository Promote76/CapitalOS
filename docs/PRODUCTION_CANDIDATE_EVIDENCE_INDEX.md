# Capital OS production-candidate evidence index

**Evidence date:** 2026-09-02  
**Decision:** **NOT READY**

This index distinguishes executable evidence from source review and blocked infrastructure evidence. It must not be used to check a release-gate item unless the referenced evidence actually exists.

| Area | Evidence | Result | Gate state |
|---|---|---|---|
| Identity | Clerk middleware/provider source review; signed-out production-like request returns 401 | PASS at wiring/smoke level; real signed-in journey absent | OPEN |
| Tenant isolation | `src/integration/p0-http.test.ts` against PostgreSQL | Prior targeted two-household fixture passes; 108-route preflight added, but valid owned/foreign object cases remain incomplete and latest run skipped | PARTIAL |
| Authorization | Membership lookup, effective permission list, role/domain tests | Representative role/grant/revoke/membership/selection/tampering preflight added; complete action matrix remains open and latest run skipped | OPEN |
| Origin / CSRF | `scripts/certify-production-origin.mjs` and `src/middleware/safety.test.ts` | Five published-origin probes and the middleware matrix pass; full authenticated route matrix remains open | PASS for P0-02; broader route coverage OPEN |
| Financial concurrency | Database-backed HTTP fixture | Targeted race, 100-request contention, balanced ledger totals, and transfer replay passed on isolated Neon PostgreSQL | PARTIAL |
| Idempotency | Database-backed HTTP fixture and domain idempotency tests | Isolated fixture passes every current keyed economic write path, concurrent duplicates, and mismatched replay conflicts | PASS for P0-07 |
| Migration | Historical artifact, disposable Neon upgrade, and invariant queries | Historical records and balances survived the additive current-schema upgrade; no production branch was changed | PASS for P0-03 |
| Backup / restore | Existing runbook only | No managed backup reference or isolated restore execution | BLOCKED |
| Browser E2E | Preview screenshot only | No authenticated Playwright journey | BLOCKED |
| Accounting | Exact-cent and empty-ledger domain tests | Empty evidence no longer reports reconciled; cross-view accounting remains partial | OPEN |
| Operations | Prepare-only domain tests and structured logs | No durable scheduler, restart recovery, or alert history | BLOCKED |
| Micro-Live | Domain safety tests and disabled adapter boundary | Real transmission remains disabled; full persistence-failure drill absent | PARTIAL |
| Build | Workspace typecheck, API/frontend builds, code generation, route parity | Passed | PASS |

## Latest matrix execution attempt

The 2026-09-02 workspace run passed API typechecking and 66 default API tests. All three PostgreSQL HTTP fixtures were skipped because `CAPITAL_OS_CERTIFICATION_DB_URL` was not configured. No route, role, or audit gate is closed from that skipped run, and the shared `DATABASE_URL` was not used as a destructive certification target.

## Commands

```text
pnpm run certify:production-candidate
```

The command runs code generation, typechecks, both production builds, default API tests, route parity, the published-origin probes when `CAPITAL_OS_CERTIFICATION_ORIGIN` is set, and the database-backed HTTP fixture only after a clean migration verifies the disposable target's out-of-band sentinel. The current command exited `2` because complete tenant/role/actor matrices, managed restore, and authenticated browser evidence remain open; P0-03 is recorded separately from the disposable Neon execution above.
