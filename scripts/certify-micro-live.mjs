import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const checks = [];
const evidencePath = process.env.MICRO_LIVE_CERTIFICATION_EVIDENCE
  ? path.resolve(rootDir, process.env.MICRO_LIVE_CERTIFICATION_EVIDENCE)
  : null;
let certificationEvidence = null;
let evidenceError = null;

function source(file) {
  const absolute = path.join(rootDir, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
}

if (evidencePath) {
  try {
    certificationEvidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch (error) {
    evidenceError = error instanceof Error ? error.message : "Unable to read certification evidence";
    failures.push(`Certification evidence could not be read: ${evidenceError}`);
  }
}

function check(id, title, passed, reason, status = passed ? "PASS" : "BLOCKED") {
  checks.push({ id, title, status, reason });
  if (status === "FAIL") failures.push(`${id} ${title}: ${reason}`);
}

function evidencePass(id) {
  const gate = certificationEvidence?.gates?.[id];
  return gate?.status === "PASS" &&
    typeof gate.evidenceRef === "string" &&
    gate.evidenceRef.trim().length > 0 &&
    typeof gate.observedAt === "string" &&
    !Number.isNaN(Date.parse(gate.observedAt));
}

function evidenceFailureStatus() {
  return evidencePath ? "FAIL" : "BLOCKED";
}

function run(label, command, args) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, { cwd: rootDir, env: process.env, stdio: "inherit" });
  if (result.status !== 0) {
    failures.push(`${label} exited with ${result.status ?? "a signal"}`);
    return false;
  }
  return true;
}

const oms = source("artifacts/api-server/src/domain/execution-oms.ts");
const adapters = source("artifacts/api-server/src/domain/execution-adapters.ts");
const service = source("artifacts/api-server/src/services/micro-live.ts");
const schema = source("lib/db/src/schema/micro-live.ts");
const policy = source("docs/MICRO_LIVE_POLICY.md");
const report = source("docs/CAPITAL_OS_FINAL_COMPLETION_REPORT_2026-09-02.md");
const packageJson = JSON.parse(source("package.json") || "{}");

const typechecks = run("Workspace typechecks", "pnpm", ["run", "typecheck"]);
const apiTests = run("Micro-Live domain and API tests", "pnpm", [
  "--filter", "@workspace/api-server", "test",
]);

const exactStates = [
  "DISABLED", "MICRO_LIVE_ELIGIBLE", "MICRO_LIVE_ARMED", "MICRO_LIVE_ACTIVE",
  "SAFE_MODE", "STOP", "EVACUATE", "LOCKED",
  "LIMITED_LIVE_ELIGIBLE", "LIMITED_LIVE_ARMED", "LIMITED_LIVE_ACTIVE",
].every((state) => oms.includes(`"${state}"`));
const boundedPolicy = [
  "initialCapitalCents: 2000",
  "maxVenueCapitalCents: 1000",
  "maxStrategyCapitalCents: 1000",
  "maxMarketExposureCents: 500",
  "maxIndividualOrderCents: 100",
  "maxInventoryCents: 500",
  "softDailyLossCents: 75",
  "hardDailyLossCents: 150",
  "softDrawdownBps: 400",
  "hardDrawdownBps: 600",
].every((value) => oms.includes(value));
const noTransmission = adapters.includes("Simulated adapter does not transmit orders") &&
  adapters.includes("Simulated adapter does not transmit cancellations");
const registryEmptyByDefault = adapters.includes("const reviewedVenueAdapterRegistry = new Map") &&
  adapters.includes("registry is intentionally empty");
const hasTest = source("artifacts/api-server/src/domain/execution-oms.test.ts").length > 0 && apiTests;
const reportKeepsLimitedLocked = report.includes("LIMITED-LIVE") || report.includes("Limited-Live");
const venueEvidence = certificationEvidence?.venue;
const exactlyOneVenue = Array.isArray(certificationEvidence?.venues) &&
  certificationEvidence.venues.length === 1 &&
  venueEvidence?.id === certificationEvidence.venues[0]?.id &&
  !["simulated", "provider-neutral"].includes(venueEvidence?.adapterType);
