---
name: HTTP fixture runner
description: Environment constraint for executing the Capital OS database-backed HTTP test fixture.
---

The database-backed HTTP fixture should be run with the repository's installed TypeScript runner rather than raw Node alone. The database package uses explicit `.ts` schema imports so Node can load it, while the API application still contains extensionless relative imports that the TypeScript runner resolves.

**Why:** Raw Node failed first on the database schema directory import, then on the API routes directory/file imports, and finally on TypeScript parameter properties because strip-only mode does not transpile them. The fixture passed once the workspace TypeScript runner resolved and transpiled the modules.

**How to apply:** Keep the default isolated test command free of database fixture side effects. For authenticated HTTP evidence, run the fixture explicitly with the workspace TypeScript runner, test context enabled, and a temporary database fixture cleanup path. Delete household audit rows before deleting fixture households because audit history is intentionally append-only and has a restrictive household foreign key. After a high-volume request race, verify persisted state directly in PostgreSQL or use a fresh request identity; the in-process limiter counts all requests in the window.

Finance lifecycle assertions should scope transaction queries by their source and calculate downstream expectations from every earlier approved row in the same fixture.

**Why:** The manual-review scenario runs before CSV and later manual scenarios, so unscoped rows and copied totals can make a valid lifecycle fail or hide a regression.

**How to apply:** Normalize API date serialization at the assertion boundary, select the intended `dataSource`, and keep budget, cash-flow, and Safe-to-Deploy expectations cumulative.