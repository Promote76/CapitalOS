# Capital OS

Capital OS is a light-theme family-capital workspace for disciplined saving, protected reserves, strategy experiments, and a first duplex acquisition.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/capital-os/src/App.tsx` — route-aware application shell, page views, mock data, and local interactions
- `artifacts/capital-os/src/index.css` — shared light-theme design tokens and responsive component styling
- `attached_assets/Pasted-Capital-OS-Design-System-Specification-1-Design-Princip_1788226967597.txt` — product design-system specification

## Architecture decisions

- The first release is frontend-only and uses realistic local mock data so the product surface can be reviewed before persistence and integrations are added.
- The app is organized around protected family capital, not trading activity; green communicates protection/progress, blue active capital, lavender research/opportunity, amber review, and red critical safeguards.
- All primary and secondary destinations share one responsive shell with local state for contribution, transfer, strategy, property-note, settings, and risk-review interactions.

## Product

- Dashboard overview for the First Duplex Acquisition goal
- Goals, contributions, transactions, reports, documents, and insights views
- Strategy graduation pipeline with Capital Confidence and Advisory Only AI recommendations
- Portfolio allocation and growth views
- Property readiness milestones, market shortlist, and acquisition planning
- Risk Governor safeguards with protected-capital lock and Emergency Stop confirmation
- Family account, contribution, protection, strategy permission, AI, and security settings

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
