---
name: Capital OS database publishing
description: External DATABASE_URL overrides Replit production database provisioning and schema synchronization.
---

When Capital OS uses a manually stored external DATABASE_URL, publishing can deploy application code without creating or synchronizing Replit's production database; production can remain on an older schema while development is current.

**Why:** The published app reported missing columns and tables even though the development schema push succeeded, and the Publishing panel showed an external DATABASE_URL warning instead of production database controls.

**How to apply:** Before relying on Publish for production schema changes, confirm the external override is removed and the managed development schema is current. Use the managed development post-merge push and production Publish diff flow; keep generated Drizzle SQL for review/CI, but do not run a migration command from API startup, build hooks, deploy hooks, or directly against production.

Legacy rows can violate a newly tightened API response contract even when the database schema is valid. Normalize nullable historical JSON at the service boundary when the public contract requires an object, rather than making clients handle multiple shapes.

**Why:** A contribution metadata contract exposed older null values during a normal preview read.

**How to apply:** Whenever an existing JSON column becomes required in OpenAPI, audit historical rows and normalize null/legacy values before response validation.

Certification browser runs that depend on newly added tables must use the same
disposable, fully migrated target as the HTTP fixture; a shared development
database can be stale even when code generation and the current schema source
are correct.

**Why:** The shared development database lacked a current Family Office table,
which correctly produced a fail-closed browser view and could not certify the
positive proposal/portfolio state.

**How to apply:** Run authenticated browser certification inside the guarded
disposable-target command, not against an unverified shared `DATABASE_URL`.