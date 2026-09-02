# Capital OS migration certification

**Result:** **PARTIAL — historical artifact created; clean baseline executed; upgrade evidence remains open**

## Supported local certification sequence

The guarded command below resets only a dedicated disposable PostgreSQL database, applies the committed generated baseline, and verifies representative baseline tables:

```text
CAPITAL_OS_CERTIFICATION_DB_URL=<dedicated-url> \
CAPITAL_OS_CERTIFICATION_ALLOW_RESET=1 \
pnpm run certify:migrations
```

The command refuses to run when the certification URL equals the shared `DATABASE_URL`. It does not run against production and does not claim an existing-schema upgrade.

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
