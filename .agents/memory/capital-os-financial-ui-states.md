---
name: Capital OS financial UI loading states
description: Fail-closed presentation rules for loading and unavailable household financial data.
---

Financial cards must distinguish confirmed zero values from loading, unavailable, and prerequisite-error states. Hide dependent totals until their source query succeeds, provide a focused retry for each failed source, and keep mutations disabled until ownership prerequisites are confirmed.

**Why:** A transient zero shown as a real balance can lead a household member to trust an unconfirmed financial position, while a shared error state can conceal which source actually failed.

**How to apply:** Use this boundary on Budget, Cash Flow, Accounting, Safe-to-Deploy, Treasury, and other household financial surfaces. After a mutation, refresh every linked read and review surface that should reflect the result.