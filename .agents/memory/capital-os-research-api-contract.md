---
name: Research API contract certification
description: Keep authenticated Research route responses aligned with generated schemas and real browser behavior.
---

Research opportunity and advisory-decision responses must be certified through the authenticated API route, not only through service-level tests or mocked browser payloads.

**Why:** The generated response schema can require the full factor-score contract even when a service-level test accepts a shorthand object, causing the real page to fail closed before any decision card renders.

**How to apply:** After changing Research evidence or ranking payloads, run the generated contract check and an authenticated browser request against the real development database; keep UI mappings explicit when the API uses canonical factor names.