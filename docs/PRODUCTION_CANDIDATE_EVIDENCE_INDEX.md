# Capital OS internal-candidate evidence index

**Evidence date:** 2026-09-05
**Decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**
<!-- tenant-route-inventory: 163 -->

This index distinguishes executable evidence from source review and blocked infrastructure evidence. It must not be used to check a release-gate item unless the referenced evidence actually exists.
The route count marker is checked against the authoritative route inventory during
API contract certification; stale evidence fails that release check.

| Area | Evidence | Result | Gate state |
|---|---|---|---|
| Identity | Clerk middleware/provider source review; signed-out production-like request returns 401; authenticated Clerk browser run | Authenticated onboarding, persistence, sign-out, repeat sign-in, and isolation passed; provider-supported step-up remains open | PASS for P0-05; P1 step-up OPEN |
| Tenant isolation | `src/integration/p0-http.test.ts` against the guarded disposable PostgreSQL target | All 163 route/method pairs are inventoried; the latest disposable run covered the predecessor 149-route inventory with 326 executed probes, 55 scoped collection-read comparisons, 44 foreign-identifier denials, 44 malformed-identifier denials, and no unsafe success, leakage, or server errors. The 14 new Budget planning and review-queue pairs await replay. | PASS for prior inventory; current replay OPEN |
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

The current source inventory included the 163-route tenant preflight. The 2026-09-05 guarded disposable-target run passed all six database-backed tests with zero failures against the then-current 149-route inventory, including keyed-write/concurrency and contribution fixtures, role/effective-permission/actor-attribution coverage, financing isolation, and household-finance isolation. The 14 new Budget planning and review-queue pairs remain open for disposable-target replay. The shared `DATABASE_URL` was not used as a destructive certification target. Prior P0 evidence is recorded in `docs/certification/EXECUTED_P0_EVIDENCE_2026-09-05.md`.

## Commands

```text
pnpm run certify:household-privacy
```

The dedicated command provisions a temporary loopback PostgreSQL target, installs
the `capital_os_certification.target_guard` sentinel, runs the guarded complete
schema setup, executes the database-backed HTTP fixture, records redacted
evidence, and tears the target down. `pnpm run certify:production-candidate`
continues to run the broader candidate checks and can use an externally
provisioned target through its existing certification environment variables.
