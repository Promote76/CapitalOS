# GitHub governance

## Required development path

Capital OS changes use:

1. a feature, repair, or hardening branch;
2. a pull request into `main`;
3. successful Capital OS CI;
4. review of financial, tenant-isolation, execution-boundary, and generated-contract changes before merge.

Direct pushes to `main` are blocked by the active repository ruleset.

## Enforced main protection

The repository ruleset `Protect Main` is active for `refs/heads/main` and enforces:

- pull requests before merge;
- the `Verify financial and safety contracts` required status check;
- strict up-to-date status checks before merge;
- dismissal of stale reviews when new commits are pushed;
- no force pushes;
- no deletion of `main`;
- no configured bypass actor.

The required approval count is currently zero so a solo maintainer is not locked out. CODEOWNERS provides ownership routing but does not substitute for an independent required approval. Raise the required approval count when a second trusted reviewer is available.

## Required CI

`.github/workflows/ci.yml` is the baseline repository gate. It uses an ephemeral PostgreSQL service and verifies:

- workspace TypeScript contracts;
- generated financial artifacts;
- OpenAPI route parity;
- Portfolio AI / Schwab snapshot source invariants;
- broker-portfolio domain behavior;
- API tests;
- selected Capital OS web unit tests.

Production provider credentials are deliberately not supplied to baseline CI.

Third-party GitHub Actions used by Capital OS workflows are pinned to immutable commit SHAs. Dependabot is configured to monitor both workspace package dependencies and GitHub Actions references.

## Authenticated runtime certification

`.github/workflows/runtime-certification.yml` is manual and separate from baseline CI. Authenticated production certification is allowed only from `refs/heads/main`. A dedicated ref guard runs before the environment-backed job, and the authenticated job itself also checks the exact main ref before the `production-certification` environment can be used.

Authenticated runtime certification remains deferred unless an exact-release production certification is required. Its existence is not a production PASS.

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

## Repository visibility and public artifacts

Repository visibility is an operational governance decision, independent of branch protection. When the repository is public, committed screenshots, attached assets, agent memory, certification evidence, and historical repository content must be treated as publicly accessible. Visibility and artifact-retention decisions must be reviewed separately; do not assume a later visibility change erases previously published material.
