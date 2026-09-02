# Capital OS isolated restore drill

**Result:** **BLOCKED — no restore evidence claimed**

## Provider workflow check

On 2026-09-02, the supported Replit recovery workflow was checked against the
official Data recovery guidance:

- Point-in-time recovery is initiated from the Database tool by selecting the
  production database and opening its restore settings.
- Scheduled backups are restored from the production database's
  **Scheduled backups** settings.
- The available agent database operations only provide connectivity and
  read-only production SQL; they do not enumerate provider backup points,
  create an isolated restore target, or confirm a restore.
- The production read-only check reached `neondb.public` at
  `2026-09-02 18:58:53 UTC`. This is a connectivity observation only and is
  not backup or restore evidence.

Reference: [Replit Data recovery](https://docs.replit.com/features/data-and-storage/data-recovery)

## Execution record

| Field | Value |
|---|---|
| Source backup | Not available in this workspace |
| Restore target | Not provisioned |
| Start | Not executed |
| Finish | Not executed |
| RPO observation | Not measured |
| RTO observation | Not measured |
| Integrity tests | Not executed |
| Failures | The provider-managed backup/PITR reference and isolated non-production restore target were not available through the supported agent-accessible workflow |
| Result | BLOCKED |

## Required execution

The release owner must use the managed PostgreSQL provider’s supported backup
mechanism in the Database tool, record the selected backup/PITR reference,
backup time, retention, provider controls, and release version, then restore it
into an isolated database with no public ingress and no production writes.
Connect a test application instance and verify tenant counts, balances, ledger
debit/credit equality, audit attribution, protected-capital state, household
isolation, idempotency replay, and disabled Micro-Live execution, along with the
remaining application records listed in the certification runbook.

CSV exports, application reports, or a synthetic copy must not be substituted for provider backup/restore evidence. Until an actual restore is executed and recorded, the restore release gates remain open and the release decision remains **NOT READY**.
