# Financial Evidence vs. Official Activity

## Two records, two meanings

`bankStatementTransactions` stores parsed uploaded-statement evidence:
description, source amount, date, source page/line/region, source fingerprint,
original values, corrections, and evidence review. It has no trigger or service
that independently promotes it to `financeTransactions`.

`financeTransactions` stores official household activity. Budget actuals,
Accounting, and normal cash-flow calculations read official transactions under
their existing review/classification exclusions. The bridge is the durable
connection between the two, recorded in `statementFinancialInclusions`.

Thus “evidence approved” answers whether the parsed source row is accepted; it
does **not** answer whether the row should be counted as official activity.
Category suggestion also has no authority. Human evidence review, category and
economic classification, duplicate resolution, and explicit import or link are
separate controls.

## What is authoritative

An imported row creates an approved, non-pending official transaction only
after all import preconditions pass. A linked row points to an existing
official transaction and contributes no second official amount. Pending
reviewed evidence can be displayed by Budget separately, but it is not added
to authoritative actuals.

The official transaction preserves `sourceDocumentId`,
`sourceStatementRowId`, a row fingerprint, import actor/time, and
bank-statement provenance. It can therefore be identified as statement
imported rather than indistinguishable manual activity. The source remains
available with its page/line and correction history.

## Budget, income, and plan boundaries

Budget actuals use eligible official transactions; they do not total documents.
A bridge import can affect actuals under the selected category, while planned
targets remain immutable. It cannot set a target, change Budget totals or
allocations, or approve a planning period.

Evidence and imported deposits are not verified income. The bridge does not
create verified income history. Classification of an inflow as verified
household income remains an explicit, separate workflow. Transfers and
settlement-linked evidence fail closed from ordinary household inclusion, and
business/unknown evidence is likewise blocked.

## Corrections and rejected sources

Evidence corrections are append-only. The source row keeps original evidence
and its latest corrected projection. When an amount is corrected after an
import/link and differs from the official amount, the official transaction is
not silently changed. The inclusion is marked `reviewRequired` with
`SOURCE_OFFICIAL_MISMATCH` and reconciliation `REQUIRED`.

Changing category or classification after a non-reversed inclusion similarly
opens this mismatch gate; it does not silently rewrite Accounting. A parent
statement rejection rejects unresolved child evidence but does not delete
previous official activity. Imported/linked children are flagged for source /
official mismatch review. An approver may explicitly mark the inclusion
reconciliation resolved; that action records actor/time and audit history. It
does not itself alter the official amount or category.
