---
name: Financial document integrity boundary
description: Durable rules for classifying, correcting, deduplicating, and reprocessing uploaded financial documents.
---

Financial document type is an evidence decision, not an upload-context fact. Deterministic content and structural signals may create a review hold; filenames are only weak supporting evidence.

**Why:** A misleading filename can route a business P&L into settlement logic and create unsafe downstream business-income conclusions.

**How to apply:** Preserve the original private object, hash, metadata, parser generations, and downstream links. Require a household-scoped, role-protected, reasoned, idempotent human decision before changing parser authority. Treat duplicate/version review as explicit evidence classification, never automatic deletion or merging. Corrected P&Ls remain business evidence and must not create owner draws or verified household income automatically.