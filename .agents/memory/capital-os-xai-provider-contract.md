---
name: Capital OS xAI provider contract
description: Durable rules for selecting an xAI model and validating live Grok research responses.
---

Select the configured xAI model from the credential's live model catalog, and
require strict JSON-schema output matching the Capital OS research contract.
Never use a placeholder model name or rely on generic JSON-object mode.

Treat environment flags and credentials as only `configured`; mark a provider
`verified` only from a persisted completed run. Preserve that historical result
if configuration is later disabled. Provider failures return HTTP 503 with an
allowlisted safe classification and retain the corresponding blocked run.
Keep the external request outside the database transaction, then finalize the
run, proposal, evidence, scorecard, and audit record atomically.

Investment dossiers must keep permitted Simply Wall St evidence, normalized
Schwab observations, deterministic Capital OS calculations, and Grok inference
as distinct provenance classes. Multi-agent synthesis remains advisory-only,
pending human approval, and cannot turn protected capital into deployable cash.

**Why:** The credential and endpoint were healthy, but the placeholder model was
rejected. After selecting an available model, generic JSON mode returned valid
JSON with provider-invented field names that correctly failed the local
validator. Strict JSON-schema mode produced the required bounded advisory shape.
Persisted evidence prevents configuration from being mistaken for runtime
health, while atomic finalization prevents partially visible advisory records.

**How to apply:** Before activating a new credential or changing models, verify
the model through the authenticated catalog, run one redacted live adapter
check, and keep the local validator as a second fail-closed boundary. Do not
retain raw provider payloads or expose authorization data in evidence.
Derive current provider state from configuration plus the latest persisted run,
and expose only safe failure classes. Never hold a database transaction open
while waiting on the provider. Never fetch Simply Wall St links; accept only
bounded user-provided evidence with explicit permission confirmation.