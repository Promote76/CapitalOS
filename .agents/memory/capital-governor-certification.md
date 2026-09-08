---
name: Capital Governor certification
description: Release evidence rules for additive Safe-to-Deploy 2.0 work.
---

When adding tenant-scoped Capital Governor routes, refresh every route-inventory evidence marker before certifying; contract parity intentionally fails on stale counts.

**Why:** The authoritative route inventory and production-candidate evidence are checked independently, so a correct route can still block the release gate when evidence markers lag.

**How to apply:** After OpenAPI or route changes, run the generated-artifact and contract checks together, then record only the resulting evidence in the certification document.