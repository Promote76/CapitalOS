# Household Finance Risk Model

Financial health is an explainable planning score, not a lender score or guarantee of outcomes. The score combines cash-flow direction, savings consistency, emergency-reserve coverage, debt burden, budget stability, duplex progress, liquidity, capital risk controls, and income stability.

Confidence is separate from health. Confidence reflects data freshness and completeness, recurring-income evidence, and the reliability of account and transaction inputs. A healthy-looking household with stale data should still receive a conservative Safe-to-Deploy result.

The UI uses restrained states:

- **Protected** for ring-fenced capital and funded reserve boundaries;
- **Active** for approved operating capital;
- **Advisory Only** for insights and recommendations;
- **Review** for anomalies, stale data, or budget pressure; and
- **Safe to Deploy** only for surplus that survives the Governor’s checks.
