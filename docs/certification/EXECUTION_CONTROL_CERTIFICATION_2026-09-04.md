# Execution-control certification evidence

**Certification date:** 2026-09-04  
**Scope:** Dedicated disposable PostgreSQL target and API process restart  
**Target sentinel:** `capital-os-execution-cert-1788556604`

This evidence was collected against a fresh isolated PostgreSQL database. The
connection string is intentionally not retained in the repository. The database
was initialized from all committed migrations and guarded by the target
sentinel before certification.

## Certification command

The following command completed without skipped database gates:

```text
CAPITAL_OS_CERTIFICATION_DB_URL=<disposable isolated PostgreSQL URL> \
CAPITAL_OS_RUN_INTEGRATION=1 \
pnpm run certify:execution-control
```

Result:

- 3 focused tests passed
- 0 failed
- 0 skipped
- API contract parity passed with 134 route/method combinations
- EC-01 through EC-17 reported `EVIDENCE COLLECTED`

The focused fixture retains its rows in the disposable target because audit
history is append-only. Retained evidence included:

| Evidence | Retained count |
|---|---:|
| Active certification target sentinels | 1 |
| Households created by the fixture and restart probe | 9 |
| Execution controls in `STOP` | 1 |
| Execution controls in `DISABLED` | 6 |
| Applied STOP audit events | 5 |
| Idempotent replay audit events | 4 |
| Denied invalid-transition audit events | 2 |
| STOP idempotency keys | 14 |

The invalid-transition audit is committed before the expected error is returned;
it is not rolled back with the denied command.

## API restart probe

An API process was built and started against the same isolated target. The
probe then:

1. Sent `POST /api/execution-control/stop` with an allowed local origin.
2. Confirmed HTTP 200, `state=STOP`, `version=2`, and
   `executionPermitted=false`.
3. Stopped the API process.
4. Started a fresh API process against the same target.
5. Read `GET /api/execution-control` and confirmed HTTP 200 with the same
   household-scoped control ID, `state=STOP`, `version=2`, and
   `executionPermitted=false`.

No live venue, real order, or production credential was used.