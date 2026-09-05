# Managed backup / isolated restore certification

**Overall result: BLOCKED**

Capital OS has not yet claimed a backup/restore pass. The current environment
does not contain a provider-managed recovery target or restore manifest, and no
restore was attempted.

## Provider status

- Provider: Replit managed PostgreSQL
- Recovery mechanism: provider-managed PITR or scheduled-backup restore
- Source: production
- Restore target: **BLOCKED — owner action required**
- Production overwritten: **NO**
- Real orders sent: `0`
- Micro-Live: `DISABLED`
- Schwab trading: `DISABLED`
- AI execution: `DISABLED`

## Required owner action

1. Open the Replit Database controls for the production database.
2. Select an approved PITR or scheduled-backup recovery point.
3. Restore it into a **new isolated non-production target**.
4. Do not overwrite production, the shared development database, or the normal
   certification database.
5. Make the isolated target available to the workspace through the secret
   reference `CAPITAL_OS_RESTORE_CERTIFICATION_DB_URL`.
6. Provide a provider recovery manifest based on
   `docs/certification/RESTORE_CERTIFICATION_MANIFEST.example.json`.
7. Run:

   `CAPITAL_OS_RESTORE_CERTIFICATION_MANIFEST=docs/certification/restore-manifest.json pnpm run certify:restore`

No database password or connection string should be pasted into chat.

## Current gate state

All RC gates remain `BLOCKED` until the real provider-managed restore,
source/restore snapshot, isolated application checks, tenant HTTP probes, and
recovery timings are captured. The refusal-first verifier is implemented in
`scripts/certify-restore.mjs`; it never falls back to `DATABASE_URL`, starts
the certification application with workers and schedulers disabled, and writes
redacted machine-readable evidence under `docs/certification/restore-runs/`.