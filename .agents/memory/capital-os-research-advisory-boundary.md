---
name: Research advisory decision boundary
description: Rules for persisted Research decisions, provenance snapshots, manual Schwab handoff, and later portfolio observation.
---

Research decisions are household-scoped advisory records, not proposals, shadow order intents, OMS state, or capital authority. Persist the server-derived opportunity and evidence snapshot at decision time. A Schwab handoff may only return a manual review target and explicit no-order flags. Later Schwab positions may project `OBSERVED_IN_PORTFOLIO` and thesis-monitoring status, but must never create orders, allocations, transfers, withdrawals, or balance changes.

**Why:** Research needs durable provenance and an auditable Discover → Decide → Observe loop without allowing a UI action to inherit execution or money-movement authority.

**How to apply:** Keep future Research mutations in the advisory decision boundary, refresh observation status only from read-only Schwab snapshots, and treat missing/current evidence as explicit review state rather than silently carrying forward authority.