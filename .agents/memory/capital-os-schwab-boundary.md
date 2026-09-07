---
name: Schwab read-only boundary
description: Capital OS has a disabled observation-only Schwab contract; live provider work waits for an approved managed connector and real evidence.
---

The Schwab portfolio boundary must remain observation-only and disabled by
default until an approved managed connector is attached. Do not introduce a
custom OAuth flow, accept pasted credentials, claim fixture data as provider
evidence, or expose any order/money-movement capability through Capital OS.

**Why:** The user deferred the connector until approval, and the sprint
explicitly requires real provider-backed evidence before a Schwab PASS.

**How to apply:** Resume with the managed connector, keep trading disabled,
then add server-side persistence, tenant isolation evidence, audit evidence,
freshness/reconciliation checks, and sanitized Grok/Shadow validation before
changing the certification status.