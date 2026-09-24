# Variable-Income Household Budget Architecture

Capital OS keeps household planning advisory and non-executing. The variable-income
engine is a read model over existing household finance records plus
`VerifiedHouseholdIncomeEvent`, which is the only authoritative realized-income
source for this feature.

## Flow

1. Approved owner draws create verified household-income events in the Business
   Income module.
2. The engine calculates trailing windows and monthly floor/base/strong scenarios
   using exact cents.
3. Approved planning-period snapshots, essential bills, upcoming required
   expenses, emergency-reserve targets, household cash, and capital goals are
   combined into explainable constraints.
4. Safe-to-Deploy is displayed as an existing Capital Governor result. This
   engine does not replace it.
5. Vehicle scenarios and forward cash-flow forecasts are planning-only records.

Business accounts, projected income, transfers, protected accounts, and
unreviewed transaction rows do not silently become household spending capacity.

## Fail-closed states

The engine reports `INCOMPLETE_DATA`, `INSUFFICIENT_HISTORY`, `TIGHT`, or
`SHORTFALL_RISK` instead of inventing a zero or promoting a strong month into a
recurring obligation.

## Planning target invariant

Monthly planning targets are nonnegative allocations. Negative targets are rejected by the API contract and service write boundary, and approval revalidates persisted snapshots so malformed legacy or direct database data cannot be promoted into an approved plan. Transaction signs remain separate from plan allocations: outflows may be represented as negative transaction activity, but the budget target assigned to an expense, reserve, debt, savings, investment, or income category is always zero or positive.
