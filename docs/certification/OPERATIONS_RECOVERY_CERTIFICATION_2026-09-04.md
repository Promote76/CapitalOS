# Operations recovery certification

- Certification date: 2026-09-04
- Target: fresh disposable PostgreSQL cluster initialized from committed migrations (connection details intentionally omitted)
- Command: `pnpm run certify:operations-recovery`
- Result: PASS — 24/24 OR gates, 0 skips

## Repeatable isolated workflow

Run the exact command above from the repository root. The certification wrapper:

1. creates a temporary loopback PostgreSQL cluster with `initdb`;
2. creates a disposable database and applies every SQL file in `lib/db/migrations/`
   in lexical migration order;
3. injects `CAPITAL_OS_CERTIFICATION_DB_URL` and `DATABASE_URL` only into the
   in-process test environment;
4. runs the operations recovery unit and database-backed certification suites;
5. retains redacted per-gate output at
   `docs/certification/operations-recovery-runs/operations-recovery-<UTC>.log`;
6. stops and removes the temporary cluster in a `finally` block.

The wrapper never prints or writes the disposable connection string. Setup,
certification, and teardown failures all produce a non-zero exit status, so a
partial run cannot be recorded as a passing gate.

```text

> workspace@0.0.0 certify:operations-recovery /home/runner/workspace
> node scripts/certify-operations-recovery.mjs

▶ operations safety
  ✔ classifies failures and bounds retry backoff (2.0976ms)
  ✔ allows only advisory worker kinds (0.243009ms)
  ✔ blocks automation actions that would control capital or security (0.517714ms)
  ✔ allows safe prepare-only automation actions (0.166846ms)
  ✔ keeps operations health bounded (0.118238ms)
  ✔ defines provider-neutral reliability signals with fail-closed responses (1.092116ms)
  ✔ requires explicit non-production ownership and records the shared controls (0.493985ms)
✔ operations safety (5.882711ms)
✔ OR-01 durable persistence and OR-02 atomic leasing (65.198784ms)
✔ OR-03 worker heartbeat and OR-04 stale worker detection (119.564345ms)
✔ OR-05 graceful shutdown relinquishes work and replacement completes it (1393.845314ms)
✔ OR-06 hard crash recovery reconstructs the durable lease (1326.161452ms)
✔ OR-07 retry policy and OR-08 persisted bounded backoff (150.093586ms)
✔ OR-09 dead letter preserves safe recovery metadata (50.67885ms)
✔ OR-10 operator reprocessing is authorized and household-scoped (35.798272ms)
✔ OR-11 retry recovery applies one persisted idempotent effect (28.874756ms)
✔ OR-12 scheduler persistence and OR-13 concurrent leadership (54.220913ms)
✔ OR-14 missed schedule recovery follows CATCH_UP and SKIP policy (54.295334ms)
✔ OR-15 household isolation rejects cross-household job access (32.209675ms)
✔ OR-16 execution control integration and OR-18 STOP during job fail closed (38.443685ms)
✔ OR-17 Guardian stale, unavailable, STOP, and disagreement states fail closed (50.877336ms)
✔ OR-19 reconciliation recovery and OR-20 UNKNOWN order recovery preserve evidence (1418.542992ms)
✔ OR-21 audit attribution records job lifecycle and scheduler actions (241.466969ms)
✔ OR-22 100-job multi-worker contention accounts for every job once (436.07663ms)
✔ OR-23 queue metrics and OR-24 scheduler metrics change with runtime events (128.777982ms)
▶ durable operations recovery (isolated PostgreSQL)
  ✔ serializes competing claims and preserves household scope (74.286113ms)
  ✔ supports idempotency, expiry recovery, heartbeat fencing, and dead letter (85.710127ms)
  ✔ handles a 100-job contention set without duplicate claims (361.55109ms)
  ✔ persists schedules, serializes leadership, and enqueues one missed run (32.067321ms)
  ✔ preserves the household boundary for dead-letter reprocessing (25.061164ms)
✔ durable operations recovery (isolated PostgreSQL) (580.285854ms)
ℹ tests 29
ℹ suites 2
ℹ pass 29
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 16467.834559

Operations recovery certification matrix:
PASS OR-01 Durable Persistence
PASS OR-02 Atomic Leasing
PASS OR-03 Worker Heartbeat
PASS OR-04 Stale Worker Detection
PASS OR-05 Graceful Shutdown
PASS OR-06 Hard Crash Recovery
PASS OR-07 Retry Policy
PASS OR-08 Backoff
PASS OR-09 Dead Letter
PASS OR-10 Operator Reprocessing
PASS OR-11 Idempotent Recovery
PASS OR-12 Scheduler Persistence
PASS OR-13 Scheduler Leadership
PASS OR-14 Missed Schedule Recovery
PASS OR-15 Household Isolation
PASS OR-16 Execution Control Integration
PASS OR-17 Guardian Integration
PASS OR-18 STOP During Job
PASS OR-19 Reconciliation Recovery
PASS OR-20 UNKNOWN Order Recovery
PASS OR-21 Audit Attribution
PASS OR-22 Multi-Worker Contention
PASS OR-23 Queue Metrics
PASS OR-24 Scheduler Metrics

Operations recovery certification: PASS (24/24 OR gates)
```
