# Capital OS internal-candidate evidence index

**Evidence date:** 2026-09-02  
**Decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**

This index distinguishes executable evidence from source review and blocked infrastructure evidence. It must not be used to check a release-gate item unless the referenced evidence actually exists.

| Area | Evidence | Result | Gate state |
|---|---|---|---|
| Identity | Clerk middleware/provider source review; signed-out production-like request returns 401; authenticated Clerk browser run | Authenticated onboarding, persistence, sign-out, repeat sign-in, and isolation passed; provider-supported step-up remains open | PASS for P0-05; P1 step-up OPEN |
| Tenant isolation | `src/integration/p0-http.test.ts` against isolated PostgreSQL | All 108 route/method pairs plus applicable household-read, foreign/malformed-identifier, and mass-assignment probes passed without unsafe success, leakage, or server errors | PASS for P0-01 |
| Authorization | Membership lookup, effective permission list, role/domain tests | Isolated fixture passed the documented role, grant/revoke, membership, household-selection, tampering, and denied-action cases | PASS for P0-06 |
| Origin / CSRF | `scripts/certify-production-origin.mjs` and `src/middleware/safety.test.ts` | Five published-origin probes and the middleware matrix pass; full authenticated route matrix remains open | PASS for P0-02; broader route coverage OPEN |
| Financial concurrency | Database-backed HTTP fixture | Targeted race, 100-request contention, balanced ledger totals, and transfer replay passed on isolated Neon PostgreSQL | PARTIAL |
| Idempotency | Database-backed HTTP fixture and domain idempotency tests | Isolated fixture passes every current keyed economic write path, concurrent duplicates, and mismatched replay conflicts | PASS for P0-07 |
| Migration | Historical artifact, disposable Neon upgrade, and invariant queries | Historical records and balances survived the additive current-schema upgrade; no production branch was changed | PASS for P0-03 |
| Browser E2E | Authenticated Clerk browser evidence | Authentication, visible onboarding, onboarding write, saved-account reload, sign-out invalidation, repeat sign-in, and second-household isolation passed | PASS for P0-05 |
| Accounting | Exact-cent and empty-ledger domain tests | Empty evidence no longer reports reconciled; cross-view accounting remains partial | OPEN |
| Operations | Prepare-only domain tests and structured logs | No durable scheduler, restart recovery, or alert history | BLOCKED |
| Micro-Live | Domain safety tests and disabled adapter boundary | Real transmission remains disabled; full persistence-failure drill absent | PARTIAL |
| Build | Workspace typecheck, API/frontend builds, code generation, route parity | Passed | PASS |

## Latest matrix execution

The 2026-09-02 isolated Neon run passed all three database-backed tests with zero failures: the 108-route tenant preflight, the keyed-write/concurrency fixture, and the role/effective-permission/actor-attribution fixture. The shared `DATABASE_URL` was not used as a destructive certification target.

## Commands

```text
pnpm run certify:production-candidate
```

The command runs code generation, typechecks, both production builds, default API tests, route parity, the published-origin probes when `CAPITAL_OS_CERTIFICATION_ORIGIN` is set, and the database-backed HTTP fixture only after a clean migration verifies the disposable target's out-of-band sentinel. Previously certified isolated and browser evidence is consumed when optional rerun environment variables are absent. The internal-only candidate is ready when foundational checks pass; the documented P0-03 upgrade evidence is consumed separately from the disposable Neon execution above.
