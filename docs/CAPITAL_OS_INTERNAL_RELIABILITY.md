# Capital OS internal reliability controls

**Scope:** in-house, household-scoped, advisory, non-public, and non-executing only.

This document records the operational controls added for the internal reliability sprint. It is not a public production certification and it does not certify managed backup/restore.

## Safe durable operations

Safe automations are persisted as `operations_jobs` before work starts. A job has:

- `QUEUED` — durable and eligible for a worker;
- `RUNNING` — claimed by a worker identity;
- `COMPLETED` — the prepare-only result was recorded;
- `FAILED` — the attempt failed and is eligible for delayed retry;
- `DEAD_LETTERED` — the attempt budget was exhausted and a human must review it.

The queue is household-scoped and keyed by a unique `(household_id, job_key)`. Claiming is transactional and uses row locking so two workers cannot claim the same job. A future worker startup must call the stale-job recovery helper before claiming work; stale `RUNNING` jobs return to `QUEUED`. Safe automation can create tasks, alerts, reviews, or reports only. It cannot move money, unlock reserves, change ownership, enable Micro-Live, submit an offer, sign a contract, or transmit an order.

## Metrics and alert contract

The provider-neutral metric names and alert severity mapping live in `artifacts/api-server/src/domain/reliability.ts`. The required signals are:

| Signal | Severity | Response |
|---|---|---|
| Readiness blocked | HIGH | Keep the protected operation blocked and investigate the named dependency |
| Authorization denial spike | HIGH | Review actor, household, route, and origin context |
| Database failure | CRITICAL | No synthetic success; writes remain fail-closed |
| Audit write failure | CRITICAL | Fail the mutation and page the operator |
| Idempotency conflict | HIGH | Reject the replay and retain the original result |
| Safe job dead-lettered | CRITICAL | Require human review before replay |
| Micro-Live reconciliation failure | CRITICAL | Persist failure, stop the session, require post-incident review |
| Guardian stop | CRITICAL | Do not re-arm until an independent healthy heartbeat exists |

The operations overview derives automation failures from persisted job state rather than a constant. Micro-Live reconciliation failures persist a failed run, stop the session, create an open incident, and append an audit event. Missing or invalid Guardian heartbeats are `STOP`, never synthetic `HEALTHY`.

## Audit controls

Audit events remain append-only application evidence: mutation paths insert them, and no application route updates or deletes them. The required provider-neutral sink contract is an immutable append destination with restricted writer access, UTC timestamps, actor, household, entity, event type, reason, and structured metadata. Retention and shipping are deployment controls and remain configuration work for the internal operator; this sprint does not claim an external archive or immutable provider bucket is configured.

## Rate-limit topology

The current in-process limiter is suitable for local and single-process internal evaluation only. It is not a horizontal production guarantee. Before any public or horizontally scaled deployment, use a shared atomic store (for example, a managed Redis-compatible service) behind a trusted proxy. Keys must include route class, authenticated actor, household, and client network identity as appropriate; forwarded headers must be accepted only from the trusted proxy. Fail closed for protected mutations when the shared limiter is unavailable, and keep the limiter independent from household financial state.

## Future restore verifier scaffold

`scripts/verify-future-restore.mjs` is intentionally a refusal-first scaffold. It checks that a future operator supplies a disposable target, approved restore evidence, and an explicit verification manifest; it never restores data and it never claims that a managed PITR or scheduled backup exists. Managed backup/restore selection and restore certification remain outside the in-house P0 release gate.