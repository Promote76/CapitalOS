---
name: Bank sync release boundary
description: Durable provider-neutral safety decision for household bank synchronization.
---

Read-only bank synchronization is a separate opt-in release gate, not a replacement for manual balances and CSV history. The adapter registry may be exercised by isolated fixtures, but production sync must fail closed until a real provider has been separately approved, connected server-side, and certified for recovery.

**Why:** A provider introduces consent, credential, freshness, outage, reauthorization, duplicate reconciliation, and deletion risks that cannot be certified by a fixture alone.

**How to apply:** Keep consent and explicit account matching mandatory; never expose raw credentials or let provider-derived rows enter the capital ledger. Preserve audit history during fixture cleanup and household deletion because audit records are append-only.