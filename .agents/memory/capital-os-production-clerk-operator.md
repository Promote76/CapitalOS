---
name: Production Clerk operator access
description: Production-only remediation needs a real operator session from the Clerk instance that owns the target household.
---

Production database identities may belong to a different Clerk instance than the workspace browser-test account. A local Clerk secret, disposable test user, or fabricated session cannot authorize mutations against the target household.

**Why:** Financial-document remediation is intentionally household-scoped and requires a real Clerk session; bypassing that boundary could attach evidence to the wrong household or create an unauthorized audit trail.

**How to apply:** Before running a published-origin remediation, confirm the operator identity resolves to the target household through `/api/auth/me`. If it does not, stop and obtain an approved production operator session rather than using direct SQL or test headers.

Published-origin browser certification must authenticate through the Clerk UI. The workspace-managed secret can target the development Clerk instance while the published app uses a separate production instance; a development sign-in ticket is not valid on the published origin, and MFA must remain fail-closed.

**Why:** Reusing a development backend credential or bypassing the production factor can create evidence for the wrong identity or household.

**How to apply:** Use the browser-backed remediation certification with secure operator credentials, verify `/api/auth/me`, and treat `PRODUCTION_CLERK_MFA_REQUIRED` as a blocked release gate rather than requesting a code or session cookie.