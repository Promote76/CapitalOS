---
name: Bank sync release boundary
description: Durable provider-neutral safety decision for household bank synchronization.
---

Read-only bank synchronization is a separate opt-in release gate, not a replacement for manual balances and CSV history. The adapter registry may be exercised by isolated fixtures, but production sync must fail closed until a real provider has been separately approved, connected server-side, and certified for recovery.

**Why:** A provider introduces consent, credential, freshness, outage, reauthorization, duplicate reconciliation, and deletion risks that cannot be certified by a fixture alone.

Signed webhook payloads are notifications, not tenant or cursor authority. Resolve their provider connection reference to exactly one consented household, persist provider event idempotency, and poll from the last committed cursor. Credential recovery replaces only the opaque server-side reference and resumes from that same cursor.

**How to apply:** Keep consent and explicit account matching mandatory; never expose raw credentials or let provider-derived rows enter the capital ledger. Verify webhook authenticity before lookup, fail closed on ambiguous connection references, and retain failed events for replay. Preserve audit history during fixture cleanup and household deletion because audit records are append-only.