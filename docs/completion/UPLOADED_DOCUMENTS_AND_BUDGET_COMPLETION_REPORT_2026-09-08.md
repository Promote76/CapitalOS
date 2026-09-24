# Uploaded Documents and Budget Completion Report

**Date:** 2026-09-08  
**Area:** Financial Documents, Budget, Accounting, Forecasts, and Capital Governor  
**Overall assessment:** **IMPLEMENTED — DOCUMENT-TO-BUDGET BRIDGE CERTIFIED 30/30**

> **Post-implementation update (2026-09-08):** This report originally documented the gap that led to the document-to-Budget bridge work. That gap has now been implemented. The historical analysis below is retained as the design and safety rationale; statements written in the present tense about the bridge being absent describe the pre-implementation baseline, not the current product.

> **Production upload-location audit (2026-09-08):** The real uploaded PDFs were found in production App Storage. Their persisted paths use the expected private `/objects/uploads/<opaque-object-id>` format. They were not uploaded into the project filesystem or the public-assets area. Two P&L files were, however, submitted through the Stevens Settlement intake and therefore received the wrong document type even though their physical storage location is correct.

> **Financial document integrity update (2026-09-08):** The type-integrity sprint is now implemented. New uploads are classified from PDF content and structural signals rather than filenames alone; high-confidence mismatches enter an audited, role-protected review flow; parser generations and source evidence are preserved; exact-hash duplicates are idempotent; and explicit duplicate/version reviews prevent automatic merging or deletion. The two known production P&L records have **not** been mutated. They remain pending authorized review and managed-production certification.

> **Authorized production remediation update (2026-09-08):** Both known P&L objects were found, their stored SHA-256 hashes matched, and current content detection classified both as high-confidence `BUSINESS_PROFIT_AND_LOSS`. Managed Publish has applied migration `0037_zippy_plazm.sql` and production schema parity now passes. The correction remains **BLOCKED**, not simulated, because this household has no existing `BusinessEntity`; the server-authorized P&L correction requires a valid existing business before downstream authority can be rebuilt. The observed `[REDACTED_PRODUCTION_AMOUNT]` remains two reviewed manual household transactions, not verified household income.

## Executive conclusion

The implementation now provides a controlled, human-approved bridge from reviewed bank-statement evidence to categorized official household transactions and Budget actuals.

Reviewed uploads still produce a separate advisory evidence summary and do not become official activity merely through evidence approval. A separate category decision and explicit link-or-import action now:

- records a household-scoped category suggestion, confidence, and rationale;
- lets the reviewer confirm or change the category independently of parsed-evidence approval;
- previews household-scoped matches before creation;
- links one existing transaction or creates exactly one new transaction;
- populates monthly category actuals from eligible official transactions; and
- preserves planned targets and all financial-authority boundaries.

Transfers, settlement-linked rows, ambiguous duplicates, invalid signs, foreign accounts or categories, and out-of-policy dates fail closed. Corrections, unlinking, import reversals, source provenance, and audit history remain explicit.

The financial-document integrity boundary is also implemented. A document's selected upload context is not treated as proof of type. P&L, Stevens Settlement, and Bank Statement evidence are classified separately; corrected parser generations supersede prior generations without deleting the original private object; and superseded settlement state is excluded from current business-income reconciliation. P&L evidence remains business evidence and does not automatically create owner draws or verified household income.

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

The current implementation completes steps 3–8 through explicit category-decision and financial-inclusion actions. Evidence approval alone still stops safely before official activity.

## Current end-to-end behavior

### 1. Upload and ingestion

The Documents workflow:

- issues a private upload grant;
- validates file ownership, path, content type, size, and hash;
- deduplicates documents within the household;
- parses supported bank-statement PDF and CSV files; XLSX uploads remain review evidence and structured XLSX parsing is disabled;
- creates a parent financial-document record;
- creates a bank-statement header;
- creates reviewable statement transaction rows; and
- records source and parser provenance.

Parser errors remain explicit and prevent the parent statement from being verified.

**Status:** Complete.

#### Production upload-path audit

A read-only production database inspection found ten real PDF document records. Every record points to the expected private App Storage namespace:

```text
/objects/uploads/<opaque-object-id>
```

This is the normalized application path stored in `financial_documents.source_object_path`. The file bytes are held in the project's private App Storage bucket; the path is not a local directory under the Replit project and is not the public `/storage/public-objects/` area.

The historical workspace attachment directory was inspected during the original review and did not contain the family financial source documents. Operational attachment and screenshot directories are no longer retained in the public repository.

##### Located production records

