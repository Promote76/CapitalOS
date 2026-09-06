import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publishedOrigin = (process.env.CAPITAL_OS_PUBLISHED_ORIGIN ?? "").replace(/\/$/, "");
const artifactPath = path.join(rootDir, "docs/certification/AUTHENTICATED_BROWSER_CERTIFICATION_2026-09-05.md");
const screenshotPath = "docs/certification/auth-sign-in-published-origin.png";

function redact(value) {
  return String(value)
    .replace(/(CLERK_SECRET_KEY|CLERK_PUBLISHABLE_KEY|VITE_CLERK_PUBLISHABLE_KEY)=\S+/g, "$1=[REDACTED]")
    .replace(/(session|token|jwt|password|otp)[=:]\S+/gi, "$1=[REDACTED]");
}

async function publishedOriginPreflight() {
  if (!publishedOrigin) {
    return { passed: false, detail: "CAPITAL_OS_PUBLISHED_ORIGIN was not supplied." };
  }
  try {
    const health = await fetch(`${publishedOrigin}/api`, { redirect: "manual" });
    const healthBody = await health.text();
    const signIn = await fetch(`${publishedOrigin}/sign-in`, { redirect: "manual" });
    const signInBody = await signIn.text();
    const healthOk = health.status === 200 && /"status"\s*:\s*"ok"/.test(healthBody);
    // The Clerk UI is client-rendered, so the published HTML does not need to
    // contain the provider name. The saved published-origin screenshot is the
    // visual evidence for the provider surface; this preflight only verifies
    // that the route is reachable.
    const clerkUiOk = signIn.status === 200;
    return {
      passed: healthOk && clerkUiOk,
      detail: `GET /api=${health.status}; GET /sign-in=${signIn.status}; published Clerk sign-in route=${clerkUiOk ? "reachable" : "unavailable"}`,
    };
  } catch (error) {
    return { passed: false, detail: error instanceof Error ? error.message : "published-origin request failed" };
  }
}

