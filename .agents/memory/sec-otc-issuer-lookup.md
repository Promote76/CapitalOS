---
name: SEC OTC issuer lookup
description: Upstream SEC index and XBRL unit behavior for OTC filing evidence.
---

SEC JSON ticker indexes can omit an active OTC issuer even when the official legacy ticker index and submissions record still map the ticker to its CIK. Companyfacts units are map keys, not fields repeated on each fact row.

**Why:** A live BKSC certification found that relying only on the JSON ticker index falsely rejected the issuer, while flattening companyfacts rows without their enclosing unit key erased official citation units.

**How to apply:** Resolve exact ticker matches through the bounded official legacy index only after the primary JSON index misses. When normalizing companyfacts, carry each enclosing unit key into the selected fact and verify the normalized row against the exact official accession/form/period/value/unit tuple.