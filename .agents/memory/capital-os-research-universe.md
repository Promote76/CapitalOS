---
name: Broad research universe
description: Source, batching, cursor, and authority rules for broad U.S. equity discovery.
---

Use a frozen, attributed SEC company-ticker snapshot as the broad U.S. equity universe. Restrict it to the approved exchange scope, record exclusions, order symbols deterministically from the snapshot version, and process only bounded batches. Schwab remains a symbol-targeted, read-only enrichment source and must never be described as supplying or screening the universe.

**Why:** The authorized Schwab capabilities do not include a provider-wide screener or practical symbol enumeration. Household-known tickers are too narrow for discovery, while live unversioned enumeration would make runs difficult to reproduce and audit.

**How to apply:** Keep new SEC and Schwab observations pending human review, rank only approved/current household evidence, and preserve the response-provided next offset with its universe version. If the version changes, reset to the first batch. During UI query transitions, treat the successful discovery response as the authoritative cursor source rather than an independent local counter.