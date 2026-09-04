---
name: Actor-scoped household initialization
description: How authenticated service reads should initialize and resolve household planning records.
---

Authenticated service paths must initialize tenant core data through the actor's household and then use the returned household-scoped IDs; they must not fall back to the shared demo seed or silently accept missing planning records.

**Why:** Directly replacing shared seed lookup with ad hoc record queries made fresh authenticated households fail because their planning core had not yet been initialized.

**How to apply:** For authenticated reads and mutations, use the actor household/user pair with the tenant-core initializer. Reserve the global seed resolver for explicit development/test fallback contexts.