# Capital OS internal reliability controls

**Scope:** in-house, household-scoped, advisory, non-public, and non-executing only.

This document records the operational controls added for the internal reliability sprint. It is not a public production certification.

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

The alert thresholds are intentionally fail-closed and are verified by the
non-production reliability test suite. The reliability operator owns all
signals:

| Metric | Threshold | Window |
|---|---:|---:|
| `readiness.blocked` | 1 | 1 minute |
| `authorization.denied` | 10 | 5 minutes |
| `database.failure` | 1 | 1 minute |
| `rate_limit.unavailable` | 1 | 1 minute |
| `rate_limit.exceeded` | 5 | 5 minutes |
| `audit.write_failure` | 1 | 1 minute |
| `idempotency.conflict` | 5 | 5 minutes |
| `operations.job_failure` | 3 | 15 minutes |
| `operations.job_dead_lettered` | 1 | 1 minute |
| `micro_live.reconciliation_failure` | 1 | 1 minute |
| `micro_live.guardian_stop` | 1 | 1 minute |

The operations overview derives automation failures from persisted job state rather than a constant. Micro-Live reconciliation failures persist a failed run, stop the session, create an open incident, and append an audit event. Missing or invalid Guardian heartbeats are `STOP`, never synthetic `HEALTHY`.

## Audit controls

Audit events are append-only application evidence: mutation paths insert them,
and no application route updates or deletes them. Migration
`0001_shared_rate_limit_and_audit_archive.sql` installs a database-owned
`AFTER INSERT` shipper into `audit_events_archive`, backfills existing events,
removes household-delete cascading from the source history, and installs
append-only triggers on both tables. The archive denies direct public
`INSERT`, `UPDATE`, `DELETE`, and `TRUNCATE` privileges; the security-definer
shipper is the only writer path. It contains UTC event and archive timestamps,
actor, household, entity, event type, reason, and structured before/after
metadata.

The documented retention period is **2,555 days (seven years)**. The archive
destination is configured as `postgresql://audit_events_archive`, and the
internal reliability operator owns retention monitoring and export access.
This is a restricted immutable database destination, not a claim of a
provider-managed object-lock bucket.

## Rate-limit topology

The API now uses the shared PostgreSQL `rate_limit_buckets` table. Each request
atomically upserts one bucket with a 60-second window and a 120-request limit.
The bucket key includes route class, authenticated actor when available,
household when resolved, and the client network identity. A limiter outage
returns `503 RATE_LIMITER_UNAVAILABLE` for every state-changing method; reads
continue so liveness remains observable.

Production configuration must set:

```text
CAPITAL_OS_RATE_LIMIT_STORE=postgres
CAPITAL_OS_TRUSTED_PROXY=<explicit ingress proxy IP, CIDR, or Express token>
CAPITAL_OS_AUDIT_RETENTION_DAYS=2555
CAPITAL_OS_AUDIT_ARCHIVE_DESTINATION=postgresql://audit_events_archive
CAPITAL_OS_RELIABILITY_OWNER=<named internal operator>
```

The app sets Express `trust proxy` only from `CAPITAL_OS_TRUSTED_PROXY`; when
unset it trusts no forwarded address, and production startup refuses to run.
Forwarded headers are therefore usable for rate-limit network identity only
when they came through the configured ingress topology. The limiter remains
independent from household financial state.
