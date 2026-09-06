---
name: Clerk reverification transport
description: How provider reverification hints move through generated API clients into the Clerk React retry hook.
---

Clerk's `useReverification()` recognizes the provider hint as a returned payload, while the generated API client wraps non-2xx JSON in an error object. Protected client actions must unwrap and return that hint to the hook; otherwise Clerk cannot open its verification UI and retry the request.

**Why:** Provider reverification is a transport contract across server, generated client, and React SDK—not just a server authorization check.

**How to apply:** When adding a protected mutation, route its generated-client call through the shared reverification wrapper and preserve non-reverification errors as errors.

Protected lifecycle mutations must also be matched by the server's recent-auth gate; a client reverification wrapper alone is never an authorization boundary.

**Why:** An authenticated caller can bypass the browser and invoke a mutation directly, so client-only step-up protection leaves approval and closure routes exposed.

**How to apply:** Add every protected dynamic mutation path to the server matcher, keep the match exact, and verify a direct request fails closed without Clerk's provider reverification check.

The published Clerk sign-in surface is client-rendered; the raw `/sign-in` HTML may not contain the provider name even when the real Clerk UI is visibly rendered. Use an actual published-origin browser screenshot for UI evidence, not an HTML string search.

**Why:** A strict markup heuristic falsely classified a healthy published sign-in route as unavailable during certification.

**How to apply:** Treat HTTP reachability as a preflight only, and reserve authenticated/reverification PASS states for real browser/provider evidence.