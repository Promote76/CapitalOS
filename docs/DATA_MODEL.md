# Capital OS Household Finance Data Model

Household finance records are scoped to a household and use fixed-precision PostgreSQL `numeric(18,2)` values for authoritative money.

- `bank_connections` stores provider-neutral connection state and never stores credentials.
- `household_financial_accounts` stores manually entered or imported account balances, inclusion flags, protected status, and sync freshness.
- `finance_categories` defines income, essential, discretionary, savings, investment, debt, transfer, and one-time expense jobs.
- `finance_transactions` stores signed amounts, source, review state, transfer groups, and duplicate-safe external references.
- `recurring_finance_transactions` captures recurring commitments and annualized cost.
- `finance_bills` and `upcoming_finance_expenses` provide forward-looking obligations.
- `income_sources` provides expected inflow for forecasts.
- `emergency_reserves` stores target months, essential monthly expenses, and current reserve.
- `finance_snapshots` stores historical point-in-time cash-flow, Safe-to-Deploy, budget, and health metrics.

Transactions use signed amounts: inflows are positive and outflows are negative. Transfers, card payments, refunds, and duplicate imports must be reconciled before they influence household spending metrics.
