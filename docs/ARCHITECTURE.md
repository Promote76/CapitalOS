# Capital OS Household Finance Architecture

Capital OS has two layers:

1. **Household finance** describes cash, accounts, income, expenses, bills, recurring commitments, and reserve health.
2. **Capital OS** turns approved surplus into protected goals, allocations, and internal capital movements.

The household-finance layer is read-only with respect to external institutions. Manual entry and CSV import remain the default paths. The provider-neutral bank sync boundary supports explicit consent, server-side opaque credential references, polling cursors, reconciliation holds, review queues, export, and revocation/deletion, but no production provider is enabled until its separate release gate is approved.

The Capital Governor is the boundary between the layers. It calculates Safe-to-Deploy only after bills, essential expenses, emergency reserves, protected goal commitments, known upcoming expenses, and a safety buffer are accounted for.

No household-finance feature can initiate ACH, transfer money, pay bills, trade, or expose bank credentials. Provider-derived data is never written to the internal capital ledger.
