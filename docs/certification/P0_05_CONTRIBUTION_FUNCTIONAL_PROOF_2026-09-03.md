# P0-05 contribution functional proof

**Execution date:** 2026-09-03  
**Status:** **FUNCTIONAL HTTP PROOF — NOT PROVIDER-BROWSER CERTIFICATION**

This addendum records the exact-$250 contribution scenario that was executed with
the workspace TypeScript runner. The run used the configured development database
as a functional check; it was not an isolated disposable certification target and
does not extend the approved Clerk browser evidence.

## Executed command

```text
CAPITAL_OS_RUN_INTEGRATION=1 CAPITAL_OS_TEST_CONTEXT=1 \
CAPITAL_OS_ALLOWED_ORIGIN=http://capitalos.test \
node <workspace-tsx-cli> --test --test-name-pattern='P0-05 contribution journey' \
artifacts/api-server/src/integration/p0-http.test.ts
```

Result: **PASS — 1 test passed, 0 failed**.

## Assertions

| Check | Result |
|---|---|
| Active allocation rule | `250.00` total: `200.00` Duplex Reserve, `25.00` Capital OS, `25.00` Opportunity Reserve |
| First contribution | HTTP `201`, exactly `250.00`, completed |
| Allocation split | `20,000` / `2,500` / `2,500` integer cents |
| Same-key replay | HTTP `201`, same contribution ID and persisted response |
| Mismatched same-key replay | HTTP `409`, `IDEMPOTENCY_CONFLICT` |
| Economic record count | Exactly one contribution for the idempotency key |
| Ledger movement | Three Treasury-to-destination movements; debits and credits both `250.00` |
| Treasury funding | Treasury balance reduced by exactly `250.00` |
| Goal progress | Current and protected goal amounts advanced only by the `200.00` protected split |
| Fresh reads | `/contributions`, `/goals`, `/accounts`, `/treasury`, `/portfolio`, and `/audit` returned `200` and retained the expected state |
| Audit attribution | `contribution_completed` retained the authenticated fixture user as actor |
| Failure path | The duplicate amount conflict remained an explicit API failure rather than a second write |

The frontend was also typechecked, production-built with the managed environment
values, restarted through its managed workflow, and previewed successfully. The
Contributions history now reads the API's `capitalOs` split field and the page's
allocation display derives from the loaded active rule.

## Certification boundary

An approved Clerk browser journey that opens the contribution modal, submits the
visible `$250` value, reloads the page, and observes the persisted history was not
executed in this environment. MFA or step-up evidence is therefore not claimed.
The server test uses the existing test-only authenticated fixture boundary and
must not be presented as provider authentication evidence.