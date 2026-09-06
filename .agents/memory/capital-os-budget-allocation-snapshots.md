---
name: Budget allocation snapshots
description: Why weekly allocation percentages belong to versioned planning-period snapshots rather than mutable household-global state.
---

Weekly allocation templates must live with the monthly planning-period category snapshots. Only drafts may change; approval requires a complete exact-100% template, and approved or closed periods retain the percentages that were reviewed.

**Why:** A mutable household-global template would silently change historical guidance and make it impossible to prove which percentages supported an approved plan. Name-based migration backfills are unsafe for finalized history because category names do not prove semantic identity.

**How to apply:** Carry allocations forward when creating a new draft, attribute edits to the actor, increment the period version atomically, audit before and after values, and leave ambiguous legacy finalized allocations unset rather than rewriting history.