# Capital OS Household Finance Architecture

Capital OS has two layers:

1. **Household finance** describes cash, accounts, income, expenses, bills, recurring commitments, and reserve health.
2. **Capital OS** turns approved surplus into protected goals, allocations, and internal capital movements.

The household-finance layer is read-only with respect to external institutions. Manual entry and CSV import are active provider-neutral paths. The Plaid adapter is a disabled interface until a provider connection is explicitly approved.

The Capital Governor is the boundary between the layers. It calculates Safe-to-Deploy only after bills, essential expenses, emergency reserves, protected goal commitments, known upcoming expenses, and a safety buffer are accounted for.

No household-finance feature can initiate ACH, transfer money, pay bills, trade, or store bank credentials.
