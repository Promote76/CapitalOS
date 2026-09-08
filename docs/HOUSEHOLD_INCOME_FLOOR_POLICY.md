# Household Income Floor Policy

The default policy is `TRAILING_MEDIAN_DISCOUNTED`:

- use verified events only;
- aggregate the most recent six completed/current monthly buckets;
- require at least three months before producing a floor;
- use the median recent month as base income;
- use 80% of the median as the conservative floor;
- expose the highest recent month as the strong scenario, never as an automatic
  recurring budget increase.

`CONSERVATIVE_MINIMUM` and `USER_APPROVED_FLOOR` are explicit alternatives.
Insufficient history remains visible and does not become a fake zero-income
decision.