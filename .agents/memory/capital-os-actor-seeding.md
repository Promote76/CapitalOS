---
name: Actor-scoped household initialization
description: How authenticated service reads should initialize and resolve household planning records.
---

Authenticated service paths must initialize structural tenant core data through the actor's household and then use the returned household-scoped IDs; they must not fall back to the shared demo seed, create realistic sample financial values, or silently accept missing required records.

**Why:** Directly replacing shared seed lookup with ad hoc record queries made fresh authenticated households fail, but reusing fixture initialization polluted real households with duplex, allocation, Treasury, and portfolio sample values.

**How to apply:** For authenticated reads and mutations, use the actor household/user pair with production-safe, zero-value structural initialization. Reserve realistic sample records for explicit development/test fixtures. Remediate only exact untouched sample fingerprints; preserve near-matches and user-edited records.