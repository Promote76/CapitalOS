# Uploaded Documents and Budget Completion Report

**Date:** 2026-09-08  
**Area:** Financial Documents, Budget, Accounting, Forecasts, and Capital Governor  
**Overall assessment:** **SAFE BUT FUNCTIONALLY INCOMPLETE**

## Executive conclusion

The current implementation safely ingests and reviews uploaded bank statements, but it does **not** complete the expected workflow of using reviewed statement transactions to fill corresponding Budget categories.

Today, reviewed uploads produce a separate advisory evidence summary. They do not:

- assign transactions to Budget categories;
- create observed spending or income by category;
- match an uploaded row to an existing financial transaction;
- populate monthly category actuals;
- recommend a category mapping;
- alter planned category targets; or
- become official Accounting activity.

This means the implementation is correct as an evidence-isolation layer, but incomplete as a document-to-budget workflow.

## What the user reasonably expects

A complete workflow should allow a family to:

1. Upload a bank statement.
2. Review each parsed transaction.
3. Confirm or change the suggested Budget category.
4. Mark transfers and duplicates so they are not counted as income or spending.
5. Approve selected rows for inclusion in household financial activity.
6. See approved rows reflected in the corresponding Budget category's observed actuals.
7. Compare actual category activity with the approved monthly plan.
8. Preserve source-document, source-line, correction, reviewer, and audit provenance.

The current implementation stops after step 2 and shows aggregate evidence instead of completing steps 3–8.

## Current end-to-end behavior

### 1. Upload and ingestion

The Documents workflow:

- issues a private upload grant;
- validates file ownership, path, content type, size, and hash;
- deduplicates documents within the household;
- parses supported bank-statement PDF, CSV, and XLSX files;
- creates a parent financial-document record;
- creates a bank-statement header;
- creates reviewable statement transaction rows; and
- records source and parser provenance.

Parser errors remain explicit and prevent the parent statement from being verified.

**Status:** Complete.

### 2. Statement transaction review

Each parsed row can be:

- approved;
- rejected;
- reclassified;
- linked to a settlement; or
- marked as a transfer.

Corrections, including corrected amounts, retain audit history. Parent review and child review are serialized so the parent cannot be verified while child rows or parser errors remain unresolved.

A rejected parent statement excludes all of its child evidence from downstream advisory totals while preserving previously completed child-review history.

**Status:** Complete as an evidence-review process.

### 3. Advisory Budget evidence

Budget receives a `documentEvidence` summary containing:

- reviewed and pending document counts;
- reviewed and pending row counts;
- reviewed deposit and withdrawal totals;
- transfer and settlement-link exclusion counts;
- source document IDs;
- latest statement period and date;
- readiness status; and
- an explicit `affectsOfficialTotals: false` boundary.

Only rows resolved through `APPROVE` or `RECLASSIFY` contribute to these advisory totals. Corrected amounts are used. Pending, rejected, transfer, and settlement-linked rows are excluded.

**Status:** Complete, but this is a summary rather than category utilization.

### 4. Budget category planning

Official monthly Budget categories are stored separately in planning periods and category snapshots. Planned targets change only through the Budget planning workflow.

Category actuals and weekly guidance are derived from eligible, reviewed household `financeTransactions`, not from uploaded bank-statement evidence rows.

There is currently no persisted category assignment on an uploaded statement row and no bridge that creates or links an approved `financeTransaction`.

**Status:** Incomplete.

### 5. Accounting

Accounting now counts reviewed household documents, but its balances, cash flow, income, expenses, and category totals continue to use official accounts and financial transactions.

Uploaded statement amounts do not enter Accounting.

**Status:** Safe and internally consistent, but it cannot show category activity from uploaded statements until an explicit import/link workflow exists.

### 6. Forecasts and variable income

Forecasts use:

- verified household income events;
- approved or closed Budget snapshots;
- bills and upcoming obligations;
- included financial accounts;
- reserves and goals; and
- other approved planning inputs.

Uploaded statement evidence does not alter income scenarios, forecast math, or planned targets.

**Status:** Correct for the current authority model.

### 7. Capital Governor

Capital Governor uses uploaded documents only as a readiness signal:

- pending, missing-header, or parser-failed statement evidence can make data unreconciled;
- a correctly rejected statement is terminal and non-blocking; and
- uploaded amounts never become available or deployable cash.

**Status:** Complete as a risk boundary.

## Where the workflow disconnects

The missing bridge is:

```text
Uploaded statement row
  → category suggestion
  → human-confirmed category
  → duplicate/transfer check
  → explicit import or link approval
  → official household finance transaction
  → Budget category actual
  → weekly guidance, Accounting, and forecast refresh
```

