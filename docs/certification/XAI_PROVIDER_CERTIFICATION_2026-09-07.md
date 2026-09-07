# xAI/Grok provider activation certification

**Certification date:** 2026-09-07  
**Environment:** Replit development runtime  
**Provider:** xAI  
**Model:** `grok-4.20-0309-non-reasoning`

## Decision

The server-side Grok research adapter is **ACTIVE and CERTIFIED for controlled
development use**. The certification does not authorize production deployment,
capital movement, brokerage activity, Treasury activity, OMS creation, or
Micro-Live transmission.

## Executed evidence

The following checks were executed with the xAI credential held only in Replit
Secrets:

- The authenticated xAI model catalog returned HTTP 200 and exposed the selected
  model to this account.
- A real request through `XaiIntelligenceProvider` returned HTTP 200 and passed
  the complete local `ResearchOutput` validator.
- The validated response used the `RESEARCH_ONLY` label, a permitted analytical
  direction, bounded confidence, facts, assumptions, risks, and evidence.
- No raw provider response, authorization header, or credential was retained in
  certification evidence.
- Eight focused Family Office domain/provider tests passed.
- The API TypeScript check passed after the workspace database declarations were
  refreshed through the existing declaration-generation path.

The live request initially demonstrated why loose JSON mode was insufficient:
the model returned valid JSON with provider-invented field names. The adapter
was changed to xAI strict JSON-schema mode, and the repeated live request passed
the exact Capital OS research contract.

## Boundary certification

The existing guarded Family Office certification was then executed against a
fresh disposable PostgreSQL target:

```text
GROK_INTELLIGENCE_ENABLED=false XAI_ENABLED=false pnpm run certify:family-office
```

Evidence:

```text
docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-58-16Z.log
```

The command deliberately disables the external provider only inside the
certification subprocess so the established provider-failure/browser boundary
remains deterministic. It passed:

- the seven-route P0-09 Family Office isolation and authorization fixture;
- malformed-provider and prompt-injection handling;
- Shadow-only persistence and zero execution records;
- the authenticated Clerk browser fixture;
- secret non-exposure, loading, retry, and fail-closed UI states.

The shared development runtime remained configured with the provider flags
enabled.

## Safety boundary

Grok remains advisory and subordinate to deterministic Capital OS controls.
Provider output cannot move money, submit or cancel orders, create OMS or
brokerage records, change Safe-to-Deploy, unlock reserves, modify roles or risk
limits, override Guardian, approve Treasury, or enable Micro-Live.

## Open claims

- Production deployment and public-origin evidence are recorded below, but the
  authenticated production provider request remains blocked by Clerk test-session
  transport.
- One successful live request does not certify provider uptime, future model
  compatibility, rate limits, billing exhaustion, or disaster recovery.
- Production migration, backup restore, PITR, and external-provider operational
  monitoring remain separate gates.

## Production deployment evidence

The updated build was published as a public autoscale deployment:

```text
https://capital-os-fund.replit.app
```

Observed production evidence:

- The deployments service reported an active deployment with a successful
  current build.
- `GET /api/health/live` returned HTTP 200.
- `GET /api/health/ready` returned HTTP 200 with PostgreSQL ready.
- The five published-origin probes passed: missing and malformed origins were
  denied, cross-site mutation was CSRF-blocked, and same-origin unauthenticated
  requests reached the authentication boundary.
- Deployment logs showed the API process opening port 8080 and serving requests.
  Initial sidecar healthcheck errors occurred only before the artifact port
  opened.

### Authenticated provider gate

The authenticated production Grok request is **BLOCKED**, not failed:

- Password sign-in reached Clerk's email verification-code challenge.
- A server-created one-time sign-in ticket was rejected as invalid or already
  used before Family Office navigation.
- Fresh temporary Clerk sessions were rejected by production `/api/auth/me`
  with HTTP 401 over both bearer-token and session-cookie transports.
- Every temporary session was revoked.
- No production `/api/family-office/research` request reached the application,
  so no production Grok call or financial/application mutation occurred.

Development provider activation and strict-schema validation remain certified.
Production provider certification requires a real authenticated browser session
that reaches `/family-office` and completes one advisory request without
weakening Clerk protections.