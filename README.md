# Capital OS

Capital OS is a family-capital operating system for household resilience, protected reserves, disciplined investing, property readiness, business planning, and long-term wealth compounding.

The system is intentionally **advisory-first and non-executing**. Protected household and property capital remain separate from investment research and brokerage observations. AI may explain, educate, analyze, and recommend; it does not receive autonomous order, transfer, withdrawal, leverage, or money-movement authority.

## Current architecture

- **Web:** React / Vite / TypeScript
- **API:** Express 5 / TypeScript
- **Database:** PostgreSQL / Drizzle ORM
- **Auth:** Clerk-backed server household context
- **Validation:** OpenAPI-generated Zod contracts
- **Broker observation:** Charles Schwab read-only OAuth and normalized snapshots
- **Research:** approved evidence projection plus advisory AI analysis
- **Governance:** household scoping, exact-cents accounting, audit trails, fail-closed execution controls

## Portfolio and AI boundary

The Portfolio surface is built around persisted read-only brokerage snapshots. Portfolio totals, holdings, transactions, freshness, reconciliation, and Portfolio AI explanations are bound to the same snapshot identifier.

The Portfolio AI Agent is designed to:

- explain brokerage and portfolio data in plain language;
- distinguish observed facts from approved research and inference;
- identify concentration, diversification, freshness, and reconciliation concerns;
- provide educational, informational, and advisory recommendations;
- disclose uncertainty and relevant capital/risk constraints.

It cannot place, prepare for automatic execution, cancel, or replace live orders; move money; change broker settings; enable leverage; or convert research into execution authority.

## Local development

Requirements:

- Node.js 24
- pnpm
- PostgreSQL
- a local `DATABASE_URL`

Install and verify:

```bash
pnpm install
pnpm run typecheck
pnpm --filter @workspace/api-server run test
```

The API development command is:

```bash
pnpm --filter @workspace/api-server run dev
```

Do not commit credentials. Runtime secrets such as Schwab credentials, Clerk secrets, database credentials, session secrets, provider tokens, and API keys must remain outside source control.

## Verification and certification

Repository checks include:

```bash
pnpm run typecheck
pnpm run check:generated-finance-artifacts
pnpm --filter @workspace/api-server run check-contract
pnpm run certify:portfolio-ai
pnpm --filter @workspace/api-server run test
```

Additional focused certification commands are available in the root `package.json` for financial integrity, household privacy, Schwab read-only behavior, execution controls, observability, recovery, Budget planning, and production-candidate review.

See:

- `docs/CAPITAL_OS_CURRENT_CERTIFICATION.md`
- `docs/SCHWAB_READ_ONLY_ARCHITECTURE.md`
- `docs/AI_GOVERNANCE.md`
- `docs/capital-os-architecture.md`

## GitHub delivery policy

Changes should be proposed through pull requests and pass `.github/workflows/ci.yml` before merge. The workflow uses a disposable PostgreSQL service and does not require production provider credentials.

Branch-protection enforcement depends on repository-plan support. Until GitHub protection/rulesets are available for this private repository, PR review and green CI are the documented merge policy rather than a technically enforced server-side restriction.

## License

MIT. See `LICENSE`.
