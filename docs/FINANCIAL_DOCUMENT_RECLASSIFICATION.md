# Financial Document Reclassification

Reclassification is an explicit review workflow, not a metadata overwrite.

1. The upload is hashed and stored under `/objects/uploads/<opaque-object-id>`.
2. A deterministic detector records the selected type, detected type, confidence, signals, and detector version.
3. A high-confidence mismatch is held for review.
4. `USE_DETECTED_TYPE` creates an audited correction and a new parser generation in one database transaction.
5. The old generation is marked `SUPERSEDED_BY_TYPE_CORRECTION`; its object, hash, metadata, parse evidence, and audit events remain available.
6. A corrected P&L is reparsed into `ProfitLossDocument` and `ProfitLossLine` rows. It remains review-gated and never creates household income automatically.
7. Prior settlement-derived state is marked superseded and excluded from current business-period reconciliation.

`KEEP_SELECTED_TYPE` is also explicit and requires a reason. The override is recorded even when no type change is applied.

The correction route is household-scoped and protected by the existing approver permission. Repeating the same idempotency key returns the current document without creating another parser generation or correction.