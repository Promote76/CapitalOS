# Statement Transaction Import Policy

## Policy

Statement transactions are evidence until a human makes a separate inclusion
decision. The only implemented creation path is **Import as official
transaction** for a reviewed household row with no match. A successful import
creates exactly one official `financeTransactions` record; it is not a bank
write, transfer of funds, balance update, plan update, or income verification.

The source must be a same-household statement mapped to a same-household
financial account. The parent document must be `VERIFIED`; the row must have
been `APPROVE`d or `RECLASSIFY`ed. The actor must have effective `approve`
permission. Requests use an idempotency key and are serialized per household
and statement row.

## Classification is fail closed

The reviewer must explicitly classify the row as `HOUSEHOLD` and choose an
active category belonging to that household. Cross-household or inactive
categories are rejected server-side.

`BUSINESS`, `TRANSFER`, `SETTLEMENT_LINK`, and `UNKNOWN` cannot be imported or
linked as household activity. A non-household classification cannot carry a
household category. This protects against treating business spending as a
household Budget actual, internal movement as income/expense, or a
settlement-linked deposit as ordinary household income.

An uploaded or imported deposit does not create a
`VerifiedHouseholdIncomeEvent`. Its imported transaction is marked in metadata
as not income verified. Any economic-income determination remains in the
separate income-review workflow.

## Match-before-create

Import always obtains a match preview first. Only `NO_MATCH` permits creation.
Any existing linkage, high-confidence candidate, or multiple-candidate outcome
blocks creation and requires the applicable human link or duplicate review.
The API does not turn a match into an automatic link.

With `ONE_HIGH_CONFIDENCE_MATCH`, a reviewer can explicitly use **Link to
existing transaction**. The selected target must be the sole preview
candidate, same household/account, and have the selected category. Linking
does not change official transaction count or mutate the linked transaction.

## Exact value and provenance

Amounts are parsed and normalized as signed decimal money with at most two
fraction digits. Bridge comparisons and imported values use integer-cent
normalization, so `78.00`, `900.00`, and `1735.00` retain their exact cents
without ×100/÷100 conversion ambiguity. If evidence was corrected before
import, the corrected amount is the amount imported.

The new official transaction retains source type/data source, source document
ID, source statement-row ID, deterministic statement-row fingerprint, import
actor/time, evidence fingerprint, and provenance metadata. That supports
navigation from official activity back to statement evidence. A row never
becomes authoritative merely because it has a parser fingerprint.

## Idempotency and transactions

The durable inclusion table has unique constraints on household + statement row
and household + row fingerprint. The service also locks the row and operation
key, stores an idempotency response, and rejects an idempotency key reused for
a different operation. Concurrent attempts for one row therefore yield one
official transaction or a safe existing-inclusion/idempotent result. A
reversed row cannot be imported again without explicit reconciliation.

Creation, inclusion record, and import audit event are one database
transaction. Validation or insert failure rolls them back together.
