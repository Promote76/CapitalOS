---
name: Artifact production runtime
description: Where production runtime flags and readiness health checks belong for artifact-mode API deployments.
---

For an artifact-mode API, production environment flags, the production command,
and deployment health paths must be configured in the API artifact manifest.
Do not treat root workspace configuration as production wiring for the artifact.

**Why:** Artifact deployment services consume their artifact configuration.
Root workspace flags can appear correct in development while never reaching the
deployed API runtime.

**How to apply:** Put required worker and scheduler flags under the artifact's
production run environment, keep the startup check on the fail-closed readiness
endpoint, and validate the artifact manifest as part of the production build
gate.