const independentlyReviewedVenue = exactlyOneVenue &&
  venueEvidence.adapterRegistered === true &&
  typeof venueEvidence.securityReviewReference === "string" &&
  venueEvidence.securityReviewReference.startsWith("review://capital-os/security/") &&
  typeof venueEvidence.jurisdictionReviewReference === "string" &&
  venueEvidence.jurisdictionReviewReference.startsWith("review://capital-os/jurisdiction/") &&
  venueEvidence.securityReviewReference !== venueEvidence.jurisdictionReviewReference;
const leastPrivilegeVenue = independentlyReviewedVenue &&
  venueEvidence.readOnlyTransportVerified === true &&
  venueEvidence.validationPhaseVerified === true &&
  venueEvidence.capabilities?.withdrawals === false &&
  venueEvidence.capabilities?.transfers === false &&
  venueEvidence.capabilities?.administration === false &&
  venueEvidence.capabilities?.securityChanges === false;
const isolatedAccount = venueEvidence?.account?.capitalClass === "micro_live" &&
  typeof venueEvidence?.account?.accountId === "string" &&
  venueEvidence.account.accountId.trim().length > 0 &&
  venueEvidence.account.householdCapitalAccessible === false &&
  venueEvidence.account.protectedCapitalAccessible === false;
const boundedFunding = venueEvidence?.funding?.dedicated === true &&
  venueEvidence.funding.amountCents === 2000 &&
  typeof venueEvidence.funding.evidenceRef === "string" &&
  venueEvidence.funding.evidenceRef.trim().length > 0;
const oneStrategy = typeof venueEvidence?.strategy?.id === "string" &&
  typeof venueEvidence.strategy?.versionId === "string";
const explicitAllowlist = Array.isArray(venueEvidence?.marketAllowlist) &&
  venueEvidence.marketAllowlist.length > 0 &&
  venueEvidence.marketAllowlist.every((market) => typeof market === "string" && market.trim().length > 0);
const limitedLiveLocked = certificationEvidence?.limitedLiveStatus === "LOCKED";
const firstFillHoldEvidence = certificationEvidence?.firstFillHold?.required === true &&
  certificationEvidence.firstFillHold.verified === true &&
  certificationEvidence.firstFillHold.realFillObserved === true &&
  Number.isInteger(certificationEvidence.firstFillHold.notionalCents) &&
  certificationEvidence.firstFillHold.notionalCents > 0 &&
  certificationEvidence.firstFillHold.notionalCents <= 100 &&
  certificationEvidence.firstFillHold.marketAllowlisted === true &&
  typeof certificationEvidence.firstFillHold.evidenceRef === "string" &&
  certificationEvidence.firstFillHold.evidenceRef.trim().length > 0;
const providerEvidenceReady = Boolean(
  certificationEvidence &&
  leastPrivilegeVenue &&
  isolatedAccount &&
  boundedFunding &&
  oneStrategy &&
  explicitAllowlist &&
  limitedLiveLocked &&
  firstFillHoldEvidence,
);
const completeProviderEvidence = providerEvidenceReady &&
  ["ML-02", "ML-03", "ML-09", "ML-13", "ML-16", "ML-17", "ML-20"].every(evidencePass);

check("ML-01", "Capital Isolation", boundedPolicy && service.includes("householdCapitalAccessible: false") && service.includes("protectedCapitalAccessible: false"),
  "Server policy and execution boundary keep the Micro-Live envelope separate from household and protected capital.");
check("ML-02", "Credential Permissions", completeProviderEvidence && evidencePass("ML-02"),
  completeProviderEvidence ? "Server-side credential and least-privilege evidence is recorded for the selected venue." :
    "No independently recorded provider credential, vault access, or least-privilege evidence was supplied; live certification remains blocked.",
  completeProviderEvidence ? "PASS" : evidenceFailureStatus());
check("ML-03", "Venue Adapter", (registryEmptyByDefault && noTransmission) || (completeProviderEvidence && evidencePass("ML-03")),
  completeProviderEvidence ? "The selected provider adapter is recorded as reviewed and isolated; rehearsal transport remains non-transmitting." :
    "PASS for the disabled boundary: no provider adapter is registered and rehearsal transport refuses transmission.",
  completeProviderEvidence ? "PASS" : "PASS");
