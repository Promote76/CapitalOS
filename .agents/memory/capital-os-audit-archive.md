---
name: Capital OS audit archive
description: Durable internal audit-history boundary and its migration implications.
---

For the internal Capital OS boundary, every production audit writer must use one centralized application boundary. The domain mutation, source event, archive copy, hash-chain append, and chain-head update commit in the same database transaction. Household chains, the global system chain, and legacy backfill chains remain distinct.

**Why:** Replit’s managed structural Publish path does not propagate PostgreSQL functions or triggers. Application-owned transactional dual-write preserves fail-closed atomicity using ordinary tables, columns, indexes, and transactions that can reach production through supported schema publishing.

**How to apply:** Keep all audit writes behind the centralized boundary; never add direct source/archive writes. Run legacy backfill only through the bounded, owner-approved, recently reverified action. Readiness requires completed backfill, full parity, valid chains, and a fresh persisted verification marker. Offsite immutable checkpointing remains a separate defense-in-depth phase.