---
name: Clerk reverification transport
description: How provider reverification hints move through generated API clients into the Clerk React retry hook.
---

Clerk's `useReverification()` recognizes the provider hint as a returned payload, while the generated API client wraps non-2xx JSON in an error object. Protected client actions must unwrap and return that hint to the hook; otherwise Clerk cannot open its verification UI and retry the request.

**Why:** Provider reverification is a transport contract across server, generated client, and React SDK—not just a server authorization check.

**How to apply:** When adding a protected mutation, route its generated-client call through the shared reverification wrapper and preserve non-reverification errors as errors.