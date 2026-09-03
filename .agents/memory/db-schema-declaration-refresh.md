---
name: Database schema declaration refresh
description: TypeScript project references can keep API declarations stale after a database schema edit.
---

After changing a schema source file, rebuild the database package declarations before API typechecking; otherwise the API may report a missing export even when the source index re-exports it. The Drizzle generator in this workspace can also mis-handle the existing absolute migration output path, so do not rewrite a baseline migration to work around that.

**Why:** The API consumes the database package through generated declaration output, and the installed migration generator rejected the repository's existing absolute snapshot path.

**How to apply:** Run the database package TypeScript build before API checks, and use the supported development schema push flow without modifying the baseline migration or claiming production DDL.