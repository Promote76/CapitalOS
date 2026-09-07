import assert from "node:assert/strict";
import test from "node:test";
import { ProviderUnavailableError, XaiIntelligenceProvider } from "../services/family-office-provider.ts";
import { assertShadowOnlyDecision, familyOfficeProviderStatus, safeResearchPrompt } from "./family-office.ts";

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