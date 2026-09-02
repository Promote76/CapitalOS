# Historical schema certification artifact

**Artifact:** `HISTORICAL_SCHEMA_2026-09-01.sql`  
**Source commit:** `a312958528d65e5258b1a4cf3e8772b9104be909`  
**Source timestamp:** 2026-09-01 07:10:18 UTC  
**Generated with:** workspace-pinned `drizzle-kit 0.31.10`  
**Approval basis:** explicitly requested for certification use in the current task

## Scope

This is the last real schema snapshot before the later schema additions for the
current Treasury, operations, business, and Micro-Live domains. It contains 35
tables and is intended to be applied only to a disposable isolated PostgreSQL
database as the starting point for an upgrade test.

The artifact is not a production migration and must not be applied to the
managed production database.

## Evidence boundary

The artifact is now available for the historical-schema upgrade test. Its
presence does not itself certify the upgrade or data preservation. The P0-03
gate remains `BLOCKED` until an isolated execution:

1. applies this snapshot to an empty disposable database;
2. inserts representative pre-upgrade households, memberships, ledger rows,
   goals, property, strategy, finance, and audit data;
3. applies the current upgrade procedure;
4. compares identity, row counts, balances, ownership, statuses, and audit
   history; and
5. records a successful exit and preserved invariants.

No production or shared development database is referenced by this artifact.