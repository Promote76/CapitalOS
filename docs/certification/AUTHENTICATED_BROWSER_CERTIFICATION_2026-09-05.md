# Capital OS authenticated browser and Clerk reverification certification

**Date:** 2026-09-05 (reconciled 2026-09-06)
**Current HEAD:** `cb10e32673536da9b5c488fdfad1bc05b5771ab3`
**Published origin:** NOT CONFIGURED
**Test environment:** Replit-managed Clerk production deployment; no credentials or session tokens recorded

## Auth implementation discovery

- **AUTH_PROVIDER:** Clerk
- **PUBLISHED_ORIGIN:** NOT CONFIGURED
- **TEST USERS AVAILABLE:** Not exposed to the agent; dedicated certification identities must be supplied through the Clerk sign-in UI
- **REVERIFICATION_IMPLEMENTED:** YES
- **REVERIFICATION_PROVIDER_UI_AVAILABLE:** YES in the Clerk-backed client path; no live challenge was completed in this run

## Automated preflight

- BA-01 Published Origin: BLOCKED — CAPITAL_OS_PUBLISHED_ORIGIN was not supplied.
- ClerkProvider and SignIn wiring: PASS
- Sign-out wiring: PASS
- useReverification wiring: PASS
- Operations protected-action challenge/retry wiring: PASS
- Server strict reverification response: PASS
- Reverification middleware unit tests: PASS
- Safe sign-in screenshot: docs/certification/auth-sign-in-published-origin.png

## Authenticated browser gates

**BA GATES:** 0/20 certified

- BA-01 Published Origin: BLOCKED
- BA-02 Real Clerk Authentication: BLOCKED
- BA-03 Owner Clean Sign-In: BLOCKED
- BA-04 Onboarding Persistence: BLOCKED
- BA-05 Saved Write / Reload: BLOCKED
- BA-06 Sign-Out: BLOCKED
- BA-07 Repeat Sign-In: BLOCKED
- BA-08 Second Household: BLOCKED
- BA-09 Direct URL IDOR: BLOCKED
- BA-10 Owner Role: BLOCKED
- BA-11 Advisor Role: BLOCKED
- BA-12 Viewer Role: BLOCKED
- BA-13 Session Revocation: BLOCKED
- BA-14 Current Role Enforcement: BLOCKED
- BA-15 Current Membership Enforcement: BLOCKED
- BA-16 Multi-Tab Safety: BLOCKED
- BA-17 Emergency Stop Browser: BLOCKED
- BA-18 Treasury Authorization: BLOCKED
- BA-19 Safe-to-Deploy Display: BLOCKED
- BA-20 Audit / Telemetry: BLOCKED

BA-01 is a published-origin preflight only. BA-02 through BA-20 remain BLOCKED
because this run did not perform a real Clerk sign-in, onboarding, saved write,
sign-out/repeat sign-in, second-household switch, role test, session expiry,
multi-tab test, Emergency Stop browser test, Treasury authorization test, or
Safe-to-Deploy display test.

## Clerk reverification gates

**RV GATES:** 2/12 retained historical provider evidence; current runnable command remains BLOCKED

- RV-01 Successful provider reverification and protected-action retry: PASS (historical redacted production evidence)
- RV-02 Cancelled reverification creates no mutation or success audit: PASS (historical redacted production evidence)
- RV-03 Provider Challenge UI: BLOCKED
- RV-04 Successful Reverification: BLOCKED
- RV-05 Exact Protected Retry: BLOCKED
- RV-06 Failed Challenge Denial: BLOCKED
- RV-07 Cancelled Challenge Denial: BLOCKED
- RV-08 Bounded Recent-Auth Window: BLOCKED
- RV-09 Recent-Auth Expiry: BLOCKED
- RV-10 Current Role Recheck: BLOCKED
- RV-11 Current Household Recheck: BLOCKED
- RV-12 Audit / Telemetry Safety: BLOCKED

The current command has no published origin and therefore reports BA 0/20 and RV
0/12. RV-01 and RV-02 remain supported only by retained redacted production
evidence (2/12); RV-03 through RV-12 remain BLOCKED. Provider evidence is not
fabricated or inferred from source tests.
Evidence error: Production evidence origin does not match the configured published origin.

## Human browser attempt

An earlier published-origin attempt was inconclusive because:

- dedicated Owner, Advisor, Viewer, and second-household identities were not available;
- several requested approval actions could not be found or had no approvable items;
- session-expiry, multi-tab, and repeat-sign-in cases could not be controlled; and
- some attempted steps did not expose enough evidence to determine PASS or FAIL.


Subsequent production evidence closes RV-01 and RV-02. The production identity
inventory currently contains unknown Owner, unknown Advisor, and unknown Viewer memberships across unknown households.
Advisor and Viewer browser gates cannot be certified until dedicated real Clerk
identities hold those roles through an approved application/admin boundary.

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
The published origin is not configured.

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

## 2026-09-06 contribution-browser reconciliation

An authenticated Owner session succeeded. The canonical `$250` contribution browser
certification is **BLOCKED**, not failed: the visible dialog accepts only an amount
and says the active household rule applies server-side, while no visible UI can
configure or verify the required active 80/10/10 Duplex/Capital OS/Opportunity
sleeve. Budget was visible, its allocation template showed expense categories only,
and Safe-to-Deploy visibly showed `$0`. No contribution was submitted; no real money
moved. Consequently, the post-contribution Safe-to-Deploy browser comparison is
also **BLOCKED**. This does not change the server/database fixture PASS for `$200`
Duplex protection.

- REAL MONEY MOVED: $0
- REAL ORDERS SENT: 0
- MICRO-LIVE: DISABLED
- SCHWAB: DISABLED
- AI EXECUTION: DISABLED
- Financial integrity remains PASS and was not changed by this certification.
- Production candidate remains NOT READY — CONTROLLED INTERNAL EVALUATION ONLY.

**Certification result:** BLOCKED — real authenticated browser/provider evidence is required.
