# Capital OS financial integrity certification

**Date:** 2026-09-05
**Current HEAD:** `a0685179edd4f0f17af4217a0f40f18cfa5dfb41`
**Database target:** disposable local PostgreSQL cluster; no shared or production database was used
**Target sentinel:** `financial-integrity-local-certification-20260905`

## Scope

This certification covers tenant/IDOR, Treasury, Accounting, and Safe-to-Deploy.
It does not enable banking providers, ACH, money movement, brokerage trading,
Micro-Live, autonomous execution, or external investor capital.

## Backup / restore reconciliation

**BACKUP_RESTORE_STATUS:** OUT_OF_SCOPE

Managed provider backup and restore is outside the current Capital OS release-gate
matrix. No production restore was attempted because the available PITR control
restores the existing production database in place rather than an isolated target.

## Route inventory

**TOTAL_ROUTES:** 149

The count was discovered from the executable route registrations and checked
against the current tenant-isolation evidence.

| Domain | Result | Gates | Runtime evidence |
| --- | --- | ---: | --- |
| Tenant / IDOR | PASS | 15/15 | 149-route inventory plus database-backed P0 household, role, identifier, tampering, and audit probes |
| Treasury | PASS | 12/12 | Treasury domain invariants plus PostgreSQL actor, redaction, approval, reservation, replay, conflict, concurrency, and audit coverage |
| Accounting | PASS | 14/14 | Exact-cent, ledger, cross-view, source-boundary, unknown-value, and API regression coverage |
| Safe-to-Deploy | PASS | 20/20 | Safe-to-Deploy domain invariants plus $250 contribution and Treasury reservation runtime coverage |

## Combined adversarial scenarios

- Cross-household reservation attempt: PASS
- Protected Duplex Reserve cannot become deployable capital: PASS
- Paper and unrealized profit cannot increase Safe-to-Deploy: PASS
- Business cash remains separate until an authoritative distribution: PASS
- Concurrent reservations do not over-reserve: PASS
- AI authority: advisory only; no financial classification, approval, money movement, or order submission

## Regression commands

- `pnpm run typecheck`
- `pnpm run check:generated-finance-artifacts`
- `pnpm --filter @workspace/api-server test`
- isolated PostgreSQL integration fixture

**Certification result:** PASS

