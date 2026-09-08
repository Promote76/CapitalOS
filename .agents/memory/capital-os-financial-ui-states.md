---
name: Capital OS financial UI loading states
description: Fail-closed presentation rules for loading and unavailable household financial data.
---

Financial cards must distinguish confirmed zero values from loading, unavailable, and prerequisite-error states. Hide dependent totals until their source query succeeds, provide a focused retry for each failed source, and keep mutations disabled until ownership prerequisites are confirmed. API contracts for fail-closed monetary components must allow an explicit non-calculated value (including nullable component amounts where needed); clients must render that state as `NOT CALCULATED`, never coerce it to `$0`.

**Why:** A transient or coerced zero shown as a real balance can lead a household member to trust an unconfirmed financial position. A strict response validator can also reject an otherwise correct fail-closed result if its monetary component schema only permits numeric strings.

**How to apply:** Use this boundary on Budget, Cash Flow, Accounting, Safe-to-Deploy, Treasury, and other household financial surfaces. After a mutation, refresh every linked read and review surface that should reflect the result.