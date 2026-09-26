# Capital OS Financial Truth Contract

## Purpose

Capital OS must distinguish authoritative household financial facts from planning,
allocation policy, external observations, and advisory projections. Two routes may
display related values only when their source and scope are explicit.

## Canonical authorities

| Financial fact | Canonical authority | Notes |
| --- | --- | --- |
| Household actual income and spending | `financeTransactions` | Only reviewed, approved, non-pending household activity may affect official household totals. |
| Household planning targets | `budgetPlanningPeriods` + `budgetPlanningCategorySnapshots` | Only canonical finalized (`approved` or `closed`) plan snapshots are official. Drafts and mutable taxonomy targets are advisory only. |
| Household financial accounts | `financialAccounts` | Authority for household bank/account balances used by household finance safety logic. |
| Treasury allocation policy | `treasuryBuckets`, reservations, policies | Treasury is an allocation/reservation scope, not a second bank-account authority. |
| Internal capital allocation | core `accounts` + capital ledger | Strategic capital-allocation scope; it must not be presented as household Accounting without an explicit reconciliation bridge. |
| Schwab brokerage observations | `schwabObservationSnapshots` | Read-only external observation scope. Observations never silently become household ledger balances or transactions. |
| Business finance | business-domain records | Separate economic scope until an explicit authoritative bridge/distribution is recorded. |
| Property finance | property-domain records | Separate asset/equity scope until intentionally consolidated. |

## Propagation rules

1. Financial Inbox uploads are evidence, not money. Verification alone does not change
   household totals. An explicit approved import/link may create or associate an
   authoritative `financeTransactions` record.

2. Budget actuals, Cash Flow actuals, and Accounting household activity must use the
   same approved `financeTransactions` population and exclusion rules.

3. Finalized Budget snapshots are the sole authority for official planning targets.
   `financeCategories.monthlyTarget` is taxonomy/bootstrap data and must not drive
   downstream official forecasts after finalized planning exists.

4. Cash Flow forecast planning must use the canonical finalized plan for the forecast
   month. If no finalized plan exists for that month, it may carry forward the latest
   prior finalized plan. It must never fall back to mutable taxonomy targets.

5. Safe-to-Deploy, Capital Governor, Treasury, Property readiness, and Intelligence may
   consume derived household safety outputs, but may not silently substitute their own
   duplicate account or planning authorities.

6. Treasury balances, internal Portfolio balances, Schwab observations, business
   equity, and property equity are separate scopes unless a reconciliation layer
   explicitly proves how they consolidate.

7. Accounting cross-view reconciliation may observe Treasury allocation totals and
   internal Portfolio allocation totals, but must label them as separate scopes and
   must not add them to household net worth. Missing scope data is `not_available`,
   not zero. Protected scope observations are `restricted` for roles that cannot
   view the underlying protected capital.

## Reconciliation requirements

A cross-route reconciliation response must identify both value and scope. Missing
scopes must remain unknown/separate rather than defaulting to zero in a way that implies
agreement.

Required scope labels:

- household ledger
- household account
- finalized budget plan
- Treasury allocation
- internal capital allocation
- Schwab observed brokerage
- business
- property

## Certification gate

A production candidate should prove the following chain with one household fixture:

Financial Inbox -> financeTransactions -> Budget -> Cash Flow -> Accounting ->
Safe-to-Deploy -> Capital Governor -> Treasury -> Intelligence

The certification must also prove:

- unverified or merely verified evidence cannot change official household totals;
- draft Budget plans cannot change official planning totals;
- mutable `financeCategories.monthlyTarget` cannot override finalized Budget snapshots;
- Schwab observations cannot silently enter household Accounting;
- business/property/Treasury scopes cannot be double-counted as household cash.

This contract is an architectural invariant. Route-specific implementations may add
detail, but they must not redefine these authorities.
