---
name: HTTP fixture runner
description: Environment constraint for executing the Capital OS database-backed HTTP test fixture.
---

The database-backed HTTP fixture should be run with the repository's installed TypeScript runner rather than raw Node alone. The database package uses explicit `.ts` schema imports so Node can load it, while the API application still contains extensionless relative imports that the TypeScript runner resolves.

**Why:** Raw Node failed first on the database schema directory import and then on the API routes directory/file imports. The fixture itself passed once the runner resolved workspace TypeScript modules.

**How to apply:** Keep the default isolated test command free of database fixture side effects. For authenticated HTTP evidence, run the fixture explicitly with the workspace TypeScript runner, test context enabled, and a temporary database fixture cleanup path.