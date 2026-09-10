---
name: Agent evidence projection boundary
description: How reviewed provider evidence may be supplied to external research agents without leaking transport metadata.
---

External research-agent inputs must use an explicit allowlist projection of reviewed normalized observations and citation fields. Never serialize or spread the full canonical evidence or provenance object into an agent prompt.

**Why:** Canonical evidence intentionally preserves exact provider provenance, including safe request and rate-limit metadata derived from response headers. That metadata is appropriate for audit and human review but is prohibited from external-agent prompts and can leak accidentally when a whole evidence object is serialized.

**How to apply:** For any provider-backed reviewed evidence, select only normalized observations, high-level freshness and quality fields, the reviewed content digest, and non-execution safety markers. Exclude capabilities envelopes, request IDs, rate limits, endpoints, payload hashes, raw headers, tokens, credentials, account identifiers, and transport provenance. Test the projection by injecting forbidden marker values and asserting they are absent from the final prompt input.