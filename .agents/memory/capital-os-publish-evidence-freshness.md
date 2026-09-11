---
name: RC1 publish evidence freshness
description: How source-bound readiness evidence gates Capital OS publishing.
---

The RC1 publish gate requires certification evidence and the production-readiness manifest to be generated from the exact current release-input set. A stale evidence hash must be repaired by rerunning the authoritative readiness certification, never by editing hashes or bypassing the check.

**Why:** The artifact build can pass its normal local checks while publishing stops at the repository release gate when new source files or generated API contracts are not reflected in the checked-in evidence.

**How to apply:** Run the project’s RC1 readiness certification first, then regenerate and validate the manifest. For the static web build, use the artifact’s configured `PORT` and `BASE_PATH` values when reproducing the production build locally; those values are supplied through the artifact service environment rather than a nested static-build environment table.