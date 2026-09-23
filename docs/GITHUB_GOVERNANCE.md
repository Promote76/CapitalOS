# GitHub governance

## Required development path

Capital OS changes should use:

1. a feature or repair branch;
2. a pull request into `main`;
3. successful Capital OS CI;
4. review of financial, tenant-isolation, execution-boundary, and generated-contract changes before merge.

Direct pushes to `main` are not the intended delivery path.

## Required CI

`.github/workflows/ci.yml` is the baseline repository gate. It uses an ephemeral PostgreSQL service and verifies:

- workspace TypeScript contracts;
- generated financial artifacts;
- OpenAPI route parity;
- Portfolio AI / Schwab snapshot source invariants;
- broker-portfolio domain behavior;
- API tests;
- selected Capital OS web unit tests.

Production provider credentials are deliberately not supplied to CI.

## Branch protection limitation

At the time this policy was created, repository ruleset access for this private repository was not available under the current GitHub plan/API access. As a result, the PR-and-green-CI policy is documented but cannot yet be enforced with a repository ruleset from this environment.

When plan support is available, protect `main` and require:

- pull requests before merge;
- the Capital OS CI check;
- branch to be up to date before merge;
- dismissal of stale approvals after new commits;
- no force pushes;
- no branch deletion.

## Financial-system review rules

Changes that affect any of the following require explicit review of their safety boundary:

- household or tenant scoping;
- ledger/accounting calculations;
- protected-capital classifications;
- Safe-to-Deploy;
- Treasury or capital allocation;
- Schwab/provider adapters;
- AI recommendation grounding;
- execution-control, OMS, Guardian, or Micro-Live code;
- authentication/reverification;
- migrations or durable audit records.

AI output is advisory. Research approval does not grant brokerage execution authority.
