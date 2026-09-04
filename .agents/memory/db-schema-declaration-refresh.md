---
name: Database schema declaration refresh
description: TypeScript project references can keep API declarations stale after a database schema edit.
---

After changing a schema source file, rebuild the database package declarations before API typechecking; otherwise the API may report a missing export even when the source index re-exports it.

**Why:** The API consumes the database package through generated declaration output.

**How to apply:** Run the database package TypeScript build before API checks.