| Uploaded filename | Persisted private object path | Recorded document type | Status | Audit finding |
| --- | --- | --- | --- | --- |
| `settlement evidence [REDACTED].pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | Correct private storage namespace; likely another copy/version of the settlement document. |
| `production P&L D.pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | **Wrong intake classification.** The filename indicates P&L, but the record was created as a Stevens Settlement document. |
| `production P&L C.pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | **Wrong intake classification.** The filename indicates P&L, but the record was created as a Stevens Settlement document. |
| `production P&L B.pdf` | `/objects/uploads/[REDACTED]` | `BUSINESS_PROFIT_AND_LOSS` | `VERIFIED` | Correct private storage namespace and document type. |
| `production P&L A.pdf` | `/objects/uploads/[REDACTED]` | `BUSINESS_PROFIT_AND_LOSS` | `VERIFIED` | Correct private storage namespace and document type. |
| `settlement evidence [REDACTED].pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | Correct private storage namespace; appears to be one of several uploaded copies/versions. |
| `settlement evidence [REDACTED].pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | Correct private storage namespace; appears to be one of several uploaded copies/versions. |
| `settlement evidence [REDACTED].pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | Correct private storage namespace; appears to be one of several uploaded copies/versions. |
| `settlement evidence [REDACTED].pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | Correct private storage namespace; appears to be one of several uploaded copies/versions. |
| `settlement evidence [REDACTED].pdf` | `/objects/uploads/[REDACTED]` | `STEVENS_SETTLEMENT` | `VERIFIED` | Correct private storage namespace; appears to be the first settlement upload in this group. |

##### Conclusion and corrective guidance

- **Storage location:** Correct. All ten production records use private App Storage.
- **Wrong-location concern:** Not confirmed. No real financial PDFs were found in the workspace upload folder or public object namespace.
- **Wrong intake/type confirmed:** `production P&L C.pdf` and `production P&L D.pdf` were recorded as `STEVENS_SETTLEMENT`, most likely because **Upload Stevens Settlement** was selected instead of **Upload P&L**.
- **Possible duplicate/version groups:** Multiple settlement-evidence filenames and multiple production P&L filenames form possible duplicate/version groups. Filename similarity alone is not enough to delete or merge them; document hashes and intended business purpose must be reviewed first.
- **Safe next step:** Keep the original objects and audit history. The explicit correction workflow is now available, but the two records must first be reviewed by an authorized operator using hashes, content detection evidence, parser generations, and downstream links. Do not delete private objects directly from App Storage or claim the records are corrected until managed-production certification is complete.

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

Persisted suggestion and reviewer-selected category fields now connect an eligible uploaded row to an explicit financial inclusion record, which either links one existing `financeTransaction` or creates exactly one new one.

**Status:** Implemented. Imported or linked eligible transactions contribute to observed actuals; planning snapshots remain unchanged.

### 5. Accounting

Accounting now counts reviewed household documents, but its balances, cash flow, income, expenses, and category totals continue to use official accounts and financial transactions.

Uploaded evidence alone does not enter Accounting. An explicitly linked or imported official transaction enters Accounting under the same reviewed-transaction rules as other official activity.

**Status:** Implemented with explicit import/link authority and retained evidence isolation.

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

## Implemented workflow bridge

The implemented bridge is:

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

`RECLASSIFY` continues to mean “correct the reviewed evidence.” Category confirmation remains a separate decision, and financial inclusion remains a further explicit action.

The system retains two deliberately separate transaction models:

1. **Bank-statement evidence rows** — source-faithful, reviewable, and advisory.
2. **Household financial transactions** — categorized, official planning and Accounting inputs.

A controlled inclusion record now links them without erasing their separate authority and provenance.

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

The current release result is generated by:

`CAPITAL_OS_RUN_INTEGRATION=1 CAPITAL_OS_RUN_BROWSER=1 pnpm run certify:document-budget-bridge`

The command requires focused domain tests, API and web typechecks, API-contract parity, generated-finance-artifact freshness, the real database integration fixture, and the authenticated browser journey. Skipped database or browser evidence is reported as **BLOCKED**, never as a pass.

The 2026-09-08 execution passed **DBB-01 through DBB-30 (30/30)**, including the database-backed integration fixture and authenticated upload/category/import/Budget/Accounting browser journey. Evidence is stored in:

- `docs/certification/DOCUMENT_BUDGET_BRIDGE_CERTIFICATION_2026-09-08.md`
- `retained CI certification artifact`

## Final decision

**Evidence ingestion and review:** COMPLETE  
**Advisory Budget evidence summary:** COMPLETE  
**Risk and authority isolation:** COMPLETE  
**Automatic category population:** INTENTIONALLY DISALLOWED  
**Human-approved category utilization:** IMPLEMENTED  
**Production private-storage path:** VERIFIED  
**Document-type integrity implementation:** COMPLETE — content detection, audited correction, parser-generation history, duplicate/version review, and downstream settlement exclusion are implemented
**Production document-type audit:** HIGH-CONFIDENCE P&L MISCLASSIFICATIONS CONFIRMED; SCHEMA PARITY PASS; CORRECTION BLOCKED BY `BUSINESS_ENTITY_LINK_REQUIRED`
**Uploaded-document-to-Budget workflow:** IMPLEMENTED AND CERTIFIED 30/30

The implemented correction does not make uploads automatically authoritative. It adds the controlled, human-approved bridge described in this report so Budget actuals can reflect reviewed statement activity without silently changing the family's plan.