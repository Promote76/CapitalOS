# Safe-to-Deploy 2.0 Architecture

Safe-to-Deploy 2.0 is an additive Capital Governor layer. The legacy Safe-to-Deploy result remains the existing Capital OS authority; v2 records the exact inputs, policy version, source provenance, and advisory waterfall used to explain that result.

## Authority

Capital OS is advisory and non-executing. A v2 waterfall run can recommend economic designations, but it cannot move money, submit orders, activate Micro-Live, change a budget, or unlock protected capital.

## Calculation

The deterministic calculation:

1. Starts with household liquid cash and provider available cash, using the lower trusted value.
2. Excludes business cash, unclassified cash, pending cash, and unreconciled cash.
3. Subtracts next-30-day obligations, the household operating buffer, reserve gaps, protected commitments, active encumbrances, and forecast shortfall exactly once.
4. Fails closed for incomplete, stale, unreconciled, duplicate, or locked inputs.
5. Produces explainable components with source provenance and a versioned input snapshot.

Household capital surplus is calculated from verified income scenarios and operating costs separately. It is not Safe-to-Deploy and is never treated as a cash balance.

## Persistence and concurrency

Input snapshots are immutable evidence. Waterfall runs are idempotent by household and `Idempotency-Key`, protected by a household advisory lock, and audit every recommendation. Designation records are economic planning records, not physical transfers.