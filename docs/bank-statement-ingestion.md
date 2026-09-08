# Bank Statement Ingestion

PDF, CSV, and XLSX files are private App Storage evidence. A bank statement
creates a `bank_statement_documents` record and any extracted rows belong in
`bank_statement_transactions` with `DOCUMENT_EVIDENCE_PENDING_REVIEW`.
There is intentionally no automatic path from this table to `finance_transactions`;
review evidence is not an authoritative ledger write and this system performs no
bank writes.
