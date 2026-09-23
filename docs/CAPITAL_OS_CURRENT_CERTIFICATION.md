# Capital OS current certification

**Status date:** 2026-09-23  
**Source baseline reviewed:** `d4891d3834a52d5dd13bb753bfeea4478fee0a07` plus this certification-only PR  
**Current source decision:** **CONTROLLED INTERNAL USE / SOURCE IMPLEMENTATION REVIEWED — PUBLIC PRODUCTION CERTIFICATION NOT RERUN**

The previous 2026-09-08 certification is preserved at
`docs/certification/CAPITAL_OS_CERTIFICATION_2026-09-08_HISTORICAL.md`.
That document remains valid only for the source/runtime evidence it explicitly
recorded at that time.

This living status file intentionally separates current source implementation
from runtime production certification. A source commit, a deployment commit, or
a provider connection by itself is not equivalent to complete release
certification.

## Current implementation state

### Portfolio / Schwab observation

Current source includes:

- server-side Schwab OAuth lifecycle and read-only observations;
- persisted household-scoped observation snapshots;
- exact snapshot IDs returned by sync/read surfaces;
- Portfolio totals derived from one snapshot rather than independently selected
  "latest" records;
- reconciliation of total brokerage value, invested market value, and brokerage
  cash with unresolved values preserved as `UNKNOWN`;
- fractional-position precision in normalized observations;
- transaction normalization that associates a security symbol when the provider
  payload supports it and preserves uncertainty otherwise;
- freshness and reconciliation state exposed to Portfolio consumers.

Runtime connection state and credential health are external runtime facts and
must not be inferred from source control. See
`docs/SCHWAB_READ_ONLY_ARCHITECTURE.md`.

### Portfolio AI Agent

Current source includes a household-scoped Portfolio AI Agent bound to the exact
snapshot displayed by the Portfolio experience.

The response contract explicitly carries:

- `snapshotId` and snapshot as-of time;
- snapshot freshness;
- reconciliation status;
- facts, recommendations, risks, and uncertainties;
- `advisoryOnly: true`;
- `educationalOnly: true`;
- `executionAuthorization: false`;
- `moneyMovementEnabled: false`.

The agent prompt requires observed facts to come from the selected portfolio
snapshot and keeps approved research separate from current holdings. Stale,
unknown, unresolved, or mismatched evidence must be disclosed rather than
silently converted into current/confirmed data.

Requests to execute or automate trades, place/cancel/replace orders, move money,
withdraw, transfer, borrow, or add leverage remain outside the agent's
authority.

### Execution boundary

The following remain outside the certified authority of the Portfolio/Research
AI surfaces:

- autonomous brokerage trading;
- order placement, cancellation, replacement, or automatic trade preparation;
- transfers and withdrawals;
- leverage or borrowing;
- conversion of protected household/property capital into investable capital;
- conversion of approved research into execution authorization.

## Repository verification

The repository now defines a GitHub CI workflow intended to run on pull requests
and pushes to `main`. Its baseline checks include:

- workspace typecheck;
- generated finance-artifact verification;
- API contract parity;
- dedicated Portfolio AI / snapshot source certification;
- broker-portfolio domain tests;
- API test suite;
- selected Capital OS web unit tests.

CI execution results are runtime evidence and should be evaluated on the pull
request/commit where they ran. The existence of this workflow is not itself a
PASS result.

## Current known release limitations

Public production certification remains open until the current build receives fresh, dated evidence for the relevant runtime gates, including authenticated browser behavior, current provider/runtime observations, and any other release criteria required by the production-candidate process. GitHub now contains a manual `Capital OS Runtime Certification` workflow and `docs/RUNTIME_CERTIFICATION.md` runbook for collecting that evidence without granting execution authority.

GitHub server-side protection is now enforced on `main` by the active `Protect Main` ruleset. Pull requests are required, the `Verify financial and safety contracts` check is required with strict up-to-date enforcement, stale approvals are dismissed on new pushes, force pushes are blocked, branch deletion is blocked, and no bypass actor is configured.

## Decision

Capital OS source contains substantial financial-integrity, tenant-safety,
read-only Schwab, Portfolio reconciliation, and advisory-AI controls.

**Do not label the current HEAD as fully production-certified solely from this
document.** Production certification requires fresh execution of the applicable
release gates and retained evidence against the exact release candidate.
