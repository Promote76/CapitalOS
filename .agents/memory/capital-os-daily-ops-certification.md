---
name: Daily Ops certification boundary
description: Durable browser and service certification constraints for the authenticated operating cockpit.
---

Daily Ops certification should use disposable Clerk identities and household-marked records, and should exercise source failures through request aborts rather than treating fallback zeros as valid data.

**Why:** The browser gate must prove both authenticated tenant isolation and fail-closed rendering; shared seeded households and synthetic successful responses can hide ownership or stale-data regressions.

**How to apply:** Keep browser coverage on the real routed preview, scope fixtures by household and run marker, assert unavailable labels and source links, and keep provider failures advisory-only.

Hourly Grok refreshes should begin on the bounded timer after the initial cockpit read, not immediately on page mount.

**Why:** An immediate provider call can replace a deliberately blocked fixture before the cockpit renders its fail-closed state and creates unexpected external work during an authenticated page load.

**How to apply:** Keep on-demand refresh explicit; let the open-page hourly timer call the guarded refresh endpoint only while provider and authoritative context are current.