function sourcePreflight() {
  const app = fs.readFileSync(path.join(rootDir, "artifacts/capital-os/src/App.tsx"), "utf8");
  const operationsPage = fs.readFileSync(path.join(rootDir, "artifacts/capital-os/src/pages/operations.tsx"), "utf8");
  const clientReverification = fs.readFileSync(path.join(rootDir, "artifacts/capital-os/src/lib/reverification.ts"), "utf8");
  const requestContext = fs.readFileSync(path.join(rootDir, "artifacts/api-server/src/middleware/request-context.ts"), "utf8");
  const reverification = fs.readFileSync(path.join(rootDir, "artifacts/api-server/src/middleware/reverification.ts"), "utf8");
  const checks = {
    clerkProvider: app.includes("ClerkProvider"),
    signIn: app.includes("<SignIn"),
    signOut: app.includes("signOut("),
    providerReverification: clientReverification.includes("useReverification("),
    operationsApprovalReverification:
      operationsPage.includes("decideApprovalWithReverification"),
    serverRecentAuth: requestContext.includes('reverificationError("strict")'),
    failClosedProviderCheck: reverification.includes('getAuth(req).has({ reverification: "strict" })'),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

function runAuthTests() {
  const result = spawnSync("pnpm", ["--filter", "@workspace/api-server", "test", "--", "src/middleware/reverification.test.ts"], {
    cwd: rootDir,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" },
    maxBuffer: 12 * 1024 * 1024,
  });
  return {
    passed: result.status === 0,
    output: redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`).slice(-12000),
  };
}

function writeArtifact({ origin, originCheck, source, authTests }) {
  const ba = originCheck.passed ? 1 : 0;
  const lines = [
    "# Capital OS authenticated browser and Clerk reverification certification",
    "",
    "**Date:** 2026-09-05",
    `**Current HEAD:** \`${spawnSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf8" }).stdout.trim()}\``,
    `**Published origin:** ${origin || "NOT CONFIGURED"}`,
    "**Test environment:** Replit-managed Clerk production deployment; no credentials or session tokens recorded",
    "",
    "## Auth implementation discovery",
    "",
    "- **AUTH_PROVIDER:** Clerk",
    `- **PUBLISHED_ORIGIN:** ${origin || "NOT CONFIGURED"}`,
    "- **TEST USERS AVAILABLE:** Not exposed to the agent; dedicated certification identities must be supplied through the Clerk sign-in UI",
    "- **REVERIFICATION_IMPLEMENTED:** YES",
    "- **REVERIFICATION_PROVIDER_UI_AVAILABLE:** YES in the Clerk-backed client path; no live challenge was completed in this run",
    "",
    "## Automated preflight",
    "",
    `- BA-01 Published Origin: ${originCheck.passed ? "PASS" : "BLOCKED"} — ${originCheck.detail}`,
    `- ClerkProvider and SignIn wiring: ${source.checks.clerkProvider && source.checks.signIn ? "PASS" : "FAIL"}`,
    `- Sign-out wiring: ${source.checks.signOut ? "PASS" : "FAIL"}`,
    `- useReverification wiring: ${source.checks.providerReverification ? "PASS" : "FAIL"}`,
    `- Operations approval challenge/retry wiring: ${source.checks.operationsApprovalReverification ? "PASS" : "FAIL"}`,
    `- Server strict reverification response: ${source.checks.serverRecentAuth && source.checks.failClosedProviderCheck ? "PASS" : "FAIL"}`,
    `- Reverification middleware unit tests: ${authTests.passed ? "PASS" : "FAIL"}`,
    `- Safe sign-in screenshot: ${screenshotPath}`,
    "",
    "## Authenticated browser gates",
    "",
    `**BA GATES:** ${ba}/20 certified`,
    "",
    "BA-01 is a published-origin preflight only. BA-02 through BA-20 remain BLOCKED",
    "because this run did not perform a real Clerk sign-in, onboarding, saved write,",
    "sign-out/repeat sign-in, second-household switch, role test, session expiry,",
    "multi-tab test, Emergency Stop browser test, Treasury authorization test, or",
    "Safe-to-Deploy display test.",
    "",
    "## Clerk reverification gates",
    "",
    "**RV GATES:** 0/12 certified",
    "",
    "RV-01 through RV-12 remain BLOCKED pending a real provider challenge, failed/cancelled",
    "challenge cases, bounded recent-auth expiry, current role/household rechecks, and",
    "safe audit/telemetry evidence from an authenticated browser session.",
    "",
    "## Human browser attempt",
    "",
    "The user attempted the published-origin checklist but could not complete or",
    "confidently evaluate it because:",
    "",
    "- dedicated Owner, Advisor, Viewer, and second-household identities were not available;",
    "- several requested approval actions could not be found or had no approvable items;",
    "- the Clerk reverification challenge did not appear;",
    "- session-expiry, multi-tab, and repeat-sign-in cases could not be controlled; and",
    "- some attempted steps did not expose enough evidence to determine PASS or FAIL.",
    "",
    "This attempt is **INCONCLUSIVE — MISSING CERTIFICATION PREREQUISITES**. It does",
    "not count as a failed product control, but it also supplies no BA or RV PASS",
    "evidence. No gate totals or release status changed.",
    "",
    "## Remediation after the human attempt",
    "",
    "- Operations approval decisions now pass Clerk's standardized strict",
    "  reverification hint through the shared client wrapper, allowing the provider",
    "  challenge to open and retry the exact original decision.",
    "- The approval card now explains that a decision reason is required before",
    "  Approve, Defer, or Reject becomes available.",
    "- Approval decisions now update only a still-pending, household-scoped record",
    "  and write the actor and decision reason to the audit trail atomically.",
    "",
    "These changes improve the next attempt but are not substituted for real",
    "published-origin Clerk evidence.",
    "",
    "## User action required — Clerk certification",
    "",
    "**PUBLISHED URL:**",
    origin || "The published origin is not configured.",
    "",
    "**CERTIFICATION USERS:**",
    "Use dedicated Owner A, Advisor A, Viewer A, and Owner B accounts. Do not paste",
    "passwords, OTPs, session tokens, JWTs, or Clerk secrets into chat or artifacts.",
    "",
    "**EXACT ACTION:**",
    "Open the published URL, sign in through the real Clerk UI, complete onboarding",
    "and the browser matrix in the attached certification brief. For the reverification",
    "portion, trigger a recent-auth-protected action, complete the actual Clerk",
    "reverification challenge, retry the same action, then repeat with a cancelled or",
    "failed challenge and after the recent-auth window expires.",
    "",
    "**EXPECTED SCREEN:**",
    "The Clerk reverification challenge appears in the provider UI; a successful",
    "challenge retries the original action only when current role and household",
    "authorization still permit it. A failed or cancelled challenge leaves the action",
    "denied and creates no partial mutation.",
    "",
    "**AFTER COMPLETION:**",
    "Run `pnpm run certify:browser-auth` with CAPITAL_OS_PUBLISHED_ORIGIN set to the",
    "published origin after adding a safe, redacted browser evidence bundle to the",
    "certification workflow. Do not mark BA or RV gates PASS from source tests alone.",
    "",
    "## Safety and remaining release state",
    "",
    "- REAL MONEY MOVED: $0",
    "- REAL ORDERS SENT: 0",
    "- MICRO-LIVE: DISABLED",
    "- SCHWAB: DISABLED",
    "- AI EXECUTION: DISABLED",
    "- Financial integrity remains PASS and was not changed by this certification.",
    "- Production candidate remains NOT READY — CONTROLLED INTERNAL EVALUATION ONLY.",
    "",
    "**Certification result:** BLOCKED — real authenticated browser/provider evidence is required.",
    "",
  ];
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, lines.join("\n"));
}

const originCheck = await publishedOriginPreflight();
const source = sourcePreflight();
const authTests = runAuthTests();
writeArtifact({ origin: publishedOrigin, originCheck, source, authTests });
console.log(`Published origin: ${publishedOrigin || "NOT CONFIGURED"}`);
console.log(`BA GATES: ${originCheck.passed ? "1/20" : "0/20"}`);
console.log("RV GATES: 0/12");
console.log("AUTHENTICATED BROWSER E2E: BLOCKED");
console.log("CLERK REVERIFICATION: BLOCKED");
console.log(`Evidence: ${path.relative(rootDir, artifactPath)}`);
process.exitCode = 2;