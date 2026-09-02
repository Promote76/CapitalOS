# Capital OS migration certification

**Result:** **PARTIAL — clean baseline tooling added; upgrade evidence remains open**

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
| Clean database reset/apply verifier | IMPLEMENTED, NOT EXECUTED | `scripts/certify-migrations.mjs` |
| Clean zero-to-current schema execution | BLOCKED | Dedicated certification PostgreSQL URL not configured |
| Existing-schema upgrade/data preservation | BLOCKED | Older representative schema fixture not available |
| Rollback/forward-fix evidence | BLOCKED | No managed rollback execution performed |
| Migration failure/readiness test | PARTIAL | Readiness failure behavior is tested; migration-failure execution remains open |

No migration gate is checked based only on the presence of SQL. The release remains **NOT READY** until clean and upgrade executions produce recorded data-preservation evidence.
