# Executed P0 evidence

**Execution date:** 2026-09-05  
**Decision:** **IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE** for the
household privacy gates after a fresh isolated execution

This record contains only evidence from the disposable loopback PostgreSQL run
created by `pnpm run certify:household-privacy`. The target was separate from
the shared application database, carried the
`capital_os_certification.target_guard` sentinel
`task49-local-certification-20260905`, and was torn down after the run.
Connection details are intentionally excluded.

Full captured output:
`docs/certification/household-privacy-runs/household-privacy-2026-09-05T02-17-21Z.log`

## P0-01 — caller-controlled identifier / IDOR matrix

Command:

```text
pnpm run certify:household-privacy
```

Result: **PASS — 149 route/method pairs, 326 executed probes, 0 failures**.

The isolated fixture executed 55 scoped collection-read comparisons, 44
cross-household identifier denials, 44 malformed-identifier 4xx cases, and
parameterless-write mass-assignment probes containing household, user, actor,
creator, protected, permission, role, and active-state fields. Same-household
requests completed without server errors; foreign identifiers were not accepted
as successful reads or writes; no other-household identifiers were returned;
and no unexpected 500 responses occurred.

## P0-06 — role / effective-permission HTTP certification

Result: **PASS — 0 fixture failures**.

The same isolated execution exercised Owner, Partner, Advisor, and Viewer
actions; all 18 documented role-permission allow decisions and all 22
role-permission deny decisions; effective permission grant and revoke;
inactive and active membership transitions; two explicit household selections
for a multi-household member; role-header and body tampering; three denied
representative actions; and five unsupported administration routes returning
`404`.

## P0-08 — actor attribution certification

Result: **PASS — 0 fixture failures**.

Persisted audit queries retained the authenticated actor for four permitted
representative actions, including Owner, Partner, Advisor, and an explicitly
granted Viewer action. The denied Viewer tampering request left the actor audit
count unchanged, proving it did not create a misleading audit row. Audit rows
were retained in the disposable database for the captured execution rather
than deleted by fixture cleanup.

## Supporting isolated fixture results

The complete fixture finished with **6 tests passed, 0 failed, 0 skipped**:

| Gate | Result |
|---|---|
| P0-05 contribution movement and replay | PASS — exact `$250.00`, three balanced ledger movements, replay conflict `409`, persisted actor |
| P0-01 route preflight | PASS — 149 routes and all applicable path/body probes |
| P0-06 / P0-08 role and audit preflight | PASS — four roles, permission transitions, membership transitions, selection, tampering, audit attribution |
| Financing isolation | PASS |
| Household finance and CSV review isolation | PASS |

The shared application database was not used as the destructive certification
target.