# Capital OS

Capital OS is a light-theme family-capital workspace for disciplined saving, protected reserves, strategy experiments, and a first duplex acquisition.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run generate` — create a versioned Drizzle migration from schema changes
- `pnpm --filter @workspace/db run migrate` — apply reviewed migrations in an explicit release step; never on API startup
- `pnpm --filter @workspace/api-server run test` — run the direct financial and governance tests
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: generated Zod schemas, `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/capital-os/src/App.tsx` — route-aware application shell, page views, fallback mock data, and API-backed dashboard/contribution/Treasury reads
- `artifacts/capital-os/src/index.css` — shared light-theme design tokens and responsive component styling
- `artifacts/api-server/src/domain/` — exact-cents calculations, Treasury health and liquidity rules, Capital Governor rules, strategy lifecycle, and disabled blockchain interfaces
- `artifacts/api-server/src/services/` — seed data, Treasury summaries and guarded requests, and transactional household-capital services
- `lib/db/src/schema/` — PostgreSQL/Drizzle household, capital, Treasury, property, strategy, risk, AI, and audit tables
- `docs/capital-os-architecture.md` — backend boundaries, data model, permissions, idempotency, and verification
- `attached_assets/Pasted-Capital-OS-Design-System-Specification-1-Design-Princip_1788226967597.txt` — product design-system specification

## Architecture decisions

- The approved UI remains visually intact. The backend foundation seeds realistic development data and supplies the dashboard and contribution list through a validated API, while retaining local fallback data for a safe review state.
- The app is organized around protected family capital, not trading activity; green communicates protection/progress, blue active capital, lavender research/opportunity, amber review, and red critical safeguards.
- All primary and secondary destinations share one responsive shell with local state for contribution, transfer, strategy, property-note, settings, and risk-review interactions.
- PostgreSQL `numeric(18,2)` values are converted to integer cents for server calculations; ledger and audit records are written with capital movements in one database transaction.
- Clerk sessions resolve to internal users, active household memberships, and role permissions on the server. The `X-Household-Role` header is accepted only by explicit test runs; development seed identity is never used in production.
- AI is advisory-only, and Arbitrum/Base/Ethereum adapters are disabled stubs. No live trading, bank connection, smart contract, or autonomous capital movement is enabled.

## Product

- Dashboard overview for the First Duplex Acquisition goal
- Goals, contributions, transactions, reports, documents, and insights views
- Strategy graduation pipeline with Capital Confidence and Advisory Only AI recommendations
- Portfolio allocation and growth views
- Property readiness milestones, market shortlist, and acquisition planning
- Risk Governor safeguards with protected-capital lock and Emergency Stop confirmation
- Treasury overview with policy hierarchy, protected buckets, liquidity ladder, stress tests, deployability, and human-reviewed capital requests
- Family account, contribution, protection, strategy permission, AI, and security settings

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Standalone Vite builds need `PORT` and `BASE_PATH`; managed workflows provide both automatically.
- The native API tests use Node 24's `--experimental-strip-types` and explicit `.ts` imports.
- Treasury Reserve is a planning bucket, not a ledger clearing account; negative clearing balances must never appear as spendable household capital.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
