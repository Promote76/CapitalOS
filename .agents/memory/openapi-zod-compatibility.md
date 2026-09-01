---
name: OpenAPI and pinned Zod
description: Compatibility constraint between generated validators and the workspace Zod version
---

When adding an unconstrained object to the OpenAPI contract, describe its known properties rather than relying on generator output for newer Zod helpers.

**Why:** The workspace’s pinned Zod version does not expose every helper emitted by the current generator, so an `additionalProperties`-only schema can typecheck-fail after code generation.

**How to apply:** Prefer explicit object properties or a schema shape that generates supported Zod primitives, then regenerate both the React client and server validators.