At present, `RECLASSIFY` means “correct the reviewed evidence.” It does not mean “assign this row to an official Budget category.”

The system therefore has two disconnected transaction models:

1. **Bank-statement evidence rows** — source-faithful, reviewable, and advisory.
2. **Household financial transactions** — categorized, official planning and Accounting inputs.

No controlled conversion or linkage exists between them.

## Required corrected implementation

### A. Add category mapping to statement review

Each eligible uploaded row should support:

- suggested category ID;
- suggestion confidence and reason;
- user-selected category ID;
- category decision status;
- decision actor and timestamp; and
- category correction history.

The mapping must reference a household-owned finance category.

### B. Separate evidence approval from financial inclusion

Two decisions should remain explicit:

1. **Evidence decision:** Is the parsed row accurate?
2. **Financial inclusion decision:** Should this row be linked or imported into official household activity?

Approving parsed evidence alone should not silently post it.

### C. Match before creating

Before import, the system should attempt to match the row to an existing transaction using household-scoped evidence such as:

- account;
- posted date;
- signed amount;
- normalized description;
- provider/native identifier;
- statement source fingerprint; and
- an explicit duplicate-resolution decision when matching is ambiguous.

The operation should either:

- link to one existing transaction;
- create one new official transaction; or
- stop for duplicate review.

It must never create two official transactions from the same statement row.

### D. Preserve transfer and settlement exclusions

Rows marked as transfers must not create income or expense category activity.

Settlement-linked deposits must not become ordinary household income when the settlement workflow already represents the same economic event.

These exclusions must survive later category changes and reprocessing.

### E. Populate observed actuals, not planned targets

Imported or linked rows should populate the observed/actual side of the corresponding Budget category.

They should not rewrite the family's approved monthly targets. Target changes should remain a separate planning decision.

The Budget should display:

- planned amount;
- observed actual from official transactions;
- pending reviewed evidence not yet imported;
- variance;
- source coverage; and
- duplicate or reconciliation warnings.

### F. Make reversals explicit

If an imported row is later rejected or corrected:

- the linked official transaction must not be silently deleted;
- the system should require an explicit unlink, reversal, or correction action;
- the audit trail must preserve before-and-after values; and
- dependent Budget, Accounting, forecast, and Governor views must refresh.

### G. Refresh all affected surfaces

After an import, link, correction, or reversal, invalidate/refetch:

- Documents and review queue;
- Budget category actuals;
- monthly period details;
- weekly guidance;
- Accounting;
- cash-flow forecasts;
- variable-income intelligence when applicable; and
- Capital Governor readiness and result.

## Safety requirements

The corrected workflow must retain the current safety controls:

- household and role scoping;
- exact integer-cent calculations;
- source hash and row-fingerprint idempotency;
- parent/child transactional locking;
- immutable original evidence;
- explicit correction history;
- reviewer attribution;
- audit events;
- duplicate detection;
- transfer durability;
- settlement double-count protection;
- no automatic verified-income creation;
- no account-balance mutation from a statement upload;
- no direct ledger posting without an explicit import decision; and
- no money movement or deployment authority.

## Completion criteria

The document-to-budget workflow should not be considered complete until all of the following pass:

1. A reviewed withdrawal can be assigned to a household Budget category.
2. Explicit import creates or links exactly one official household transaction.
3. The corresponding Budget category actual increases by the exact corrected amount.
4. Planned category targets remain unchanged.
5. Transfers and settlement-linked deposits remain excluded.
6. Duplicate statement rows cannot create duplicate official transactions.
7. Cross-household category, account, transaction, and source links are rejected.
8. Rejected parent statements cannot contribute category actuals.
9. Corrections and reversals preserve audit history.
10. Budget, Accounting, forecasts, and Governor refresh consistently.
11. Uploaded evidence alone never creates verified income, balances, or deployable cash.
12. Authenticated browser certification demonstrates the full upload-to-category journey.

## Current certification summary

The current implementation has passed its existing evidence-safety tests, typechecks, API contract checks, generated-artifact checks, database fixtures, and authenticated Budget certification.

Those checks certify that the advisory evidence boundary works safely. They do **not** certify document-to-category population because that workflow does not yet exist.

## Final decision

**Evidence ingestion and review:** COMPLETE  
**Advisory Budget evidence summary:** COMPLETE  
**Risk and authority isolation:** COMPLETE  
**Automatic category population:** NOT IMPLEMENTED  
**Human-approved category utilization:** NOT IMPLEMENTED  
**Uploaded-document-to-Budget workflow:** INCOMPLETE

The recommended correction is not to make uploads automatically authoritative. It is to add a controlled, human-approved bridge from reviewed evidence to categorized official transactions so Budget actuals reflect the uploaded statement without silently changing the family's plan.