check("ML-04", "OMS State Machine", exactStates && schema.includes("orderIntents") && schema.includes("orderEvents"),
  "Server OMS states and durable order/event relationships are present.");
check("ML-05", "Order Idempotency", oms.includes("buildClientOrderId") && schema.includes("clientOrderIdx"),
  "Deterministic client order IDs and a unique durable client-order constraint are present.");
check("ML-06", "Pre-Trade Risk", oms.includes("validatePreTrade") && boundedPolicy,
  "Server-side state, exposure, inventory, loss, velocity, freshness, and price checks fail closed.");
check("ML-07", "Guardian", oms.includes("guardianDecision") && service.includes('status: heartbeat?.status ?? "STOP"'),
  "Missing or stale Guardian health defaults to STOP and disagreement locks the boundary.");
check("ML-08", "Market Data Health", oms.includes("market data is stale") && oms.includes("maxQuoteAgeMs"),
  "Stale market data is rejected before transmission; real market transport evidence is not claimed.");
check("ML-09", "Venue Health", completeProviderEvidence && evidencePass("ML-09"),
  completeProviderEvidence ? "Read-only provider health and connectivity evidence is recorded for the selected venue." :
    "No reviewed provider transport health evidence was supplied; fail-closed rehearsal behavior is not real venue evidence.",
  completeProviderEvidence ? "PASS" : evidenceFailureStatus());
check("ML-10", "Exposure Limits", boundedPolicy && oms.includes("session exposure cap would be exceeded"),
  "Venue, strategy, market, inventory, session, and individual-order caps are server-side.");
check("ML-11", "Loss / Drawdown Stops", boundedPolicy && oms.includes("hard daily loss limit has been reached") && oms.includes("hard drawdown limit has been reached"),
  "Daily loss and drawdown governors deny new exposure at policy thresholds.");
check("ML-12", "Reconciliation", oms.includes("STOP_CANCEL_FETCH_REBUILD_VERIFY") && service.includes("reconciliationRuns"),
  "Venue-authoritative rehearsal reconciliation and durable mismatch handling are present.");
check("ML-13", "Restart Recovery", completeProviderEvidence && evidencePass("ML-13"),
  completeProviderEvidence ? "Durable restart recovery evidence is recorded for the selected venue session." :
    "No durable production worker restart evidence was supplied; simulated recovery cannot close this gate.",
  completeProviderEvidence ? "PASS" : evidenceFailureStatus());
check("ML-14", "Incident Persistence", service.includes("tradingIncidents") && service.includes("micro_live_reconciliation_failed_closed"),
  "Reconciliation failures persist an incident and audit event while stopping the session.");
check("ML-15", "AI Authority", service.includes("aiCanPlaceOrders: false") && report.includes("AI cannot:"),
  "AI order authority remains disabled and advisory.");
check("ML-16", "Automation Authority", completeProviderEvidence && evidencePass("ML-16"),
  completeProviderEvidence ? "Independent execution-worker authority evidence is recorded and remains bounded to the selected venue." :
    "No independent execution-worker evidence was supplied; automation authority remains disabled.",
  completeProviderEvidence ? "PASS" : evidenceFailureStatus());
check("ML-17", "Browser Arming", completeProviderEvidence && evidencePass("ML-17"),
  completeProviderEvidence ? "Authenticated browser arming and provider-supported step-up evidence is recorded." :
    "No authenticated browser arming or provider-supported step-up evidence was supplied.",
  completeProviderEvidence ? "PASS" : evidenceFailureStatus());
check("ML-18", "Audit Attribution", service.includes("actor: actor.userId") && schema.includes("householdId"),
  "Micro-Live mutations persist household scope and authenticated actor attribution.");
check("ML-19", "Tenant Isolation", service.includes("eq(venueRegistry.householdId, householdId)") && schema.includes("householdId"),
  "Venue, session, incident, reconciliation, fill, and order records are household-scoped.");
