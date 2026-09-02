# Capital OS migration certification

**Result:** **PARTIAL — historical artifact created; clean baseline executed; upgrade evidence remains open**

## Supported local certification sequence

The guarded command below resets only a dedicated disposable PostgreSQL database, applies the committed generated baseline, and verifies representative baseline tables:

```text
CAPITAL_OS_CERTIFICATION_DB_URL=<dedicated-url> \
CAPITAL_OS_CERTIFICATION_TARGET_ID=<sentinel-id> \
CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1 \
pnpm run certify:migrations
```

Before this command can reset `public`, the disposable database must have an out-of-band guard outside that schema:

```sql
CREATE SCHEMA IF NOT EXISTS capital_os_certification;
CREATE TABLE IF NOT EXISTS capital_os_certification.target_guard (
  target_id text PRIMARY KEY,
  active boolean NOT NULL DEFAULT true
);
INSERT INTO capital_os_certification.target_guard (target_id)
VALUES ('<sentinel-id>');
```

The runner canonicalizes the certification and shared connection targets, verifies the sentinel through PostgreSQL, and checks it again in the same server-side block immediately before `DROP SCHEMA public CASCADE`. A missing or mismatched sentinel is a hard refusal.

The command refuses a canonical target matching the configured shared `DATABASE_URL`, requires an out-of-band disposable-target sentinel, and rechecks that sentinel immediately before reset. These safeguards do not independently identify every production database, so operators must still provision the sentinel only on an approved disposable target. The command does not claim an existing-schema upgrade.

## Current evidence

| Gate | Result | Evidence |
|---|---|---|
| Migration artifact exists | PASS | `lib/db/migrations/0000_previous_kang.sql` |
| Deterministic migration journal exists | PASS | `lib/db/migrations/meta/_journal.json` |
| Clean database reset/apply verifier | EXECUTED, PASS | `scripts/certify-migrations.mjs` against isolated Neon certification branch on 2026-09-02 |
| Clean zero-to-current schema execution | PASS | Reset, baseline apply, and representative table verification exited `0` |
| Historical schema artifact | PASS | `docs/certification/HISTORICAL_SCHEMA_2026-09-01.sql`, generated from real commit `a312958` |
| Existing-schema upgrade/data preservation | BLOCKED | Artifact is available, but isolated upgrade and data-preservation execution remain open |
| Rollback/forward-fix evidence | BLOCKED | No managed rollback execution performed |
| Migration failure/readiness test | PARTIAL | Readiness failure behavior is tested; migration-failure execution remains open |

The clean migration gate is checked only for the isolated reset/apply execution. The release remains **NOT READY** until the committed historical artifact and an approved upgrade procedure produce recorded data-preservation evidence.
