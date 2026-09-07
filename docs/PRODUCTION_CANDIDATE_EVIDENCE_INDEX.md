# Capital OS internal-candidate evidence index

**Evidence date:** 2026-09-07
**Decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**
<!-- tenant-route-inventory: 170 -->

This index distinguishes executable evidence from source review and blocked infrastructure evidence. It must not be used to check a release-gate item unless the referenced evidence actually exists.
The route count marker is checked against the authoritative route inventory during
API contract certification; stale evidence fails that release check.

| Area | Evidence | Result | Gate state |
|---|---|---|---|
| Identity | Clerk middleware/provider source review; signed-out production-like request returns 401; authenticated Clerk browser run | Authenticated onboarding, persistence, sign-out, repeat sign-in, and isolation passed; provider-supported step-up remains open | PASS for P0-05; P1 step-up OPEN |
| Tenant isolation | `docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-17-55Z.log` | The prior 163-route replay retained 379 probes; the same guarded disposable target then ran P0-09 across all seven Family Office routes. Household A/B reads rejected foreign proposal and Shadow portfolio data, and Shadow writes stayed household-scoped. | PASS for Family Office slice; full 170-route preflight OPEN |
| Authorization | Same 2026-09-07 evidence log and source review | P0-09 passed five role denials and four `STEP_UP_REQUIRED` denials, plus cross-household decision and intent rejection. Middleware and service source review is recorded separately from executed evidence. | PASS for Family Office slice; broader route matrix OPEN |
| Origin / CSRF | `scripts/certify-production-origin.mjs` and `src/middleware/safety.test.ts` | Five published-origin probes and the middleware matrix pass; full authenticated route matrix remains open | PASS for P0-02; broader route coverage OPEN |
| Financial concurrency | Database-backed HTTP fixture | Targeted race, 100-request contention, balanced ledger totals, and transfer replay passed on isolated Neon PostgreSQL | PARTIAL |
| Idempotency | Database-backed HTTP fixture and domain idempotency tests | Isolated fixture passes every current keyed economic write path, concurrent duplicates, and mismatched replay conflicts | PASS for P0-07 |
| Migration / restore | Disposable schema setup only; provider recovery controls are not exercised by this task | No production migration, backup restore, or PITR claim was independently proven by this certification. | OPEN |
| Browser E2E | `docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-17-55Z.log` | Authenticated Clerk browser fixture passed Family Office disabled-provider, loading, provider-error, proposal-review, Shadow-portfolio, hypothetical-intent, and secret/non-execution checks. Contribution-specific certification remains blocked. | PASS for Family Office slice; contribution browser BLOCKED |
| Accounting | Exact-cent and empty-ledger domain tests | Empty evidence no longer reports reconciled; cross-view accounting remains partial | OPEN |
| Operations | `operations-recovery-2026-09-06T22-53-10Z.log` | OR-01..OR-24 passed (29 tests); safe operations remain prepare-only | PASS |
| Micro-Live | Domain safety tests and disabled adapter boundary | Real transmission remains disabled; full persistence-failure drill absent | PARTIAL |
| Build | Workspace typecheck, API/frontend builds, code generation, route parity | Passed | PASS |

## Latest matrix execution

All 170 route/method pairs are in the current executable surface; the certification plan included the 170-route tenant preflight target, and the evidence combines the prior 163-route replay with a focused seven-route Family Office replay. The focused replay
passed with 379 probes, 56 scoped collection reads, 57
cross-household rejections, and 57 malformed rejections (11 tests passed; none
failed or skipped). P0-01, P0-06, and P0-08 are current-surface PASS. The three
earlier safe fixture-setup attempts are not production failures: the final fixture
established a legitimate approved plan without weakening controls. The shared
`DATABASE_URL` was not used as a destructive certification target. See
`docs/certification/CURRENT_SURFACE_CERTIFICATION_2026-09-06.md`.

## Commands

```text
pnpm run certify:household-privacy
pnpm run certify:family-office
```

The dedicated command provisions a temporary loopback PostgreSQL target, installs
the `capital_os_certification.target_guard` sentinel, runs the guarded complete
schema setup, executes the database-backed HTTP fixture, records redacted
evidence, and tears the target down. `pnpm run certify:production-candidate`
continues to run the broader candidate checks and can use an externally
provisioned target through its existing certification environment variables.
`pnpm run certify:family-office` narrows the same guarded target to P0-09 and also
runs the authenticated Clerk browser fixture before teardown. Its evidence does
not prove production migration, backup, restore, or PITR behavior.
