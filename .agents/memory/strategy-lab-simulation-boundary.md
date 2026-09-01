---
name: Strategy Lab safety boundary
description: Durable rules for keeping systematic-strategy research separate from household capital and live execution.
---

Strategy Lab outputs are simulated, shadow, or paper evidence only. Graduation can return an eligibility decision, but it must never activate live trading, require credentials, route orders, move money, or bypass Capital/Risk Governors.

**Why:** The product is a family-capital planning system, so research must remain useful without creating an accidental execution path or implying that backtest results are real performance.

**How to apply:** Keep datasets, versions, execution assumptions, fills, paper balances, risk limits, failure reasons, and audit activity inside the research domain. Label results clearly and require human review at every stage transition.