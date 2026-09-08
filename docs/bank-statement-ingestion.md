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

## Review and planning consumption boundary

Each row records its explicit last review action (`APPROVE`, `REJECT`,
`RECLASSIFY`, `LINK_SETTLEMENT`, or `MARK_TRANSFER`); a generic resolved status
never implies that it is income or cash. A statement header cannot be verified
while parser errors exist or any extracted child remains unreviewed. Rejecting a
statement rejects only its still-pending children and retains prior reviewer
history.

Variable Budget Intelligence exposes household-scoped document evidence as an
advisory summary. Its reviewed deposit and withdrawal totals include only
resolved `APPROVE` and `RECLASSIFY` rows, and exclude transfers, linked
settlements, pending rows, and rejected rows. The summary identifies source
*document IDs* only and explicitly reports `affectsOfficialTotals: false`.
It cannot update verified household income, account balances, finance
transactions, accounting cash flow, a ledger, or money movement. Accounting's
tax-document count similarly reports reviewed evidence only and changes no
accounting balance or cash-flow calculation.

Capital Governor never consumes statement totals as cash. When uploaded
statement rows remain pending, that existing evidence is reflected solely as an
`UNRECONCILED` data-readiness condition; no upload is required when no such
evidence exists.
