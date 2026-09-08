# Document-to-Budget Bridge

## Purpose and authority boundary

This bridge is the controlled path from a reviewed bank-statement row to an
official household `financeTransactions` record. A parsed statement row is
**financial evidence**, not a ledger record. `financeTransactions` remains the
authority for official Budget actuals, Accounting, and normal cash-flow
calculations.

There are two separate human decisions:

1. **Evidence review** asks whether the parsed row is accurate. Row actions are
   `APPROVE`, `REJECT`, `RECLASSIFY`, `MARK_TRANSFER`, and `LINK_SETTLEMENT`;
   parent-document review may be `VERIFIED`, `REJECTED`, or `NEEDS_REVIEW`.
2. **Financial inclusion** asks whether verified, reviewed evidence should
   create one official transaction or be linked to one that already exists.

Neither upload, parsing, row approval, a category suggestion, nor parent
verification posts activity automatically. The service makes no bank write,
money movement, account-balance mutation, or verified-income event.

## Implemented path

Before a row can be imported or linked, the bridge requires:

- a statement mapped to an account owned by the same household;
- a parent document with `reviewDecision = VERIFIED`;
- a row whose last review action is `APPROVE` or `RECLASSIFY`;
- explicit `HOUSEHOLD` economic classification and an explicit selected
  category; and
- an `approve` household permission.

The category decision endpoint accepts `USER_CONFIRMED`, `USER_CORRECTED`,
`NOT_APPLICABLE_TRANSFER`, `NOT_APPLICABLE_SETTLEMENT`, or `REJECTED`. For
household evidence it requires an active same-household category. Non-household
evidence cannot receive a household category. The persisted category status
model also includes `UNCLASSIFIED` and `SUGGESTED`; suggestion fields retain
suggested ID, confidence, reason, and source. Suggestions are not inclusion
authority.

Economic classifications are `HOUSEHOLD`, `BUSINESS`, `TRANSFER`,
`SETTLEMENT_LINK`, and `UNKNOWN`. Import/link accepts only `HOUSEHOLD`.
Therefore business, transfer, settlement-linked, and unknown rows fail closed
at the bridge. In particular, category changes do not make a transfer or
settlement row eligible through this endpoint.

For a no-match row, explicit import creates one approved, non-pending official
transaction with `dataSource = bank_statement_import`, the source document and
row IDs, importer/time, source fingerprint, and import provenance metadata.
An import does not create `VerifiedHouseholdIncomeEvent`; imported deposit
metadata records `incomeVerified: false`.

For one high-confidence candidate, the human may explicitly link the row to
that existing transaction. Linking creates inclusion/provenance only and does
not create another `financeTransactions` row. The target must be in the same
household and statement account and have the selected category.

## Inclusion state machine

The declared inclusion states are:

`NOT_REVIEWED` → `READY_FOR_INCLUSION_REVIEW` → `MATCH_CANDIDATE` /
`DUPLICATE_REVIEW_REQUIRED` / `READY_TO_IMPORT` / exclusion or rejection.

Permitted terminal inclusion outcomes include `LINKED_EXISTING`,
`IMPORTED_NEW`, `EXCLUDED_TRANSFER`, `EXCLUDED_SETTLEMENT`,
`EXCLUDED_DUPLICATE`, `REJECTED`, and `REVERSED`. An included state
(`LINKED_EXISTING` or `IMPORTED_NEW`) transitions only to `REVERSED`; it does
not return to a creatable state. Current service operations persist
`IMPORTED_NEW`, `LINKED_EXISTING`, and `REVERSED`; the broader state list is a
domain transition model, not a claim that every intermediate state has a
separate persisted operation.

## Budget and downstream behavior

Budget contribution detail reads approved, non-pending, household official
transactions, excluding transactions excluded by household-spending rules.
Imported withdrawals consequently appear as official actuals only after the
explicit import. A linked existing transaction does not alter its amount or
create another actual; it adds source provenance.

Budget targets are planning snapshots and are not changed by bridge operations.
An actual never changes the target, plan total, allocation percentage, or plan
approval. If there is no target, observed activity can exist without treating
that as an “under pace” target.

The current Budget performance query separately counts selected-category
statement rows without an inclusion as pending evidence. It does not add that
amount to official actuals. Source coverage is reported as official and pending
counts. Accounting and cash flow consume official transactions rather than a
second document-evidence total.

## Security, atomicity, and audit

All bridge lookups and writes are household scoped. The service validates
accounts, categories, documents, rows, and link targets against the actor’s
household; cross-household links fail. Category decisions and financial
inclusion mutations require `approve`; reading an inclusion requires `read`.

Import, link, reconciliation, unlink, and reversal run in database
transactions. Import creates the official row, inclusion, and audit event in
one transaction. Failure rolls back the transaction. Per-row advisory locks,
per-idempotency-key advisory locks, persisted idempotency responses, and unique
household row/fingerprint indexes provide exact-once protection. A replay
returns its stored response; a second import of an already included row returns
the existing inclusion (or fails safely if reversed).

Audit events record review, category decision, import, link, source/official
mismatch, reconciliation, and reversal activity with actor, reason, IDs, and
relevant state metadata. The source row preserves original value, latest
corrected projection, and append-only correction history.
