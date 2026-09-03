---
name: Capital OS audit archive
description: Durable internal audit-history boundary and its migration implications.
---

For the internal Capital OS boundary, audit history is shipped synchronously by a database-owned trigger from `audit_events` into a restricted `audit_events_archive` table. Both tables reject update, delete, and truncate, and household deletion must not cascade into audit history.

**Why:** An in-transaction archive copy makes an audit write failure fail the surrounding database operation and avoids claiming an unconfigured external object-lock service.

**How to apply:** Keep archive columns aligned with source audit events and update the trigger/migration together. A public-scale release still needs separately verified offsite immutable export and retention controls.