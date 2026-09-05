---
name: Capital OS managed recovery controls
description: Boundary between Replit's provider recovery UI and the agent-accessible database operations.
---

Provider-managed production recovery evidence requires a release owner to select a PITR reference or scheduled backup in Replit's Database tool and restore it to an isolated non-production target. Agent database operations can confirm connectivity and run read-only production SQL, but cannot enumerate provider backup points, provision the isolated restore, or confirm restore timing and integrity.

**Why:** A reachable production database and disposable Neon branch can prove connectivity or application behavior, but neither establishes provider backup identity, retention, recovery point, RPO/RTO, or managed restore controls.

**How to apply:** Provider recovery is excluded from the current in-house certification scope and must not be reintroduced as a release gate or warning without an explicit scope change to public use.
