# Current surface certification — Family Office expansion

**Certification date:** 2026-09-07  
**Current executable route inventory:** 170 route/method pairs  
**Focused scope:** seven Family Office routes added after the prior 163-route replay  
**Evidence target:** disposable loopback PostgreSQL with a target sentinel; no shared or production database

## Decision

The expanded Family Office route and browser boundary slice is **CERTIFIED on
isolated infrastructure**. This closes the focused HTTP and authenticated
browser evidence gap for the seven routes. It does **not** claim that a single
full 170-route replay passed: the prior 163-route replay remains the broad
preflight baseline, while the seven new routes were exercised by P0-09.

## Executed evidence

Command:

```text
pnpm run certify:family-office
```

Evidence log:

```text
docs/certification/household-privacy-runs/household-privacy-2026-09-07T01-17-55Z.log
```

The guarded runner created a disposable PostgreSQL target, applied the current
schema, ran P0-09, ran the authenticated browser fixture, and tore the target
down. The P0-09 test passed over:

- `GET /family-office`
- `GET /family-office/real-estate`
- `POST /family-office/research`
- `POST /family-office/proposals/:proposalId/decision`
- `POST /family-office/shadow/portfolios`
- `POST /family-office/shadow/intents`
- `POST /family-office/tax-liens`

The executed HTTP assertions covered:

- Household A/B collection reads with foreign proposal and Shadow portfolio
  identifiers rejected from the opposite household.
- Five role denials and four missing recent-auth denials.
- Malformed research input and a local malformed-provider response.
- Provider-disabled behavior and prompt-injection marker non-echo.
- Human-reviewed proposal approval, Shadow portfolio creation, hypothetical
  intent creation, and Florida tax-lien candidate creation.
- `advisoryOnly`, `transmitted: false`, and no ledger transaction or contribution
  deltas after Shadow-only writes.

The authenticated Clerk browser fixture passed:

- disabled-provider state with research action disabled;
- loading state;
- provider error/retry state;
- proposal review state;
- Shadow portfolio state;
- hypothetical intent state;
- no rendered provider secret or execution authority.

## Source review versus executed evidence

Route inventory, request-context step-up rules, Family Office service predicates,
domain sanitization, generated schemas, database declarations, and the Capital
OS page were reviewed as source. Source review supports the interpretation of
the executed assertions but is not counted as a test result.

## Remaining open claims

- The full 170-route preflight still needs a clean replay independent of the
  existing concurrent operations approval race that can return a 500 where its
  legacy assertion expects 400.
- Production migration, backup restore, PITR, and recovery claims remain open;
  this certification used only disposable infrastructure.
- Provider-backed live research remains disabled/fail-closed. No external
  provider secret was used by the certification, and no real order or household
  capital movement occurred.