---
name: Daily Ops review history boundary
description: Durable boundary for operator journal entries and Guided Run handoffs.
---

Daily Ops history is a household-scoped review trail, not a financial authority. Journal entries store server-derived actor and timestamp alongside decision context, evidence links, and unresolved blockers; Guided Run state is accompanied by append-only reasoned action events.

**Why:** Handoffs and monthly closeout reviews must survive a browser session without implying that a checklist completion changed Treasury, Accounting, allocations, or execution state.

**How to apply:** Keep future Daily Ops mutations authenticated and household-scoped, derive ownership and timestamps on the server, require explicit reasons for run actions, and keep financial source systems authoritative.