---
name: RC1 publish evidence freshness
description: How source-bound readiness evidence gates Capital OS publishing.
---

The RC1 publish gate requires certification evidence and the production-readiness manifest to be generated from the exact current release-input set. A stale evidence hash must be repaired by rerunning the authoritative readiness certification, never by editing hashes or bypassing the check.

**Why:** The artifact build can pass its normal local checks while publishing stops at the repository release gate when new source files or generated API contracts are not reflected in the checked-in evidence.

**How to apply:** Run the project’s RC1 readiness certification first, then regenerate and validate the manifest. For the static web build, use the artifact’s configured `PORT` and `BASE_PATH` values when reproducing the production build locally; those values are supplied through the artifact service environment rather than a nested static-build environment table.

When production publishing regenerates the isolated RC1 evidence automatically, force the certification subprocess to `NODE_ENV=test`. The enclosing artifact build uses `NODE_ENV=production`, which otherwise makes test imports require production ingress configuration before the disposable certification environment is established.

The API artifact’s first service routing path is also used by the deployment sidecar’s generic pre-start healthcheck. Keep the dependency-free liveness path first while retaining the broader `/api` route for normal API traffic.

**Why:** Production logs showed the sidecar probing `/api` during the short window before the API process started, producing repeated 500s even though `/api/health/live` was the intended probe and became healthy immediately afterward.

**How to apply:** Preserve `/api/health/live` as both the first API service path and the explicit production startup path; keep `/api/health/ready` dependency-aware and separate.