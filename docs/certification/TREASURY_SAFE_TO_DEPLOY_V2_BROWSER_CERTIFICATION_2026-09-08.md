# Treasury Safe-to-Deploy 2.0 authenticated browser certification

**Date:** 2026-09-08  
**Test command:** `pnpm --filter @workspace/api-server run test:capital-governor-browser`  
**Authentication:** Disposable Clerk user created through the Clerk sign-in-token flow; no credentials, session tokens, or secrets are recorded.  
**Tenant boundary:** The browser first reaches the real tenant-scoped Treasury and Capital Governor endpoints after onboarding. The disposable household is removed during teardown.

## Browser evidence

The certification output was:

```json
{"gate":"BROWSER-CAPITAL-GOVERNOR-V2","authenticated":true,"tenantScopedTreasury":"PASS","incompleteState":"PASS","readyState":"PASS","conservativeState":"PASS","capitalSurplusSeparated":"PASS","advisoryOnly":"PASS","noMoneyMovement":"PASS","retryErrorState":"PASS","retryRecovery":"PASS"}
```

The authenticated browser fixture asserted:

- **Incomplete:** the newly onboarded household’s real v2 response is shown as `INCOMPLETE_DATA`, with Safe-to-Deploy visible as `$0` and household capital surplus shown separately.
- **Ready:** the v2 panel shows `READY`, `$1,234` Safe-to-Deploy, and `$2,000` household capital surplus.
- **Conservative:** the v2 panel shows `CONSERVATIVE`, `$500` Safe-to-Deploy, the stale-evidence explanation, and the unchanged separate surplus value.
- **Advisory boundary:** the Treasury page shows `Advisory only`; the v2 waterfall states `no movement authorized`.
- **Retry/error:** an aborted v2 request shows `V2 evidence is unavailable`, preserves the legacy Safe-to-Deploy authority, and exposes `Retry`; restoring the response and retrying returns to `READY`.

Ready, conservative, incomplete, and retry/error permutations use controlled responses only for the v2 read so the authenticated UI can be exercised deterministically. No mutation, waterfall run, allocation, reservation, or money movement is performed by this certification.

## Supporting checks

- `pnpm --filter @workspace/api-server run typecheck` — PASS
- `pnpm --filter @workspace/capital-os run typecheck` — PASS
- `pnpm --filter @workspace/api-server run test:capital-governor-browser` — PASS, 1 test
- `pnpm run certify:capital-governor-v2` — run after the browser gate; must remain the source/domain/API certification gate
- `pnpm run check:generated-finance-artifacts` — run after the browser gate; generated artifacts remain part of the release gate

**Certification result:** PASS for authenticated Treasury Safe-to-Deploy 2.0 user-visible state evidence. This does not certify real money movement, live provider connectivity, Micro-Live, or production Clerk role/reverification matrices.