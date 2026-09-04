---
name: Capital OS observability evidence boundary
description: Durable rules for telemetry privacy and alert-delivery certification.
---

Certify alert retry and dead-letter behavior from raw persisted delivery records,
not from the UI-safe projection that intentionally normalizes operational failure
states for display. A PASS also requires a real receipt through the approved
connector transport; a mocked provider response cannot close the delivery gate.

**Why:** The UI and evidence layers have different responsibilities. Display
projections should remain safe and stable, while certification must prove the
exact durable lifecycle and external delivery acknowledgment.

**How to apply:** Keep metric labels low-cardinality and free of household,
account, job, order, financial, credential, and message data. Exercise delivery,
retry, dead-letter, replay, and recovery against disposable PostgreSQL, and
retain only redacted evidence plus the provider receipt.