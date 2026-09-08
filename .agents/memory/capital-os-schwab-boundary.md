---
name: Schwab read-only boundary
description: Capital OS has a custom OAuth observation foundation whose lifecycle and data remain isolated from every execution authority.
---

The Schwab portfolio boundary must remain observation-only. The custom OAuth
foundation may read and persist sanitized snapshots, but must never expose
order, cancellation, transfer, withdrawal, risk-change, or execution methods.
Credentials and tokens stay server-side and encrypted.

OAuth state must be single-use, expiring, household/actor scoped, bound to an
unpredictable host-only HttpOnly browser cookie, and tied to a durable lifecycle
generation shared by connect, callback, refresh, sync, and disconnect.

**Why:** State alone prevents guessing and replay but not account-linking CSRF
from a valid authorization URL opened in another browser. A lifecycle lock
without a durable generation also lets stale callbacks or syncs overwrite a
newer disconnect/reconnect decision.

**How to apply:** Keep trading disabled and fail closed unless OAuth is healthy.
Reject any callback whose browser binding or lifecycle generation differs, and
conditionally commit sync results only while the same live token generation is
current. Do not claim provider certification until real OAuth evidence exists.