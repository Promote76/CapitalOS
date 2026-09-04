---
name: Database schema declaration refresh
description: TypeScript project references can keep API declarations stale after a database schema edit.
---

After changing a schema source file, rebuild the database package declarations before API typechecking; otherwise the API may report a missing export even when the source index re-exports it. Every committed migration must also have its matching Drizzle snapshot and journal entry; a handcrafted migration without a snapshot causes the next generation to emit a duplicate migration.

**Why:** The API consumes the database package through generated declaration output, and Drizzle diffs from snapshots rather than inspecting handcrafted SQL history.

**How to apply:** Run the database package TypeScript build before API checks, then run migration generation/freshness checks and keep one generated migration/snapshot pair per schema change.