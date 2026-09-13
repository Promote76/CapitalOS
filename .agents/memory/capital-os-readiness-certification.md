---
name: Capital OS readiness certification
description: Isolated release certification must distinguish a healthy live process from a fully ready, independently verified deployment.
---

Fresh isolated databases intentionally fail readiness until audit verification/backfill and required operational destinations are certified. Certification probes should assert the structured fail-closed blocker rather than weakening readiness to force a 200 response.

**Why:** A 503 readiness response is the safety signal for an uncertified deployment; treating it as a test failure would hide missing recovery controls.

**How to apply:** Keep liveness and readiness assertions separate in route inventories and RC1 evidence. Accept 503 only for explicitly documented blockers and verify the response code/status.