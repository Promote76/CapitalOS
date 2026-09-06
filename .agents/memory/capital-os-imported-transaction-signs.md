---
name: Imported transaction signs
description: Canonical sign and migration boundaries for household finance imports
---

All new household finance imports must persist positive inflows and negative outflows after applying an explicit provider convention. Keep the provider-native value separately as evidence.

**Why:** Provider conventions differ, and silently changing an existing row during replay can alter every downstream financial view without an audited migration decision.

**How to apply:** Require each new bank provider to declare its sign convention. Mark rows created under the canonical contract so future provider corrections can be normalized safely; leave unmarked legacy amounts unchanged until a separately approved migration.