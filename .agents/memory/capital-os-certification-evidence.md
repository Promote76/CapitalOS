---
name: Capital OS certification evidence boundary
description: Rules for deciding which production-readiness gates may be closed from disposable infrastructure evidence.
---

Release gates must close only from observed execution against isolated certification infrastructure. Repository artifacts and test paths can establish that a check is available, but not that it passed.

**Why:** Clean migration, contention, and HTTP fixture evidence became valid only after execution on disposable PostgreSQL. An older-schema test cannot be meaningful without an approved historical schema/data artifact, and a restore drill cannot be replaced by an application export or synthetic copy.

**How to apply:** Keep the release decision NOT READY while any required gate is unexecuted. Certification wrappers should report a successful guarded migration as closed and list only the genuinely remaining external gates.

The Operations Recovery suite must prove all OR-01 through OR-24 behaviors against a fresh disposable PostgreSQL target; the repository now provisions that target automatically for the guarded certification command.

**Why:** The fail-closed operations runner intentionally refuses to treat an ambient development `DATABASE_URL` as isolated certification infrastructure, while manual target setup made repeatable evidence unnecessarily dependent on environment state.

**How to apply:** Run `pnpm run certify:operations-recovery`; it initializes a temporary loopback cluster from committed migrations, injects the database URL only into the test process, retains redacted per-gate output, and tears the cluster down in `finally`. Use an explicit certification URL only for a separately controlled target.

Before using a historical SQL artifact for certification, compare it byte-for-byte with the output generated from the approved historical source; table counts alone can miss omitted constraints.

**Why:** A manually assembled snapshot initially omitted one foreign-key statement even though its table and index counts looked plausible.

**How to apply:** Treat the generated migration as the source of truth and make the exact comparison a prerequisite to any old-schema upgrade run.

Database query wrappers may expose PostgreSQL invalid-UUID code `22P02` on a nested
`cause` rather than the top-level error.

**Why:** A malformed route identifier initially reached the global handler as a
wrapped driver error and was incorrectly returned as `500 INTERNAL_ERROR`.

**How to apply:** When mapping database validation failures, inspect the wrapped
cause chain or validate UUID route parameters before querying.

Route preflights must treat parameterized identifiers and parameterless write bodies
as different threat surfaces.

**Why:** A parameterless write can safely return `200` after stripping an unknown
household field; requiring every tamper probe to reject with non-2xx misclassifies a
safe mass-assignment defense as an IDOR failure.

**How to apply:** Require foreign/malformed rejection for path identifiers, but for
parameterless writes assert no foreign identifiers or server-owned values are
returned or persisted.

Certification runners that support recorded evidence must parse explicit per-gate
result sections and use them only when no fresh isolated rerun was requested; a
missing optional certification environment must not erase already certified gates.

**Why:** The candidate runner initially reported seven open gates after the
authenticated browser fixes because it only understood the prior failure wording
and treated absent optional rerun variables as loss of all prior fixture evidence.

**How to apply:** Prefer fresh execution results, fail on a requested rerun failure,
and otherwise consume only explicit `PASS` evidence for each individual P0 gate.

Certification fixtures that exercise append-only audit tables must retain their
rows in the disposable target rather than attempting cleanup. Denied transition
audits must commit before the service raises the expected governance error.

**Why:** The audit archive intentionally rejects deletion, and an audit insert
inside a transaction that later throws is rolled back, which otherwise leaves
the retained certification evidence incomplete.

**How to apply:** Use a fresh guarded target for each certification run, retain
fixture evidence there, and return a post-transaction denial after the audit
write commits.

Disposable certification targets must carry an explicit
`capital_os_certification.target_guard` sentinel, and guarded migration setup
must force `search_path=public` before applying the application schema.

**Why:** PostgreSQL's default `$user, public` search path can resolve a
sentinel schema named after the certification role before the real `public`
schema, making a clean target appear to have missing application tables.

**How to apply:** Refuse resets without the sentinel, then apply migrations and
schema synchronization against `public`; never infer isolation from an
ambient `DATABASE_URL` alone.

Capital-approval certification fixtures must establish genuine reviewed
deployable room, including a complete exact-100% planning template, rather
than relying on a liquid account balance or bypassing policy checks.

**Why:** Once Safe-to-Deploy correctly failed closed without an approved plan,
older approval fixtures became risk-blocked even though their raw cash balance
looked sufficient.

**How to apply:** Seed the intended finance taxonomy, complete and approve the
current plan through normal service boundaries, assert the required deployable
room exists, and only then exercise the capital approval.