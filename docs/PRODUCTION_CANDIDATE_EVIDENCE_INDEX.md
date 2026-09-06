# Capital OS internal-candidate evidence index

**Evidence date:** 2026-09-06
**Decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**
<!-- tenant-route-inventory: 163 -->

This index distinguishes executable evidence from source review and blocked infrastructure evidence. It must not be used to check a release-gate item unless the referenced evidence actually exists.
The route count marker is checked against the authoritative route inventory during
API contract certification; stale evidence fails that release check.

| Area | Evidence | Result | Gate state |
|---|---|---|---|
| Identity | Clerk middleware/provider source review; signed-out production-like request returns 401; authenticated Clerk browser run | Authenticated onboarding, persistence, sign-out, repeat sign-in, and isolation passed; provider-supported step-up remains open | PASS for P0-05; P1 step-up OPEN |
| Tenant isolation | `docs/certification/household-privacy-runs/household-privacy-2026-09-06T22-50-17Z.log` | All 163 route/method pairs were replayed on the current surface: 379 executed probes, 56 scoped collection reads, 57 cross-household rejections, 57 malformed rejections; 11 passed, 0 failed/skipped. | PASS for P0-01 current surface |
| Authorization | Current-surface household replay | Role/effective-permission, tampering, and denied-action coverage passed across the current 163-route surface | PASS for P0-06 |
| Origin / CSRF | `scripts/certify-production-origin.mjs` and `src/middleware/safety.test.ts` | Five published-origin probes and the middleware matrix pass; full authenticated route matrix remains open | PASS for P0-02; broader route coverage OPEN |
| Financial concurrency | Database-backed HTTP fixture | Targeted race, 100-request contention, balanced ledger totals, and transfer replay passed on isolated Neon PostgreSQL | PARTIAL |
| Idempotency | Database-backed HTTP fixture and domain idempotency tests | Isolated fixture passes every current keyed economic write path, concurrent duplicates, and mismatched replay conflicts | PASS for P0-07 |
| Migration | Historical artifact, disposable Neon upgrade, and invariant queries | Historical records and balances survived the additive current-schema upgrade; no production branch was changed | PASS for P0-03 |
| Browser E2E | Authenticated Owner browser tester | Owner session succeeded, but contribution-specific certification is blocked: no visible UI configures or verifies the active 80/10/10 sleeve rule. No contribution was submitted and no real money moved. | P0-05 lifecycle evidence retained; contribution browser BLOCKED |
| Accounting | Exact-cent and empty-ledger domain tests | Empty evidence no longer reports reconciled; cross-view accounting remains partial | OPEN |
| Operations | `operations-recovery-2026-09-06T22-53-10Z.log` | OR-01..OR-24 passed (29 tests); safe operations remain prepare-only | PASS |
| Micro-Live | Domain safety tests and disabled adapter boundary | Real transmission remains disabled; full persistence-failure drill absent | PARTIAL |
| Build | Workspace typecheck, API/frontend builds, code generation, route parity | Passed | PASS |

## Latest matrix execution

All 163 route/method pairs were included in the current-surface replay. The
2026-09-06 guarded disposable-target replay included the 163-route tenant preflight. It
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
```

The dedicated command provisions a temporary loopback PostgreSQL target, installs
the `capital_os_certification.target_guard` sentinel, runs the guarded complete
schema setup, executes the database-backed HTTP fixture, records redacted
evidence, and tears the target down. `pnpm run certify:production-candidate`
continues to run the broader candidate checks and can use an externally
provisioned target through its existing certification environment variables.
