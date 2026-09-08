---
name: Variable-income household budget
description: Durable boundaries for the variable-income planning engine.
---

The variable-income household budget is a read-only advisory layer over verified
household income events and approved household planning data.

**Why:** Business deposits, projected income, transfers, protected capital, and
unreviewed transactions must not silently become household spending capacity or
Safe-to-Deploy.

**How to apply:** Use exact-cent floor/base/strong scenarios, fail closed for
insufficient history or missing approved data, keep vehicle scenarios planning-only,
and preserve the existing Capital Governor as the authority for deployable capital.