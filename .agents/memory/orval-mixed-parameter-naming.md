---
name: Orval mixed parameter naming
description: Covers a split-generation naming collision caused by operations that combine path and query parameters.
---

In this workspace's split Orval configuration, an operation with both path and
query parameters can generate a Zod path validator and a TypeScript query type
with the same `OperationParams` export name.

**Why:** The generated API and generated type index are both re-exported, so the
duplicate export makes the library build fail even though OpenAPI generation
itself succeeds.

**How to apply:** Prefer a query-only contract when a fixed capability naturally
needs several query inputs, or otherwise verify generated export names before
committing a mixed path/query operation. Never patch generated files directly.