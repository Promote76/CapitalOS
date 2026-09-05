---
name: Capital OS managed recovery controls
description: Boundary between Replit's provider recovery UI and the agent-accessible database operations.
---

Provider-managed production recovery evidence requires a release owner to select a PITR reference or scheduled backup in Replit's Database tool and restore it to an isolated non-production target. Agent database operations can confirm connectivity and run read-only production SQL, but cannot enumerate provider backup points, provision the isolated restore, or confirm restore timing and integrity.

**Why:** A reachable production database and disposable Neon branch can prove connectivity or application behavior, but neither establishes provider backup identity, retention, recovery point, RPO/RTO, or managed restore controls.

**How to apply:** Provider recovery is excluded from the current in-house certification scope and must not be reintroduced as a release gate or warning without an explicit scope change to public use.

The restore verifier must complete target-isolation, provider-evidence, and metadata preflight before opening any database connection; an absent or ambiguous target is a blocked certification, never a fallback to the ambient application database.

**Why:** A restore check that connects before proving target identity can validate the wrong database and create false recovery evidence, even when its later comparisons are read-only.

**How to apply:** Require the dedicated restore target reference and explicit provider manifest first, refuse local/shared targets, and start the certification application with operations workers and schedulers disabled.