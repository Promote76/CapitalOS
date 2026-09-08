# Bank Statement Ingestion

PDF, CSV, and XLSX files are private App Storage evidence. A bank statement
creates a `bank_statement_documents` record and any extracted rows belong in
`bank_statement_transactions` with `DOCUMENT_EVIDENCE_PENDING_REVIEW`.
There is intentionally no automatic path from this table to `finance_transactions`;
review evidence is not an authoritative ledger write and this system performs no
bank writes.

## Parser and provenance boundary

`bank-statement-v1` accepts one structured CSV or XLSX worksheet with recognizable
date, description, and amount (or debit/credit) headers. Money is parsed as an
exact two-decimal value; malformed or ambiguous rows are retained only as an
explicit parsing error and are never guessed. Each accepted row stores its
immutable `originalValue`, source line/region, fingerprint, parser version, and
review state. Corrections are separate `correctedValue` evidence with an
actor-attributed reason and audit event.

PDF statements use `pdftotext -layout` only when a page contains an unambiguous
Date/Description/Amount-or-Debit-Credit heading and every candidate row matches
that layout. It records page and source line. A missing account/period identifier,
missing heading, malformed row, encrypted/image-only file, or ambiguous columns
fails closed to `NEEDS_REVIEW`; no partial PDF row set is persisted. Duplicate fingerprints within a statement are
blocked by a unique constraint; matching rows from another document are marked
for user review rather than imported twice.

## Central review mapping

The review queue makes fixed, household-scoped set queries for: financial
documents, statement evidence, settlement/P&L documents, settlement math
variance, P&L reconciliation mismatch, settlement cash matches, unreviewed
economic-treatment deductions, advances, unknown/review escrow movements,
unverified income evidence, and pending budget transactions. Queue rows expose
only their own and related source entity IDs, never household IDs. There is no
persisted standalone “possible deposit” model; settlement cash-match statuses
are its available evidence mapping.

Settlement links have an optional database foreign key with `ON DELETE SET NULL`;
the foreign key provides referential integrity without deleting bank evidence.
Tenant ownership remains enforced in the reviewing service because a foreign key
cannot express same-household ownership. The review transaction
queries the settlement by both ID and household before mutation, rejects missing,
foreign, and rejected records, and keeps a safe not-found response so a UUID
cannot disclose another household's settlement.
