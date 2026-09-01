# Capital Protection

Household cash is not automatically deployable capital.

Safe-to-Deploy is always clamped at zero and is reduced by:

- bills due before the next expected income;
- required monthly expenses;
- emergency-reserve shortfall;
- protected goal commitments;
- known required upcoming expenses; and
- the configured safety buffer.

The result is additionally capped by the Capital Governor’s maximum deployable percentage and confidence level. Stale, incomplete, or uncertain account data lowers confidence and applies a conservative limit.

Protected Capital remains ring-fenced. A household finance import can add context, but it cannot bypass the existing protected-capital transfer rules or authorize experimental strategy allocation.
