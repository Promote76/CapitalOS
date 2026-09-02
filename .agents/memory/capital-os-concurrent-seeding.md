---
name: Concurrent additive seeding
description: Why lazy household seed routines must be serialized when multiple read endpoints initialize the same data.
---

Lazy additive seed routines reached by parallel API reads must run inside a database transaction guarded by a household-scoped PostgreSQL advisory lock.

**Why:** A command-center page can request several resources simultaneously. Independent “check then insert” calls can all observe an empty state, duplicate non-unique starter records, and race on unique records.

**How to apply:** Use the same stable household-derived lock namespace for every entry point that may initialize a given feature, then re-check and insert within that locked transaction. Unique indexes remain a backstop, not the concurrency mechanism.