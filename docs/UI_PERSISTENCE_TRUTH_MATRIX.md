# Capital OS UI persistence-truth matrix

**Date:** 2026-09-02  
**Rule:** A visible success message is only authoritative when a server response and fresh read prove the durable state.

| Surface/action | Classification | Evidence / required wording |
|---|---|---|
| Record contribution / Add contribution | PERSISTED | Calls the contribution API; allocation metadata, ledger movement, goal progress, and audit are server-owned. Reload verification remains open in browser E2E. |
| Transfer quick action | PERSISTED when API flow is used | Must call the validated transfer API; no local completion may be shown after a failed request. HTTP concurrency is proven; browser persistence is open. |
| Dashboard allocation edit | PREPARED or LOCAL-ONLY unless API-backed | Do not present a durable allocation update without a fresh API read. |
| Emergency stop | PERSISTED only through the risk API | If the visible control is not wired to the persisted risk state, label it preview/local-only. Reload certification is open. |
| Strategy note | LOCAL-ONLY / PREPARED | It does not claim that a strategy record was saved unless the API creates one. |
| Property note | LOCAL-ONLY / PREPARED | It does not create an owned property or acquisition state. |
| Treasury request | PERSISTED / PREPARED | Request and review records persist; approval does not move money. |
| Business revenue and expense | PERSISTED | Server response and fresh business read are authoritative. |
| Business distribution | PREPARED | A proposed distribution does not increase household cash; the reviewed distribution bridge is not implemented. |
| Accounting review | LOCAL-ONLY / PREPARED | No durable review artifact is claimed unless the API writes one. |
| Dashboard/portfolio export | LOCAL-ONLY | Do not claim a server report or durable export artifact was created. |
| Reports, documents, insights empty-state actions | READ-ONLY / LOCAL-ONLY | Route/navigation feedback is not a persisted artifact. |
| Treasury stress test | SIMULATED | Scenario output is advisory and does not change balances. |
| Micro-Live rehearsal | PERSISTED / DISABLED | Rehearsal records may persist; real order transmission remains false. |

## Certification status

The current UI preserves the approved visual design and no longer claims that the known local-only quick actions saved authoritative financial state. The remaining P0 persistence gate is browser proof that critical persisted writes survive reload and a fresh API read.
