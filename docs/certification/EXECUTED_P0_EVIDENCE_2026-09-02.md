# Executed P0 evidence

**Execution date:** 2026-09-02  
**Decision:** **NOT READY** until every P0 row is `PASS`

This record contains only evidence executed during the current certification run. It
does not convert source review or an available runbook into certification.

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

Result: **1 test passed, 0 failed, 0 skipped**.

The run covered same-key concurrent contribution, transfer, strategy allocation, capital
request, and business-distribution writes; mismatched replay conflicts; cross-household
foreign-parent denial; role denial; mass-assignment resistance; recent-auth denial;
100-request transfer contention; ledger balancing; and persisted audit actor checks.
Idempotency mismatches correctly return HTTP `409` with `IDEMPOTENCY_CONFLICT`.

## P0-04 — managed backup / restore

Result: **BLOCKED — no restore evidence claimed**.

The supported Replit recovery workflow was checked against the official Data
recovery guidance. It requires the release owner to select a production
point-in-time restore or scheduled backup from the Database tool and confirm
the restore there. The available agent database operations do not expose
provider backup enumeration, restore confirmation, or isolated-target
provisioning. A production read-only connectivity check reached
`neondb.public` at `2026-09-02 18:58:53 UTC`; this does not establish a backup,
restore, recovery point, recovery time, or data integrity.

The complete blocked execution record, required provider evidence, and
verification checklist are in
`docs/RESTORE_DRILL_2026-09-02.md`.

## Remaining P0 blockers

- **P0-01:** the complete 108-route IDOR matrix has not executed.
- **P0-04:** provider-managed backup identity, isolated restore target, and restore
  integrity/RPO/RTO evidence are unavailable; see
  `docs/RESTORE_DRILL_2026-09-02.md`.
- **P0-05:** authenticated Clerk browser journeys and a secure test-user flow are
  unavailable.
- **P0-06:** the complete role/effective-permission grant, revoke, membership-change,
  household-selection, and tampering matrix has not executed.
- **P0-08:** the complete permitted-action audit-attribution matrix has not executed.

These blockers keep the production candidate `NOT READY`.