---
name: Capital OS database publishing
description: External DATABASE_URL overrides Replit production database provisioning and schema synchronization.
---

When Capital OS uses a manually stored external DATABASE_URL, publishing can deploy application code without creating or synchronizing Replit's production database; production can remain on an older schema while development is current.

**Why:** The published app reported missing columns and tables even though the development schema push succeeded, and the Publishing panel showed an external DATABASE_URL warning instead of production database controls.

**How to apply:** Before relying on Publish for production schema changes, confirm the external override is removed and the managed development schema is current. Then use the Publishing database setup flow and republish; do not add startup DDL or target production with a direct schema push.