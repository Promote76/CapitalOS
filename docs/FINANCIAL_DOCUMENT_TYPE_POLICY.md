# Financial Document Type Policy

Capital OS treats an upload button as an expected type, not as proof of type. Every supported upload is inspected with deterministic PDF text and structural signals before parser authority is assigned.

## Rules

- Content signals are authoritative for mismatch warnings; filenames are supporting evidence only.
- High-confidence conflicts pause parser classification with `TYPE_REVIEW_REQUIRED`.
- A human approver must either apply the detected type or keep the selected type with a reason.
- Type decisions are tenant-scoped, actor-attributed, idempotent, and audited.
- Grok may explain or suggest, but cannot apply a correction, choose a canonical document, approve an owner draw, or create verified household income.
- Uploaded objects remain private App Storage evidence. A type correction never moves or deletes the object.

## Financial boundaries

Stevens Settlement, Profit & Loss, and Bank Statement are different evidence types. A settlement shows carrier-level revenue, deductions, and net settlement. A P&L summarizes accounting income and expenses for a period. A bank statement records cash activity. These views must not be summed as if they were the same income event.