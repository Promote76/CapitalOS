---
name: Verified-domestic research universes
description: Domestic classification, selection, batching, cursor, and authority rules for U.S. investment discovery.
---

Use a frozen, attributed SEC exchange-directory snapshot only after each issuer is classified from its official SEC submissions jurisdiction. U.S. states, DC, and U.S. territories are verified domestic; foreign and unknown jurisdictions are excluded rather than inferred from exchange. Universe selection is independent of the Income / Compounders / Balanced ranking lens. Process deterministic bounded batches only. Schwab remains a symbol-targeted, read-only enrichment source and must never be described as supplying or screening the universe.

**Why:** A U.S. exchange listing does not prove domestic domicile, and the authorized Schwab capabilities do not include a provider-wide screener or practical symbol enumeration. Unknown domicile must never be guessed. Frozen, classified SEC evidence keeps exclusions and runs reproducible.

**How to apply:** Static type universes use frozen SEC metadata. Income, growth, and cap universes use approved/current household evidence; cap buckets derive USD value from approved shares outstanding times approved price and fail closed on missing inputs. Keep new observations pending review. Bind cursors to source version, universe, and custom allowlist; reset on any identity change.