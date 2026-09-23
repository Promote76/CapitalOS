# Capital OS runtime certification runbook

This runbook covers the GitHub-hosted, **manual** runtime certification path for the Portfolio route, Schwab read-only observations, and the Portfolio AI Agent.

It does not grant brokerage execution authority. The certification workflow must remain read-only with respect to Schwab trading and money movement.

## Workflow

Run **Capital OS Runtime Certification** from GitHub Actions.

The workflow has two stages:

1. **Source Portfolio and AI certification** — always runs and validates the snapshot/AI source boundary and broker portfolio domain tests.
2. **Authenticated Portfolio and Schwab runtime certification** — runs only when the manual input `run_authenticated_runtime` is enabled.

The authenticated job uses the GitHub Environment named `production-certification`.

## Required environment configuration

Configure the following only in the `production-certification` GitHub Environment:

- Variable: `CAPITAL_OS_PUBLISHED_ORIGIN`
- Secret: `CAPITAL_OS_PRODUCTION_OPERATOR_SESSION_COOKIE`
- Secret: `CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID`

Do **not** place Schwab app keys, Schwab app secrets, database passwords, Clerk secret keys, or other provider credentials into this workflow.

The operator session cookie should be a short-lived, pre-approved production session used only for certification. Rotate or delete it after the certification window.

Where GitHub plan features permit it, require manual approval for the `production-certification` environment before secrets are released to a job.

## Runtime gates

The authenticated certification is expected to verify:

- a real authenticated household session;
- a healthy read-only Schwab connection;
- a bounded read-only observation sync;
- a fresh persisted snapshot;
- current positions and observed transactions;
- portfolio ledger totals remaining unchanged by observation sync;
- trading remaining disabled and execution authority remaining `none`;
- Portfolio AI bound to the exact snapshot ID;
- Portfolio AI advisory/educational boundary and no money movement;
- Portfolio browser rendering from the post-sync snapshot;
- credential-safe/redacted evidence.

The workflow explicitly sets `CAPITAL_OS_SCHWAB_CLEANUP=0`. No household cleanup is permitted from GitHub runtime certification.

## Evidence handling

The workflow uploads the redacted evidence artifact:

`SCHWAB_PORTFOLIO_SYNC_LATEST.json`

Artifact retention is 30 days.

A successful GitHub Actions run is evidence for the exact checked-out commit only. Do not apply a PASS to a later commit or deployment without rerunning the certification against that exact release candidate.

## Fail-closed interpretation

Use these meanings:

- **PASS** — the gate was executed against the required evidence and passed.
- **FAIL** — the gate executed and contradicted the required invariant.
- **BLOCKED / UNKNOWN** — required authenticated/runtime evidence was unavailable or incomplete.

Missing secrets, expired sessions, provider disconnection, stale snapshots, browser failures, or incomplete reconciliation must not be converted into PASS.

## Execution boundary

This workflow must never:

- place, cancel, replace, or stage live brokerage orders;
- enable margin or leverage;
- transfer or withdraw money;
- change Schwab account settings;
- use protected household/property capital as investable capital;
- convert research approval or an AI recommendation into execution authorization.

If a future change introduces any of those capabilities, this runtime certification workflow must fail closed until a separately approved execution certification exists.
