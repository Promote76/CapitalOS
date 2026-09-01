---
name: Generated query hook options
description: A typing constraint when customizing React Query options on generated API hooks.
---

Generated React Query hooks in this workspace require their generated query key to be supplied when passing custom query options such as `staleTime`.

**Why:** The generated hook option type currently treats `queryKey` as required, even though the hook can infer its default key when no options are supplied.

**How to apply:** Import the matching generated `get*QueryKey` helper and include it alongside custom query options in frontend hooks.