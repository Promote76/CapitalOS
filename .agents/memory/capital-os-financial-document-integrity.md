---
name: Financial document integrity boundary
description: Durable rules for classifying, correcting, deduplicating, and reprocessing uploaded financial documents.
---

Financial document type is an evidence decision, not an upload-context fact. Deterministic content and structural signals may create a review hold; filenames are only weak supporting evidence.

**Why:** A misleading filename can route a business P&L into settlement logic and create unsafe downstream business-income conclusions.

**How to apply:** Preserve the original private object, hash, metadata, parser generations, and downstream links. Require a household-scoped, role-protected, reasoned, idempotent human decision before changing parser authority. Treat duplicate/version review as explicit evidence classification, never automatic deletion or merging. Corrected P&Ls remain business evidence and must not create owner draws or verified household income automatically.

Idempotent response bodies persisted in JSONB may replay timestamp fields as ISO strings rather than runtime `Date` objects. Keep the API schema responsible for date coercion and compare semantic fields in direct service tests.

**Why:** The database round trip is part of the idempotency contract, so runtime object identity is not stable even when the API response is equivalent.

**How to apply:** When adding financial-document mutations that persist response bodies for replay, verify the business/state invariants and let generated response schemas normalize date-like values at the route boundary.