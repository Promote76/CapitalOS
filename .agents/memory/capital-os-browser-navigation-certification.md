---
name: Browser route certification
description: How to scope Capital OS browser tests for route-only behavior versus tenant-backed behavior.
---

Route-only browser regressions should run against the configured development workflow without creating Clerk users or database tenants. Reserve disposable Clerk and database fixtures for tests that actually certify tenant isolation, authorization, or persisted financial behavior.

**Why:** The Vite development frontend intentionally bypasses the tenant gate, so a newly created Clerk user does not reach onboarding in the route test and cannot satisfy a tenant fixture’s membership lookup.

**How to apply:** For navigation and rendering tests, assert the visible route behavior directly at the configured browser origin. Add an authenticated fixture only when the behavior under test depends on the household identity or server-persisted state.

Authenticated browser certifications running against that development frontend must verify the household through the in-page `/api/auth/me` response rather than treating the visible shell as proof of tenancy. If the frontend bypass hides onboarding, initialize the household through the authenticated onboarding endpoint and accept only the documented already-exists conflict before rereading the membership.

**Why:** A real Clerk session can render the app while the development tenant gate is bypassed, and another authenticated API read can provision the household between the membership check and explicit onboarding.

**How to apply:** Keep the bootstrap and membership assertions in the same Playwright page context, then exercise the user-visible route only after `authStrength`, one active membership, and `activeHouseholdId` agree. Clean up the household before deleting the disposable Clerk identity.