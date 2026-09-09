---
name: Structured research digestion boundary
description: Safety and provenance rules for user-supplied structured investment research.
---

Structured research ingestion must reject ambiguous aliases and unsupported fields, preserve both the exact accepted payload and its canonical normalized representation with separate fingerprints, and remain household-scoped, immutable, advisory-only, and non-authoritative.

Source claims and user-supplied inferences are different evidence classes. Only source claims may become structured-research evidence, and provider citations must resolve through an exact claim reference to one persisted evidence row. Never expand a provenance category into every row or elevate an inference into a source claim.

**Why:** Category-wide citation mapping or mismatched original/canonical payloads can create plausible-looking but false provenance in a financial planning system.

**How to apply:** For any structured research format or provider schema change, preserve strict conflict-aware parsing, exact payload binding, claim-level evidence references, blocked-run audit retention, safe summary-only projections, and tests proving no order, ledger, capital, or Micro-Live side effects.