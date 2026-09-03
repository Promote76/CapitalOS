---
name: Micro-Live fail-closed architecture
description: Durable boundary for future real-money strategy experiments in Capital OS.
---

Micro-Live must remain disabled by default and separate rehearsal, eligibility, human arming, and real venue connectivity. A readiness score or graduation result is never permission to transmit an order.

**Why:** A family-capital system must assume strategy, venue, data, database, and risk components can fail independently; no one component should be able to create catastrophic exposure.

**How to apply:** Keep household and protected capital inaccessible, require venue and market allowlists, enforce server-side limits before any adapter call, reconcile against venue-authoritative state, and keep Guardian authority limited to containment. Certification must report rehearsal controls separately from real-venue evidence and exit blocked when critical evidence is absent.

Real venue connectivity also requires a server-side reviewed adapter registry,
an opaque credential reference resolved only by server code, and current
independent security and jurisdiction reviews with distinct reviewers from the
approver. The application registry stays empty until a provider-specific
integration receives that review.

**Why:** A provider-shaped class or a database adapter name must not be enough
to make a venue reachable; review evidence and account isolation need to be
explicit, current, and auditable.

**How to apply:** Register providers in deployment code, not request payloads
or venue rows. Bind adapters to a dedicated Micro-Live account and reject
unallowlisted assets/markets before returning venue state to the OMS.