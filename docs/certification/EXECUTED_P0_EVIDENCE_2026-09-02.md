# Executed P0 evidence

**Execution date:** 2026-09-02  
**Decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE** after every in-scope P0 row is `PASS`

This record contains only evidence executed during the current certification run. It
does not convert source review or an available runbook into certification.

## P0-01 — caller-controlled identifier / IDOR matrix

Command:

```text
DATABASE_URL=<disposable-neon-url> NODE_ENV=test CAPITAL_OS_TEST_CONTEXT=1 \
CAPITAL_OS_RUN_INTEGRATION=1 CAPITAL_OS_ALLOWED_ORIGIN=http://capitalos.test \
node <workspace-tsx-cli> --test artifacts/api-server/src/integration/p0-http.test.ts
```

Result: **PASS — 108 route/method pairs, 0 failures**.

The isolated fixture executed the complete discovered route inventory, broad
household-scoped collection reads in both households, same-household parameterized
requests, foreign-household identifier probes, malformed identifier probes, and
mass-assignment body probes for applicable parameterless writes. The run rejected
unsafe cross-household success, rejected malformed identifiers with 4xx responses,
returned no other-household identifiers, and produced no unexpected 500 responses.
The shared application database was not used as the destructive certification target.

## P0-02 — published origin / CSRF

Command:

```text
CAPITAL_OS_CERTIFICATION_ORIGIN=https://capital-os-fund.replit.app node scripts/certify-production-origin.mjs
```

Result: `PASS (5 probes)`

| Probe | HTTP status | Response code |
|---|---:|---|
| Missing origin | 403 | `ORIGIN_NOT_ALLOWED` |
| Malformed origin | 403 | `ORIGIN_NOT_ALLOWED` |
| Cross-site origin | 403 | `CSRF_BLOCKED` |
| Allowed published origin | 401 | `AUTHENTICATION_REQUIRED` |
| Allowed origin with invalid credential cookie | 401 | `AUTHENTICATION_REQUIRED` |

## P0-03 — existing-schema upgrade and preservation

Execution used disposable Neon branches only:

- Historical/data branch: `br-bold-brook-ax5zqsza`
- Current-schema comparison branch: `br-holy-mountain-ax4tiz3c`
- Parent branch: `production` (`br-crimson-lab-ax3tlfxk` was the inspected default branch)

The approved historical snapshot applied in 142 statements. Representative pre-upgrade
records were then inserted before the additive current-schema upgrade. The upgrade
completed successfully. The legacy `property_status=rejected` value was retained
because PostgreSQL cannot safely remove enum values in place.

Post-upgrade invariant query:

| Invariant | Result |
|---|---:|
| Households | 2 |
| Household memberships | 2 |
| Capital accounts | 2 |
| Ledger entries | 2 |
| Active account balance | `125.50` |
| Protected account balance | `500.00` |
| Transfer status | `completed` |
| Audit actor | seeded owner UUID preserved |
| New nullable external auth ID | `NULL` |

The disposable post-upgrade schema contained 75 public tables, 998 constraints, and
173 indexes. No production branch was modified.

## P0-07 — concurrent idempotency

The database-backed HTTP fixture ran against the disposable upgraded Neon branch using
the workspace TypeScript runner.

Result: **3 tests passed, 0 failed, 0 skipped**.

The run covered same-key concurrent contribution, transfer, strategy allocation, capital
request, and business-distribution writes; mismatched replay conflicts; cross-household
foreign-parent denial; role denial; mass-assignment resistance; recent-auth denial;
100-request transfer contention; ledger balancing; the complete 108-route tenant
preflight; role/effective-permission membership and selection transitions; and
persisted audit actor checks.
Idempotency mismatches correctly return HTTP `409` with `IDEMPOTENCY_CONFLICT`.

## P0-06 — role / effective-permission HTTP certification

Result: **PASS — included in the isolated three-test run**.

The fixture exercised Owner, Partner, Advisor, and Viewer behavior; stored permission
grant and revoke; inactive/active membership transitions; explicit household selection
cases; role-header and body tampering; denied representative actions; and unsupported
administration routes. The run completed with zero failures.

## P0-08 — actor attribution certification

Result: **PASS — included in the isolated three-test run**.

Persisted audit queries retained the authenticated actor for the exercised permitted
Owner, Partner, Advisor, and explicitly granted Viewer actions. Denied tampering did
not create a misleading actor audit row. The run completed with zero failures.

## P0-05 — authenticated Clerk browser journey

Result: **PASS**.

The browser certification used the Replit-managed Clerk development tenant and
the testing harness's programmatic Clerk sign-in. No password or other test-user
credential was placed in source, the test plan, or this evidence record. The
development API required an explicit allowed origin for the current Replit
preview before authenticated writes could proceed; the first onboarding write
was correctly rejected with `403` until that runtime policy was applied.

| Assertion | Result | Executed evidence |
|---|---|---|
| Programmatic Clerk sign-in | PASS | A unique first test user reached an authenticated session; `/api/auth/me` returned `200` with `authStrength=clerk_session`. |
| Visible onboarding form | PASS | Before any workaround or protected content, the clean first-user context rendered `Set up your household.` with household name, time-zone, and submit controls. |
| Household onboarding write | PASS | The visible onboarding form created test household A and transitioned to the protected application. |
| Household-scoped dashboard | PASS | The active membership and unique household-A name were returned to the authenticated browser. |
| Saved household write | PASS | The Accounts UI created a unique manual account at `$0`; the success message and new row were visible. |
| Reload persistence | PASS | Reloading `/accounts` retained the unique manual account and the authenticated household. |
| Sign-out session invalidation | PASS | After the visible `Sign out` control was used, `/api/auth/me` returned `401`. |
| Signed-out UI boundary | PASS | Protected dashboard, sidebar, and account content were removed and the public `Protect the base. Fund the next chapter.` landing state rendered. |
| Same-user sign-in persistence | PASS | A new programmatic session for test user A skipped onboarding and recovered the same household and manual account. |
| Second-user onboarding | PASS | A clean second browser context showed onboarding before protected content and created distinct test household B. |
| Household isolation | PASS | Household B showed zero accounts and did not render household A's unique household or account names. |

Routes exercised: `/`, `/accounts`, `/api/auth/me`, and
`/api/auth/onboard`. Screenshots captured by the passing browser run:
`w7z049` (visible first-user onboarding before protected content), `t0zjl3`
(saved account after reload), `0hx7uo` (signed-out public boundary), and
`z4vn77` (second-household zero-account isolation).

All required in-scope P0-05 assertions passed in the rerun, so the authenticated
Clerk browser journey is certified for the internal-only release scope.

### P0-05 contribution addendum

The contribution-specific proof is recorded separately in
`docs/certification/P0_05_CONTRIBUTION_FUNCTIONAL_PROOF_2026-09-03.md`. It is not
folded into the Clerk browser result above: no approved provider-browser execution
or MFA evidence was available in this run.
