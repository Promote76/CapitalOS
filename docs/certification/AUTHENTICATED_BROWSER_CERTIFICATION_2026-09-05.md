# Capital OS authenticated browser and Clerk reverification certification

**Date:** 2026-09-05
**Current HEAD:** `4a95752a681d1d2bb7c27262671e1e07575e470a`
**Published origin:** https://capital-os-fund.replit.app
**Test environment:** Replit-managed Clerk production deployment; no credentials or session tokens recorded

## Auth implementation discovery

- **AUTH_PROVIDER:** Clerk
- **PUBLISHED_ORIGIN:** https://capital-os-fund.replit.app
- **TEST USERS AVAILABLE:** Not exposed to the agent; dedicated certification identities must be supplied through the Clerk sign-in UI
- **REVERIFICATION_IMPLEMENTED:** YES
- **REVERIFICATION_PROVIDER_UI_AVAILABLE:** YES in the Clerk-backed client path; redacted production challenge evidence is retained

## Automated preflight

- BA-01 Published Origin: PASS — GET /api=200; GET /sign-in=200; published Clerk sign-in route=reachable
- ClerkProvider and SignIn wiring: PASS
- Sign-out wiring: PASS
- useReverification wiring: PASS
- Operations protected-action challenge/retry wiring: PASS
- Server strict reverification response: PASS
- Reverification middleware unit tests: PASS
- Safe sign-in screenshot: docs/certification/auth-sign-in-published-origin.png

## Authenticated browser gates

**BA GATES:** 1/20 certified

BA-01 is a published-origin preflight only. BA-02 through BA-20 remain BLOCKED
because this run did not perform a real Clerk sign-in, onboarding, saved write,
sign-out/repeat sign-in, second-household switch, role test, session expiry,
multi-tab test, Emergency Stop browser test, Treasury authorization test, or
Safe-to-Deploy display test.

## Clerk reverification gates

**RV GATES:** 2/12 certified

- RV-01 Successful strict provider reverification retries the original action: PASS
  - A protected Operations task mutation returned HTTP 403 before reverification and HTTP 200 after the provider flow.
  - The completed task persisted a server timestamp and an authenticated completer.
  - The matching audit row records the same authenticated actor and the exact pre-completion and completed states.
- RV-02 Cancelled provider reverification creates no partial mutation: PASS
  - The published Clerk prompt was cancelled without retrying the protected task mutation.
  - The selected production task remained OPEN with no completion timestamp or completer.
  - The selected task had no Operations task audit rows after cancellation.

RV-03 through RV-12 remain BLOCKED pending bounded recent-auth expiry, current
role/household rechecks, and the remaining safe browser audit/telemetry evidence.
Redacted evidence: docs/certification/CLERK_REVERIFICATION_PRODUCTION_EVIDENCE_2026-09-05.json

## Human browser attempt

The user attempted the published-origin checklist but could not complete or
confidently evaluate it because:

- dedicated Owner, Advisor, Viewer, and second-household identities were not available;
- several requested approval actions could not be found or had no approvable items;
- the Clerk reverification challenge did not appear;
- session-expiry, multi-tab, and repeat-sign-in cases could not be controlled; and
- some attempted steps did not expose enough evidence to determine PASS or FAIL.

This attempt is **INCONCLUSIVE — MISSING CERTIFICATION PREREQUISITES**. It does
not count as a failed product control, but it also supplies no BA or RV PASS
evidence. No gate totals or release status changed.

## Remediation after the human attempt

- Operations approval decisions now pass Clerk's standardized strict
  reverification hint through the shared client wrapper, allowing the provider
  challenge to open and retry the exact original decision.
- The approval card now explains that a decision reason is required before
  Approve, Defer, or Reject becomes available.
- Approval decisions now update only a still-pending, household-scoped record
  and write the actor and decision reason to the audit trail atomically.

These changes improve the next attempt but are not substituted for real
published-origin Clerk evidence.

## User action required — Clerk certification

**PUBLISHED URL:**
https://capital-os-fund.replit.app

**CERTIFICATION USERS:**
Use dedicated Owner A, Advisor A, Viewer A, and Owner B accounts. Do not paste
passwords, OTPs, session tokens, JWTs, or Clerk secrets into chat or artifacts.

**EXACT ACTION:**
Open the published URL, sign in through the real Clerk UI, complete onboarding
and the browser matrix in the attached certification brief. For the reverification
portion, trigger a recent-auth-protected action, complete the actual Clerk
reverification challenge, retry the same action, then repeat with a cancelled or
failed challenge and after the recent-auth window expires.

**EXPECTED SCREEN:**
The Clerk reverification challenge appears in the provider UI; a successful
challenge retries the original action only when current role and household
authorization still permit it. A failed or cancelled challenge leaves the action
denied and creates no partial mutation.

**AFTER COMPLETION:**
Run `pnpm run certify:browser-auth` with CAPITAL_OS_PUBLISHED_ORIGIN set to the
published origin after adding a safe, redacted browser evidence bundle to the
certification workflow. Do not mark BA or RV gates PASS from source tests alone.

## Safety and remaining release state

- REAL MONEY MOVED: $0
- REAL ORDERS SENT: 0
- MICRO-LIVE: DISABLED
- SCHWAB: DISABLED
- AI EXECUTION: DISABLED
- Financial integrity remains PASS and was not changed by this certification.
- Production candidate remains NOT READY — CONTROLLED INTERNAL EVALUATION ONLY.

**Certification result:** BLOCKED — real authenticated browser/provider evidence is required.
