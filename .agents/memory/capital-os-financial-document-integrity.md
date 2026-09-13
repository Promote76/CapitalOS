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

Irreversible object deletion must be driven by a durable, retryable operation recorded before the first object is removed. Persist per-object progress, reconcile confirmed absence only under that prior authorization, and finalize the originally authorized source set independently of unrelated additions.

**Why:** PostgreSQL and object storage cannot commit atomically. A timeout after an applied object DELETE, a process crash before progress persistence, or unrelated household activity during retry can otherwise leave live evidence pointing at missing source files.

**How to apply:** Preflight every source first; archive intent and progress synchronously; make retries use the original fingerprint and source reservation; prove protected IDs were not removed while allowing unrelated additions; create the immutable completion tombstone only after database cleanup verifies.

Failed parsing must be retryable against the preserved source object rather than relying on a duplicate upload. A retry must be role-protected, reasoned, idempotent, append a parser generation, and retain the original source metadata.

**Why:** Hash-based duplicate detection can return the existing failed document, so asking an operator to upload the same file again does not repair the evidence.

**How to apply:** Offer a parser retry only for unverified bank-statement evidence, verify the source hash before recording results, refuse to replace reviewed child rows, and keep retry failures in the same human-review boundary.