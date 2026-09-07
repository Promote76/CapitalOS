import assert from "node:assert/strict";
import test from "node:test";
import { ProviderUnavailableError, XaiIntelligenceProvider } from "../services/family-office-provider.ts";
import {
  assertShadowOnlyDecision,
  familyOfficeProviderStatus,
  reviewTaxLienCandidate,
  safeResearchPrompt,
  sourcePriorityFor,
} from "./family-office.ts";

test("Family Office provider is disabled unless both feature flags and a key are present", () => {
  assert.equal(familyOfficeProviderStatus({}).state, "disabled");
  assert.equal(familyOfficeProviderStatus({
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
  }).enabled, false);
  assert.equal(familyOfficeProviderStatus({
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
    XAI_API_KEY: "server-only",
  }).state, "ready");
});

test("disabled provider fails closed without making a network request", async () => {
  let called = false;
  const provider = new XaiIntelligenceProvider({}, async () => {
    called = true;
    return new Response("{}");
  });
  await assert.rejects(
    provider.research({ analyst: "CIO", scope: "research", prompt: "test" }),
    (error: unknown) => error instanceof ProviderUnavailableError && error.code === "AI_PROVIDER_UNAVAILABLE",
  );
  assert.equal(called, false);
});

test("provider rejects malformed output and sanitizes control characters in prompts", async () => {
  let requestBody = "";
  const provider = new XaiIntelligenceProvider({
    GROK_INTELLIGENCE_ENABLED: "true",
    XAI_ENABLED: "true",
    XAI_API_KEY: "server-only",
  }, async (_input, init) => {
    requestBody = String(init?.body ?? "");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ title: "missing required fields" }) } }],
    }), { status: 200 });
  });
  await assert.rejects(provider.research({
    analyst: "CIO\u0000 analyst",
    scope: "market\u0007 scope",
    prompt: "question\u001b[31m",
  }), ProviderUnavailableError);
  assert.equal(requestBody.includes("\u0000"), false);
  assert.equal(requestBody.includes("\u0007"), false);
  assert.equal(requestBody.includes("\u001b"), false);
});

test("Shadow decisions have no execution decision and unsupported decisions fail", () => {
  assert.equal(assertShadowOnlyDecision("approve_shadow"), "shadow_approved");
  assert.equal(assertShadowOnlyDecision("watch"), "watching");
  assert.throws(() => assertShadowOnlyDecision("submit_order"));
  assert.equal(safeResearchPrompt("  hello\nworld  "), "hello world");
});

test("Florida source hierarchy gives official county records priority over informal sources", () => {
  assert.equal(sourcePriorityFor("county_tax_collector"), 1);
  assert.equal(sourcePriorityFor("property_appraiser"), 2);
  assert.equal(sourcePriorityFor("informal"), 9);
  assert.equal(sourcePriorityFor(undefined), 10);
});

test("tax-lien review rejects unknown availability, reconciliation gaps, and reserve violations", () => {
  const result = reviewTaxLienCandidate({
    currentPurchaseAmountCents: 31_000,
    conservativeValueCents: 2_000_000,
    totalLienExposureCents: 31_000,
    sourcePriority: 1,
    dataFreshness: "fresh",
    liveAvailability: "unverified",
    parcelReconciliation: "partial",
    certificateReconciliation: "partial",
    stackRisk: "low",
    redemptionAssessment: "high",
    access: "verified",
    buildability: "buildable",
    homesteadStatus: "clear",
    flood: "clear",
    wetland: "clear",
    codeStatus: "clear",
    titleRisk: "clear",
    bankruptcyOrLitigation: "clear",
    opportunityReserveAfterCents: 50_000,
    strategicReserveAfterCents: 90_000,
  });
  assert.equal(result.decision, "REJECT");
  assert.equal(result.capitalGovernor.passes, false);
  assert.ok(result.hardStops.some((stop) => stop.includes("live availability")));
  assert.ok(result.hardStops.some((stop) => stop.includes("Parcel")));
  assert.ok(result.hardStops.some((stop) => stop.includes("Certificate")));
  assert.ok(result.hardStops.some((stop) => stop.includes("reserve")));
  assert.equal(result.purchaseAuthority, false);
});

test("tax-lien review keeps a fully verified certificate advisory and human-reviewed", () => {
  const result = reviewTaxLienCandidate({
    currentPurchaseAmountCents: 23_552,
    conservativeValueCents: 2_909_700,
    totalLienExposureCents: 23_552,
    sourcePriority: 1,
    dataFreshness: "fresh",
    liveAvailability: "verified_available",
    parcelReconciliation: "matched",
    certificateReconciliation: "matched",
    stackRisk: "low",
    redemptionAssessment: "high",
    access: "verified",
    buildability: "buildable",
    homesteadStatus: "clear",
    flood: "clear",
    wetland: "clear",
    codeStatus: "clear",
    titleRisk: "clear",
    bankruptcyOrLitigation: "clear",
    opportunityReserveAfterCents: 50_000,
    strategicReserveAfterCents: 100_000,
  });
  assert.equal(result.decision, "WATCH");
  assert.equal(result.redemptionUncertainty, false);
  assert.equal(result.capitalGovernor.passes, true);
  assert.equal(result.advisoryOnly, true);
  assert.equal(result.purchaseAuthority, false);
});

test("historical certificates remain review candidates until live records reconcile", () => {
  const result = reviewTaxLienCandidate({
    currentPurchaseAmountCents: 23_552,
    conservativeValueCents: 2_909_700,
    totalLienExposureCents: 23_552,
    sourcePriority: 1,
    dataFreshness: "stale",
    liveAvailability: "unverified",
    parcelReconciliation: "partial",
    certificateReconciliation: "partial",
    stackRisk: "low",
    redemptionAssessment: "unknown",
    access: "unknown",
    buildability: "unknown",
    homesteadStatus: "unknown",
    flood: "unknown",
    wetland: "unknown",
    codeStatus: "unknown",
    titleRisk: "unknown",
    bankruptcyOrLitigation: "clear",
    opportunityReserveAfterCents: 50_000,
    strategicReserveAfterCents: 100_000,
  });
  assert.equal(result.decision, "REVIEW_REQUIRED");
  assert.ok(result.hardStops.length > 0);
  assert.equal(result.purchaseAuthority, false);
});