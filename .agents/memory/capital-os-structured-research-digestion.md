---
name: Structured research digestion boundary
description: Safety and provenance rules for user-supplied structured investment research.
---

Research ingestion should prefer readable plain text while retaining strict JSON compatibility. Plain text is normalized deterministically at the ingestion boundary, not by a provider. It must reject conflicting company/ticker metadata, duplicate source IDs, ambiguous multi-source attribution, and malformed JSON-looking input. Preserve both the exact accepted payload and its canonical normalized representation with separate fingerprints, and remain household-scoped, immutable, advisory-only, and non-authoritative.

Source claims and user-supplied inferences are different evidence classes. Only source claims may become structured-research evidence, and provider citations must resolve through an exact claim reference to one persisted evidence row. Every accepted inference needs at least one valid registered source ID. Never expand a provenance category into every row or elevate an inference into a source claim.

Private uploaded sources may be identified by a reviewed title without a public URL. Their exact reviewed evidence reference and original provenance class must remain linked through provider synthesis; never broaden one cited upload into every row of the same provenance class.

**Why:** Requiring users to author a schema creates avoidable failures, while provider-inferred or ambiguous provenance can create plausible-looking but false evidence in a financial planning system.

**How to apply:** One source may be linked automatically, including a private title-only source; with multiple sources, each fact or observation needs an explicit source ID. For any research format or provider schema change, preserve strict conflict-aware parsing, exact payload binding, item-level evidence references, blocked-run audit retention, safe summary-only projections, and tests proving no order, ledger, capital, or Micro-Live side effects.