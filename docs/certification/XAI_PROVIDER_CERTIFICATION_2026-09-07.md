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

- This is development activation evidence, not a production deployment
  certification.
- One successful live request does not certify provider uptime, future model
  compatibility, rate limits, billing exhaustion, or disaster recovery.
- Production migration, backup restore, PITR, and external-provider operational
  monitoring remain separate gates.