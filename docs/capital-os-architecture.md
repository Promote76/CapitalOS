# Capital OS backend foundation

## System boundary

Capital OS is a household-capital application with a PostgreSQL source of truth. Private household, account, goal, property, risk, and recommendation data remains off-chain. The blockchain layer is an adapter contract only and is disabled in every environment.

The request path is:

```text
React UI → generated API client → Express routes → Zod request/response validation
                                      ↓
                             domain services
                                      ↓
                         Drizzle transaction boundary → PostgreSQL
                                      ↓
                              append-only audit event
```

The API server may warm the seeded `Morgan household` only in development. Production onboarding creates a household explicitly after Clerk identity resolution; production startup never creates demo data.

## Data model

- `households`, `capital_users`, and `household_members` model household ownership and explicit roles.
- `capital_accounts` stores fixed-precision numeric balances and protection/risk metadata.
- `capital_goals` stores target, current, protected, weekly, and timeline values.
- `allocation_rules` is the source of truth for the weekly split (seeded at `$200 / $25 / $25` from `$250`).
- `ledger_transactions` and `ledger_entries` provide a double-entry-inspired movement history. Internal movements have a debit and a credit entry, and balances are reconciled against this history.
- `contributions` stores an idempotent contribution intent and its allocation metadata.
- Property tables track a decision-support goal and readiness milestones only; they do not purchase property.
- Strategy tables track lifecycle stage, evidence, performance, and human approvals only; they do not connect to a venue.
- `risk_states`, `risk_events`, `ai_recommendations`, `audit_events`, and `idempotency_keys` provide governance records.

Authoritative financial columns use PostgreSQL `numeric(18,2)`. Service calculations convert validated decimal strings to integer cents, and formatting back to decimal strings happens only at the API boundary. JavaScript floating-point arithmetic is not used for balances or financial decisions.

## Permissions and safety

The request context resolves a Clerk user to an internal user and active household membership in production. In development and explicit test mode, the seeded actor and `X-Household-Role` can exercise role paths; those mechanisms are not production authorization. Production requests without a valid Clerk session return `401`, and authenticated users without membership return `403`.

The Capital Governor enforces:

- protected-capital lock;
- maximum active capital;
- maximum strategy allocation;
- weekly risk and drawdown ceilings;
- minimum cash reserve;
- emergency stop state.

Risk checks happen in domain services, not in UI components. A protected account cannot fund an experimental strategy while the lock is active. A transfer must stay within the household and produce ledger entries in one transaction; concurrent balance checks still require row-locking or an atomic balance guard before this is a production-safe overdraft boundary.

## Idempotency and concurrency

Contribution and transfer writes require an `Idempotency-Key`. The key is scoped to the household. Repeating a key with the same amount returns the original completed result; reusing it with a different amount returns a conflict. Uniqueness and the transaction boundary constrain duplicate ledger movements, but concurrent duplicate handling and source-balance races still need HTTP/database concurrency tests and conflict-retry behavior. Balance changes are SQL numeric updates inside the same transaction as ledger and audit writes.

## AI boundary

AI recommendations are stored as advisory records with an explicit `advisoryOnly` API field. A human can approve or reject the recommendation, but the approval only records a decision. AI cannot move money, change protection, override risk, enable trading, change credentials, or deploy contracts.

## Strategy lifecycle

Strategies move one stage at a time: Research → Backtest → Shadow → Paper → Micro-Live → Approved → Production. Promotion requires evidence for minimum observations, reconciliation accuracy, and absence of critical errors. An authorized owner override is separately audited. No stage enables live trading in this foundation.

## Blockchain boundary

`ChainAdapter` defines future read, simulation, submission, and status capabilities. Disabled stubs exist for Arbitrum, Base, and Ethereum. `submitTransaction` always returns `submitted: false`, and the future capital-vault interface is marked disabled. There is no wallet, bank, exchange, contract deployment, or live-chain configuration in this release.

## API and UI

The OpenAPI document at `lib/api-spec/openapi.yaml` is the contract source. Orval generates the React Query client and Zod schemas. The dashboard and contribution list now read through the API client; the approved visual system and navigation remain unchanged. If the dashboard service is unavailable, the UI keeps its local review view and shows a clear status message rather than silently pretending a write succeeded.

## Verification

Run:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/db run push # managed development database only
pnpm --filter @workspace/api-spec run codegen
```

The direct domain tests cover exact-cents arithmetic, allocation totals, goal pace, allocation impact, role permissions, protected-capital blocking, stage skipping, and AI authority. API responses are parsed through generated Zod schemas before being sent. The current audit in `docs/PRODUCTION_READINESS_AUDIT_2026-09-02.md` records the unverified HTTP, database, browser, concurrency, backup, and recovery boundaries.