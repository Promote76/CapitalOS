---
name: Execution control authority
description: The durable safety boundary for future Micro-Live execution-control work
---

The PostgreSQL execution-control state is the authoritative household-scoped source for execution authority. Legacy risk emergency-stop state must be updated as a compatibility projection of successful control transitions, never used as an independent browser or service authority.

**Why:** A local UI flag or a second risk-state source can diverge across sessions, reloads, and API processes; order-intent creation must be stopped by the server before the OMS boundary.

**How to apply:** Keep transitions explicit and fail closed. Require actor-derived household scope, recent authentication for mutations/recovery, immutable transition audit evidence, idempotency, concurrency protection, and independent Guardian/risk checks before any executable intent.