# Variable-Income Budget Certification — 2026-09-07

The repository now exposes `pnpm run certify:variable-budget`.

The command reports VB-01 through VB-30 for the verified-income source,
scenario math, obligation and reserve layers, forward cash flow, transfer and
business exclusions, vehicle affordability, Safe-to-Deploy separation,
tenant/role/audit controls, advisory boundaries, and no-money-movement
boundaries. It also runs the supported domain test, API and web typechecks,
route contract parity, and generated finance artifact freshness checks.

The gate report intentionally distinguishes `PASS`, `BLOCKED`, and `FAIL`.
Blocked gates identify evidence that requires an isolated database, provider, or
authenticated browser fixture; they are not converted into synthetic production
evidence.