---
name: Derived intelligence hydration
description: Safe initialization behavior for persisted, derived Capital OS intelligence records.
---

Persisted intelligence analyses and insights are derived from authoritative household, property, portfolio, strategy, and risk services. When those derived tables are newly introduced or empty for an existing household, the first read should deterministically hydrate them once before rendering the advisory view.

**Why:** Existing households evolve additively, so a schema change can leave derived intelligence rows absent even though the underlying financial data is present. Rendering an empty analyst desk makes the product appear broken and hides the available evidence.

**How to apply:** Keep hydration advisory-only, idempotent, and sourced from deterministic domain services. Record the refresh in the audit ledger, and never treat hydration as permission to mutate allocations, protected capital, or Governor policy.