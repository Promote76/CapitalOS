---
name: Capital OS xAI provider contract
description: Durable rules for selecting an xAI model and validating live Grok research responses.
---

Select the configured xAI model from the credential's live model catalog, and
require strict JSON-schema output matching the Capital OS research contract.
Never use a placeholder model name or rely on generic JSON-object mode.

**Why:** The credential and endpoint were healthy, but the placeholder model was
rejected. After selecting an available model, generic JSON mode returned valid
JSON with provider-invented field names that correctly failed the local
validator. Strict JSON-schema mode produced the required bounded advisory shape.

**How to apply:** Before activating a new credential or changing models, verify
the model through the authenticated catalog, run one redacted live adapter
check, and keep the local validator as a second fail-closed boundary. Do not
retain raw provider payloads or expose authorization data in evidence.