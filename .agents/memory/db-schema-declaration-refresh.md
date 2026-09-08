---
name: Database schema declaration refresh
description: TypeScript project references can keep API declarations stale after a database schema edit.
---

After changing a schema source file, rebuild the database package declarations before API typechecking; otherwise the API may report a missing export even when the source index re-exports it. Every committed migration must also have its matching Drizzle snapshot and journal entry; a handcrafted migration without a snapshot causes the next generation to emit a duplicate migration. Never replace or collapse migrations that may already be published, even if a newer branch presents a rewritten history. Restore the published lineage and append all newer schema changes in the next generated migration.

**Why:** The API consumes the database package through generated declaration output, and Drizzle diffs from snapshots rather than inspecting handcrafted SQL history. Rewritten journal history makes existing databases rerun old DDL and fail on duplicate tables or indexes before newer columns can be applied.

**How to apply:** Run the database package TypeScript build before API checks, then run migration generation/freshness checks and keep one generated migration/snapshot pair per schema change.