---
name: Saved brief provenance
description: Durable boundary for identifying which household workspaces contributed to an advisory brief.
---

Saved advisory briefs may identify contributing household workspaces only through a small server-owned allowlist of redacted markers. They must not retain raw financial payloads, credentials, prompt text, or provider response text as provenance.

**Why:** Operators need to distinguish briefs created under different household conditions, while the brief history must remain safe to inspect and bounded in size.

**How to apply:** Add new contributors as explicit allowlisted markers, derive them from verified context freshness on the server, and expose the same bounded markers beside provider and context timestamps in every brief history surface.