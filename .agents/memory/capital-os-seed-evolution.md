---
name: Additive development seeding
description: How the seeded development household should evolve as the Capital OS schema grows.
---

Startup seed logic must detect the existing development household and add missing capabilities in place. It should not create a second household merely because a newly introduced account, rule, or supporting record is absent.

**Why:** The seeded household is the stable development reference used by the UI and API checks; duplicate household names make behavior and verification nondeterministic.

**How to apply:** When adding seed data, first add an additive repair path for existing rows, then keep the full-create path for fresh databases. Verify the household identity remains stable across restarts.