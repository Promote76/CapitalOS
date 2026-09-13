---
name: Browser route certification
description: How to scope Capital OS browser tests for route-only behavior versus tenant-backed behavior.
---

Route-only browser regressions should run against the configured development workflow without creating Clerk users or database tenants. Reserve disposable Clerk and database fixtures for tests that actually certify tenant isolation, authorization, or persisted financial behavior.

**Why:** The Vite development frontend intentionally bypasses the tenant gate, so a newly created Clerk user does not reach onboarding in the route test and cannot satisfy a tenant fixture’s membership lookup.

**How to apply:** For navigation and rendering tests, assert the visible route behavior directly at the configured browser origin. Add an authenticated fixture only when the behavior under test depends on the household identity or server-persisted state.