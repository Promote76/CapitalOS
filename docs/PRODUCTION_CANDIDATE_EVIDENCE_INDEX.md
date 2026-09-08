# Capital OS internal-candidate evidence index

**Evidence date:** 2026-09-08
**Decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE**
<!-- tenant-route-inventory: 214 -->

This index distinguishes executable evidence from source review and blocked infrastructure evidence. It must not be used to check a release-gate item unless the referenced evidence actually exists.
The route count marker is checked against the authoritative route inventory during
API contract certification; stale evidence fails that release check.

| Area | Evidence | Result | Gate state |
|---|---|---|---|
| Identity | Clerk middleware/provider source review; signed-out production-like request returns 401; authenticated Clerk browser run | Authenticated onboarding, persistence, sign-out, repeat sign-in, and isolation passed; provider-supported step-up remains open | PASS for P0-05; P1 step-up OPEN |
| Tenant isolation | `docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-25-33Z.log` | The current executable inventory contains 173 route/method pairs after adding Daily Ops journal and guided-run history. The referenced clean replay predates those three routes and remains evidence for the prior 170-route surface only. | OPEN |
| Authorization | `docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-25-33Z.log` and source review | The same complete replay passed role, recent-auth, malformed-input, mass-assignment, Shadow-only, and no-execution assertions across the current route surface. Middleware and service source review is recorded separately from executed evidence. | PASS for the isolated current surface |
| Origin / CSRF | `scripts/certify-production-origin.mjs` and `src/middleware/safety.test.ts` | Five published-origin probes and the middleware matrix pass; full authenticated route matrix remains open | PASS for P0-02; broader route coverage OPEN |
| Financial concurrency | Database-backed HTTP fixture | Targeted race, 100-request contention, balanced ledger totals, and transfer replay passed on isolated Neon PostgreSQL | PARTIAL |
| Idempotency | Database-backed HTTP fixture and domain idempotency tests | Isolated fixture passes every current keyed economic write path, concurrent duplicates, and mismatched replay conflicts | PASS for P0-07 |
| Migration / restore | Disposable schema setup only; provider recovery controls are not exercised by this task | No production migration, backup restore, or PITR claim was independently proven by this certification. | OPEN |
| Browser E2E | `docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-17-55Z.log` | Authenticated Clerk browser fixture passed Family Office disabled-provider, loading, provider-error, proposal-review, Shadow-portfolio, hypothetical-intent, and secret/non-execution checks. Contribution-specific certification remains blocked. | PASS for Family Office slice; contribution browser BLOCKED |
| Grok/xAI provider | `docs/certification/XAI_PROVIDER_CERTIFICATION_2026-09-07.md`; `docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-58-16Z.log` | The authenticated model catalog and strict-schema adapter passed in development. Production health/origin probes passed, and a normal authenticated production session completed one advisory research run with provider status ready and retained output. Automated Clerk reverification certification remains separate. | PASS for controlled development activation, production public boundary, and authenticated production provider runtime |
| Accounting | Exact-cent and empty-ledger domain tests | Empty evidence no longer reports reconciled; cross-view accounting remains partial | OPEN |
| Operations | `operations-recovery-2026-09-06T22-53-10Z.log` | OR-01..OR-24 passed (29 tests); safe operations remain prepare-only | PASS |
| Micro-Live | Domain safety tests and disabled adapter boundary | Real transmission remains disabled; full persistence-failure drill absent | PARTIAL |
| Build | Workspace typecheck, API/frontend builds, code generation, route parity | Passed | PASS |

## Latest matrix execution

All 214 route/method pairs are in the current executable surface; the
certification checklist included the 214-route tenant preflight target, while the
referenced certification run predates the Daily Ops routes and covered the prior
170-route surface. The clean guarded
replay covered the complete inventory. The run passed with 393 probes,
58 scoped collection reads, 58 cross-household rejections, and 58 malformed
rejections (12 tests passed; none failed or skipped). P0-01, P0-06, and P0-08
are current-surface PASS. The shared `DATABASE_URL` was not used as a destructive
certification target. See
`docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-25-33Z.log`.

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
`pnpm run certify:family-office` remains available for the focused authenticated
Family Office browser fixture. The complete replay evidence above does not prove
production migration, backup, restore, or PITR behavior.
