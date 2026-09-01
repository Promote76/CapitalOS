---
name: Micro-Live fail-closed architecture
description: Durable boundary for future real-money strategy experiments in Capital OS.
---

Micro-Live must remain disabled by default and separate rehearsal, eligibility, human arming, and real venue connectivity. A readiness score or graduation result is never permission to transmit an order.

**Why:** A family-capital system must assume strategy, venue, data, database, and risk components can fail independently; no one component should be able to create catastrophic exposure.

**How to apply:** Keep household and protected capital inaccessible, require venue and market allowlists, enforce server-side limits before any adapter call, reconcile against venue-authoritative state, and keep Guardian authority limited to containment.