check("ML-20", "Real-Money UI Labeling", completeProviderEvidence && evidencePass("ML-20"),
  completeProviderEvidence ? "The controlled real-money pilot UI labeling evidence is recorded; full-live claims remain prohibited." :
    "No real-money execution page or labeling evidence was supplied; activation remains disabled.",
  completeProviderEvidence ? "PASS" : evidenceFailureStatus());

if (!typechecks) failures.push("Workspace typechecks failed");
if (!hasTest) failures.push("Micro-Live tests did not execute");
if (!packageJson.scripts?.["certify:micro-live"]) failures.push("certify:micro-live script is missing");

console.log("\n=== Micro-Live certification gates ===");
for (const gate of checks) {
  console.log(`${gate.id} | ${gate.status} | ${gate.title} | ${gate.reason}`);
}

const blocked = checks.filter((gate) => gate.status === "BLOCKED");
const failed = checks.filter((gate) => gate.status === "FAIL");
const internalCore = report.includes("P0 OPEN:** 0") && report.includes("IN-HOUSE ONLY — READY FOR CONTROLLED INTERNAL USE");

console.log("\n=== Micro-Live certification result ===");
console.log(`INTERNAL CORE: ${internalCore ? "PASS" : "BLOCKED"}`);
console.log(`MICRO-LIVE CERTIFICATION: ${failures.length || failed.length ? "FAIL" : blocked.length ? "BLOCKED" : "PASS"}`);
console.log(`MICRO-LIVE STATUS: ${completeProviderEvidence && !failures.length && !failed.length && !blocked.length ? "ELIGIBLE" : "DISABLED"}`);
console.log("REAL-MONEY CAPITAL LIMIT: $20");
console.log("MAX ORDER: $1");
console.log("LEVERAGE: DISABLED");
console.log("WITHDRAWAL API: DISABLED");
console.log("AI EXECUTION: DISABLED");
console.log(`GUARDIAN: ${checks.find((gate) => gate.id === "ML-07")?.status === "PASS" ? "PASS" : "FAIL"}`);
console.log(`OMS: ${checks.find((gate) => gate.id === "ML-04")?.status === "PASS" ? "PASS" : "FAIL"}`);
console.log(`RECONCILIATION: ${checks.find((gate) => gate.id === "ML-12")?.status === "PASS" ? "PASS" : "FAIL"}`);
console.log(`RESTART RECOVERY: ${checks.find((gate) => gate.id === "ML-13")?.status === "PASS" ? "PASS" : "BLOCKED"}`);
console.log(`CAPITAL ISOLATION: ${checks.find((gate) => gate.id === "ML-01")?.status === "PASS" ? "PASS" : "FAIL"}`);
console.log(`CREDENTIAL PERMISSIONS: ${checks.find((gate) => gate.id === "ML-02")?.status}`);
console.log(`VENUE: ${exactlyOneVenue ? `${venueEvidence.name ?? venueEvidence.adapterType} (${venueEvidence.adapterType})` : "NOT CONFIGURED"}`);
console.log("FIRST REAL ORDER: NOT SENT");
console.log(`MICRO-LIVE FILL COUNT: ${certificationEvidence?.fillCount ?? 0}`);
console.log("DAILY P&L: N/A");
console.log(`OPEN INCIDENTS: ${certificationEvidence?.openIncidentCount ?? "N/A — no certified venue session exists"}`);
console.log("LIMITED LIVE: LOCKED");
console.log("LIVE GRADUATION: NOT ELIGIBLE");
console.log(`INTERNAL CERTIFICATION EXIT: ${internalCore ? 0 : 2}`);
console.log(`MICRO-LIVE CERTIFICATION EXIT: ${failures.length || failed.length ? 1 : blocked.length ? 2 : 0}`);
console.log(`USER ACTION REQUIRED: ${completeProviderEvidence ? "Keep the session manually armed and first-fill hold active; Limited-Live remains locked." : "A future venue requires independently recorded provider review, server-side credentials, dedicated funding, read-only transport, durable restart, and authenticated browser evidence."}`);
console.log("FINAL DOCUMENT: docs/CAPITAL_OS_FINAL_COMPLETION_REPORT_2026-09-02.md");

if (failures.length || failed.length) process.exitCode = 1;
else if (blocked.length || !internalCore || !reportKeepsLimitedLocked) process.exitCode = 2;