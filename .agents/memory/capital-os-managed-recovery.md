---
name: Capital OS managed recovery controls
description: Boundary between Replit's provider recovery UI and the agent-accessible database operations.
---

Provider-managed production recovery evidence requires a release owner to select a PITR reference or scheduled backup in Replit's Database tool and restore it to an isolated non-production target. Agent database operations can confirm connectivity and run read-only production SQL, but cannot enumerate provider backup points, provision the isolated restore, or confirm restore timing and integrity.

**Why:** A reachable production database and disposable Neon branch can prove connectivity or application behavior, but neither establishes provider backup identity, retention, recovery point, RPO/RTO, or managed restore controls.

**How to apply:** Keep P0-04 and the release decision open until the Database tool supplies observed provider backup/restore evidence. Record the selected source, isolated target, control settings, timestamps, recovery time, and invariant results before changing any gate.