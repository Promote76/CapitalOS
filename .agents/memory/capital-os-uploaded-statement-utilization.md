---
name: Uploaded statement utilization
description: Safety boundary for using reviewed bank-statement uploads across Budget and readiness surfaces.
---

Uploaded bank-statement rows begin as household-scoped evidence and receive advisory category suggestions only from that household's active categories. A statement must be mapped to an explicit household account, its parsed row reviewed, its category separately confirmed or corrected, and its financial inclusion explicitly approved before it can link or create one official transaction. A rejected parent makes unresolved child evidence ineligible even when terminal child history is preserved. Reclassified monetary corrections become the effective amount; transfers, settlement-linked deposits, rejected rows, and pending rows remain excluded.

**Why:** Uploaded documents are evidence, not authority. Explicit account, category, duplicate, and inclusion decisions prevent parser output or contradictory parent/child states from double-counting income or spending. Even an included row must never create false capital availability.

**How to apply:** Keep evidence approval separate from category review and from financial inclusion. Included official transactions may update observed Budget actuals and downstream read models, but never planned targets, account balances, verified income, or deployable cash. Preserve source, corrections, reversals, and audit history; ambiguous matches and invalid account, sign, date, transfer, or settlement states fail closed.