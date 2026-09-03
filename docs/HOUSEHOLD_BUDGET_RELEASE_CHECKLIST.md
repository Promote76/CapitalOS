# Household Budget Release Checklist

## Current release: manual and CSV planning

This release activates household budgeting as a private, read-only planning surface. It does not authorize bank synchronization, bill pay, transfers, ACH, automatic payments, trading, or any other money movement.

### Authentication and household isolation

- [ ] Production requests require a valid Clerk session.
- [ ] A first authenticated user without an active membership receives a new private household and owner membership.
- [ ] Household provisioning is serialized per authenticated user and records an attributed initialization audit event.
- [ ] Finance reads and writes use the authenticated household ID; they never use the development/demo household in production.
- [ ] Cross-household account IDs, imports, bills, expenses, income, snapshots, and derived outputs fail closed.
- [ ] Development seed behavior remains available only outside production and is never presented as onboarding data.

### Supported data entry

- [ ] Manual financial accounts are the supported source for balances.
- [ ] CSV import is the supported source for transaction history.
- [ ] Manual and imported records remain read-only with respect to external institutions.
- [ ] CSV rows require a valid date, description, and signed amount.
- [ ] Quoted CSV fields and commas in descriptions are parsed correctly.
- [ ] Repeated imports are duplicate-safe, including rows without a provider-supplied ID.
- [ ] Imported transactions are stored as `needs_review` and do not affect budget or cash-flow calculations until approved.
- [ ] Account and connection freshness timestamps are updated on accepted manual and CSV input.

### Planning and safety behavior

- [ ] Budget and cash-flow periods are calculated from the current calendar period.
- [ ] Budget and cash-flow calculations use approved transactions only.
- [ ] Safe-to-Deploy remains advisory, non-executing, and conservative when accounts, categories, income, or freshness data are incomplete.
- [ ] Protected capital remains visible only to permitted roles and is excluded from deployable surplus.
- [ ] Every finance mutation records the authenticated actor and household in the audit history.
- [ ] The UI distinguishes household facts, CSV review state, stale/incomplete data, calculated forecasts, protected capital, and advisory Safe-to-Deploy output.
- [ ] Banking status continues to report no stored credentials, transfers, or bill pay.

### Verification

- [ ] API and frontend TypeScript checks pass.
- [ ] API contract parity passes after any OpenAPI change.
- [ ] Household-finance unit tests pass.
- [ ] The database-backed finance isolation fixture passes on an isolated certification database.
- [ ] The production frontend build passes with the artifact environment.
- [ ] Both affected workflows restart cleanly and the authenticated preview route renders without browser errors.

## Separate future gate: read-only bank synchronization

Do not enable this feature as part of the current release. It requires a separate review and release decision covering:

- an approved provider connection and server-side token handling;
- explicit household consent, revocation, and reauthorization behavior;
- provider webhook or polling freshness, outage, and rate-limit handling;
- account matching and duplicate-safe transaction reconciliation;
- review queues for pending, transferred, business, and ambiguous transactions;
- deletion/export behavior for provider-derived data;
- tenant-isolation, audit-attribution, and recovery certification using provider failure fixtures.

## Separate future gate: action features

Bill pay, ACH, transfers, automatic payments, loan submission, broker/lender workflows, and any investment execution remain separate products. Each would require its own authorization, step-up, idempotency, limits, reconciliation, incident recovery, and production certification. Household budget activation must never be used as evidence that an action feature is approved.