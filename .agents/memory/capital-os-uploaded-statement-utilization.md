---
name: Uploaded statement utilization
description: Safety boundary for using reviewed bank-statement uploads across Budget and readiness surfaces.
---

Uploaded bank-statement rows may support a household-scoped advisory evidence summary only after explicit row review. A rejected parent makes all of its child evidence ineligible even when terminal child history is preserved. Reclassified monetary corrections become the effective advisory amount; transfers, settlement-linked deposits, rejected rows, and pending rows remain excluded.

**Why:** Uploaded documents are evidence, not authority. Treating parser output or contradictory parent/child states as official activity can double-count income or spending and can create false capital availability.

**How to apply:** Display reviewed evidence and provenance separately from official totals. Pending or parse-failed statements may block readiness, while terminal rejected statements do not. Never use uploaded amounts to post ledger entries, change balances, establish verified income, alter forecast math, or authorize deployment.