---
name: Capital OS certification evidence boundary
description: Rules for deciding which production-readiness gates may be closed from disposable infrastructure evidence.
---

Release gates must close only from observed execution against isolated certification infrastructure. Repository artifacts and test paths can establish that a check is available, but not that it passed.

**Why:** Clean migration, contention, and HTTP fixture evidence became valid only after execution on disposable PostgreSQL. An older-schema test cannot be meaningful without an approved historical schema/data artifact, and a restore drill cannot be replaced by an application export or synthetic copy.

**How to apply:** Keep the release decision NOT READY while any required gate is unexecuted. Certification wrappers should report a successful guarded migration as closed and list only the genuinely remaining external gates.

Before using a historical SQL artifact for certification, compare it byte-for-byte with the output generated from the approved historical source; table counts alone can miss omitted constraints.

**Why:** A manually assembled snapshot initially omitted one foreign-key statement even though its table and index counts looked plausible.

**How to apply:** Treat the generated migration as the source of truth and make the exact comparison a prerequisite to any old-schema upgrade run.