# Bank Statement Ingestion

PDF and CSV files may be parsed as private App Storage evidence. XLSX may still be uploaded as review evidence, but structured XLSX parsing is intentionally disabled until a maintained parser replaces the vulnerable SheetJS dependency.

A bank statement creates a `bank_statement_documents` record and any extracted rows belong in `bank_statement_transactions` with `DOCUMENT_EVIDENCE_PENDING_REVIEW`. There is intentionally no automatic path from this evidence table to `finance_transactions`; review evidence is not an authoritative ledger write and this system performs no bank writes.

## Parser and provenance boundary

`bank-statement-v3` accepts structured CSV with recognizable date, description, and amount (or debit/credit) headers. PDF extraction uses the runtime `pdftotext -layout` dependency supplied by Poppler. Wells Fargo activity-summary / transaction-history layouts receive a dedicated parser that supports wrapped descriptions, account last-four extraction, statement periods, deposits, withdrawals, balances, and December-to-January year rollover.

Money is parsed as exact two-decimal values. Missing statement-level financial values remain `null` / UNKNOWN; they are never converted to `0.00`. Zero is treated as a factual source value only when the statement actually reports zero.

For Wells Fargo statements, parsed transaction rows must reconcile exactly, in integer cents, to any available statement deposit and withdrawal totals. When opening balance, total deposits, total withdrawals, and closing balance are all available, the parser also requires:

`opening + deposits - withdrawals = closing`

A reconciliation mismatch fails closed to `NEEDS_REVIEW`; no partial transaction row set is persisted.

Malformed or ambiguous rows are never guessed. Each accepted row stores its immutable `originalValue`, source page/line/region, fingerprint, parser version, and review state. Corrections are separate `correctedValue` evidence with an actor-attributed reason and audit event.

PDF statements fail closed when extraction fails, the activity layout is ambiguous, transaction-like text lacks an unambiguous heading, a row cannot be parsed, or statement reconciliation fails. Encrypted, image-only, and corrupt PDFs therefore remain review evidence instead of producing fabricated transactions.

## Runtime and CI contract

Production PDF parsing requires Poppler/`pdftotext`; the Replit runtime declares that dependency explicitly. GitHub CI installs the same dependency and runs both parser/unit coverage and the object-storage/database Financial Inbox integration test as a required step.

Public test fixtures must use unmistakably synthetic or masked account identifiers. Repository hygiene checks reject unmasked account-number-like fixture values.

## Central review mapping

The review queue makes fixed, household-scoped set queries for financial documents, statement evidence, settlement/P&L documents, settlement math variance, P&L reconciliation mismatch, settlement cash matches, unreviewed economic-treatment deductions, advances, unknown/review escrow movements, unverified income evidence, and pending budget transactions. Queue rows expose only their own and related source entity IDs, never household IDs.

Settlement links have an optional database foreign key with `ON DELETE SET NULL`; tenant ownership remains enforced in the reviewing service because a foreign key cannot express same-household ownership.

## Review and planning consumption boundary

Each row records its explicit last review action (`APPROVE`, `REJECT`, `RECLASSIFY`, `LINK_SETTLEMENT`, or `MARK_TRANSFER`). A generic resolved status never implies that a row is income or cash. A statement header cannot be verified while parser errors exist or any extracted child remains unreviewed.

Variable Budget Intelligence may consume reviewed statement evidence only as an advisory summary. It cannot update verified household income, account balances, finance transactions, accounting cash flow, a ledger, or money movement. Capital Governor likewise never consumes raw statement totals as cash.
