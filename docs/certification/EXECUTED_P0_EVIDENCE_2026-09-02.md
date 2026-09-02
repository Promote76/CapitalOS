# Executed P0 evidence

**Execution date:** 2026-09-02  
**Decision:** **NOT READY** until every P0 row is `PASS`

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

## P0-04 — managed backup / restore

Result: **BLOCKED — no restore evidence claimed**.

The supported Replit recovery workflow was checked against the official Data
recovery guidance. It requires the release owner to select a production
point-in-time restore or scheduled backup from the Database tool and confirm
the restore there. The available agent database operations do not expose
provider backup enumeration, restore confirmation, or isolated-target
provisioning. The managed database check reported ready, and a production
read-only connectivity check reached `neondb.public` at
`2026-09-02 20:24:17.66116 UTC`; this does not establish a backup, restore,
recovery point, recovery time, or data integrity. No restore or integrity
checks were executed.

The complete blocked execution record, required provider evidence, and
verification checklist are in
`docs/RESTORE_DRILL_2026-09-02.md`.

## P0-05 — authenticated Clerk browser journey

Result: **FAIL — release gate remains open**.

The browser certification used the Replit-managed Clerk development tenant and
the testing harness's programmatic Clerk sign-in. No password or other test-user
credential was placed in source, the test plan, or this evidence record. The
development API was restarted with an explicit allowed origin for the current
Replit preview before the final run.

| Assertion | Result | Executed evidence |
|---|---|---|
| Programmatic Clerk sign-in | PASS | A unique first test user reached an authenticated session; `/api/auth/me` returned `200` with `authStrength=clerk_session`. |
| Visible onboarding form | FAIL | The authenticated page did not reliably render `Set up your household.`; onboarding had to be completed with an authenticated same-origin browser request. |
| Household onboarding write | PASS | Test household A was created by `POST /api/auth/onboard` with HTTP `201`. |
| Household-scoped dashboard | PASS | The active membership and unique household-A name were returned to the authenticated browser. |
| Saved household write | PASS | The Accounts UI created a unique manual account at `$0`; the success message and new row were visible. |
| Reload persistence | PASS | Reloading `/accounts` retained the unique manual account and the authenticated household. |
| Sign-out session invalidation | PASS | After the visible `Sign out` control was used, `/api/auth/me` returned `401`. |
| Signed-out UI boundary | FAIL | Protected dashboard shell/content remained rendered instead of resolving to the public landing/sign-in state. |
| Same-user sign-in persistence | PASS | A new programmatic session for test user A recovered the same household and manual account. |
| Second-user onboarding | PASS | A clean browser context created distinct test household B with HTTP `201`. |
| Household isolation | PASS | Household B showed zero accounts and did not render household A's unique household or account names. |

Routes exercised: `/`, `/accounts`, `/api/auth/me`, and
`/api/auth/onboard`. Screenshots captured by the browser run:
`k200iw` (authenticated household context), `78yfsf` (saved account),
`dqmo8f` (reload persistence), `h5iycq` and `hjtadb` (sign-out failure),
and `fuf26z` and `b8j4jj` (second-household isolation).

Because the visible onboarding and signed-out UI assertions failed, P0-05 is
not certified even though authentication, persistence, session invalidation,
and the exercised two-household isolation assertion passed.

## Remaining P0 blockers

- **P0-04:** provider-managed backup identity, isolated restore target, and restore
  integrity/RPO/RTO evidence are unavailable; see
  `docs/RESTORE_DRILL_2026-09-02.md`.
- **P0-05:** the authenticated browser run failed the visible onboarding and
  signed-out UI assertions.

These blockers keep the production candidate `NOT READY`.