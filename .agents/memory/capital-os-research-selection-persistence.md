---
name: Research selection persistence
description: Durable UI rule for committee comparison selection during query transitions and remounts.
---

Committee candidate selections are user intent and must survive a query refetch, loading transition, or component remount until the user removes them or the candidates disappear from a confirmed response. Reconciliation must not enqueue a no-op state update that can later overwrite newer selections with an older empty snapshot.

**Why:** A research comparison can silently change from two candidates to one or none when authentication/query state settles or a background refetch completes, undermining the manual-review decision surface.

**How to apply:** Persist the selection in the existing session-scoped UI storage, reconcile only against a confirmed opportunity response, and return the existing state reference when reconciliation finds no changes.