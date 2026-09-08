---
name: HTTP idempotency header casing
description: Non-obvious boundary between OpenAPI-generated header validators and Node request headers.
---

Normalize incoming HTTP header names before parsing them with generated OpenAPI validators that preserve the documented display casing.

**Why:** Node and Express expose request header keys in lowercase, while generated validators may require a key such as `Idempotency-Key`. Parsing the raw header object can reject a valid browser request even when the generated client sent the header correctly.

**How to apply:** At route boundaries, read the lowercase runtime key and construct the validator’s expected shape. Keep body/header equality checks after normalization, and cover the real generated-client-to-Express path with authenticated browser evidence.