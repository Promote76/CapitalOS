---
name: Capital OS financial safety boundaries
description: Durable rules for precision, idempotency, and ledger safety in the household-capital backend.
---

Financial values should enter the domain as validated decimal strings, become integer cents for calculations, and remain PostgreSQL numeric values at persistence boundaries. A capital mutation should claim its idempotency key and commit the balance updates, ledger entries, contribution or transfer record, and audit event in one database transaction.

Derived Treasury views must exclude internal ledger clearing balances from spendable household capital; a negative clearing balance is an accounting artifact, not a negative reserve.

**Why:** Household reserve data is safety-sensitive, and JavaScript floating-point arithmetic or a partially committed movement can make the displayed plan disagree with the ledger.

**How to apply:** Preserve this boundary for new contribution, transfer, allocation, withdrawal, and strategy-capital flows. Add a domain test before adding a UI control.

Approval flows that create verified financial records must validate the post-approval state inside the same transaction as the state transition.

**Why:** An eligible owner draw can be rejected or create an unsafe record if a guard receives the pre-approval status instead of the state being committed.

**How to apply:** When an approval endpoint bridges business evidence into household income, validate amount, blocked reasons, and the intended approved state before inserting the verified record.