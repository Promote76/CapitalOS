import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq, sql } from "drizzle-orm";
import {
  auditEvents, capitalRequests, db, familyOfficeEvidence, familyOfficeProposals,
  familyOfficeResearchDigestions, familyOfficeRuns, familyOfficeAnalystScorecards, householdMembers, households,
  ledgerTransactions, orderIntents, shadowOrderIntents, users,
} from "@workspace/db";
import { parseResearchDigestion, type NormalizedResearchDigestion } from "../domain/research-digestion.ts";
import { ProviderUnavailableError } from "../services/family-office-provider.ts";
import { getFamilyOfficeSnapshot, runFamilyOfficeResearch } from "../services/family-office.ts";
import type { ResearchOutput, ResearchAdvisorySections } from "../domain/family-office.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";
const original = `{\n  "ticker":"ACME", "company":"Acme Corp",\n  "sources":[{"id":"a","title":"Source A","url":"https://example.com/a"},{"id":"b","title":"Source B"}],\n  "sourceClaims":[{"sourceId":"a","statement":"Claim A"},{"sourceId":"b","statement":"Claim B"}],\n  "inferences":[{"statement":"Inference I","basisSourceIds":["a"],"confidence":0.4}]\n}`;

async function fixture() {
  const [user] = await db.insert(users).values({ email: `dig-${randomUUID()}@test.local`, displayName: "Digestion Tester", status: "active" }).returning();
  const [other] = await db.insert(users).values({ email: `dig-other-${randomUUID()}@test.local`, displayName: "Other", status: "active" }).returning();
  const [household] = await db.insert(households).values({ name: `Digestion ${randomUUID()}`, timezone: "UTC" }).returning();
  const [otherHousehold] = await db.insert(households).values({ name: `Other ${randomUUID()}`, timezone: "UTC" }).returning();
  await db.insert(householdMembers).values([
    { householdId: household.id, userId: user.id, role: "owner", permissions: ["read", "contribute"], active: true },
    { householdId: otherHousehold.id, userId: other.id, role: "owner", permissions: ["read", "contribute"], active: true },
  ]);
  return {
    actor: { householdId: household.id, userId: user.id, role: "owner" as const, source: "test-database" as const },
    otherActor: { householdId: otherHousehold.id, userId: other.id, role: "owner" as const, source: "test-database" as const },
    household, otherHousehold, user,
  };
}

function digestion(): NormalizedResearchDigestion {
  const parsed = parseResearchDigestion(original);
  assert.equal(parsed.success, true);
  return parsed.data;
}

function output(): ResearchOutput {
  const blank = { content: [], evidenceIds: [], provenance: [] };
  const sections = Object.fromEntries([
    "fundamentals", "valuation", "catalysts", "risks", "downsideCase", "peerContext",
    "portfolioFit", "concentrationLiquidityRisk", "thesisInvalidationConditions", "evidenceQuality",
  ].map((name) => [name, name === "fundamentals"
    ? { content: ["Claim A"], evidenceIds: ["STRUCTURED:a:0"], provenance: ["STRUCTURED_RESEARCH_DIGESTION"] }
    : blank])) as ResearchAdvisorySections;
  return { title: "ACME research", thesis: "Advisory thesis", label: "WATCH", analyticalDirection: "NEUTRAL", confidence: 50, facts: [], assumptions: [], risks: [], sections, evidence: [] };
}

async function count(table: Parameters<typeof db.select>[0] extends never ? never : any, householdId: string) {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.householdId, householdId));
  return row.n;
}

test("digestion DB enforces byte hashes, household/run constraints, immutability, and cascade cleanup", { skip: !enabled }, async () => {
  const f = await fixture();
  const d = digestion();
  const [run] = await db.insert(familyOfficeRuns).values({ householdId: f.household.id, scope: "db constraints", createdBy: f.user.id }).returning();
  const { fingerprint: _fingerprint, ...canonicalValue } = d;
  const canonical = JSON.stringify(canonicalValue);
  await db.insert(familyOfficeResearchDigestions).values({
    householdId: f.household.id, runId: run.id, originalPayload: original,
    originalFingerprint: createHash("sha256").update(original).digest("hex"),
    canonicalPayload: canonical, canonicalFingerprint: d.fingerprint, fingerprint: d.fingerprint,
    ticker: d.ticker, company: d.company, sourceMetadata: d.sources, sourceClaims: d.sourceClaims,
    inferences: d.inferences ?? [], createdBy: f.user.id,
  });
  const [stored] = await db.select().from(familyOfficeResearchDigestions).where(eq(familyOfficeResearchDigestions.runId, run.id));
  assert.equal(stored.originalPayload, original);
  assert.equal(stored.originalFingerprint, createHash("sha256").update(original).digest("hex"));
  assert.equal(stored.canonicalFingerprint, d.fingerprint);
  await assert.rejects(() => db.insert(familyOfficeResearchDigestions).values({ ...stored, id: randomUUID() }));
  await assert.rejects(() => db.insert(familyOfficeResearchDigestions).values({ ...stored, id: randomUUID(), runId: randomUUID(), householdId: f.otherHousehold.id }));
  await assert.rejects(() => db.update(familyOfficeResearchDigestions).set({ ticker: "EVIL" }).where(eq(familyOfficeResearchDigestions.id, stored.id)));
  await assert.rejects(() => db.insert(familyOfficeResearchDigestions).values({ ...stored, id: randomUUID(), runId: randomUUID(), advisoryOnly: false, verifiedFinancialAuthority: true }));
  await db.delete(familyOfficeRuns).where(eq(familyOfficeRuns.id, run.id));
  assert.equal((await db.select().from(familyOfficeResearchDigestions).where(eq(familyOfficeResearchDigestions.id, stored.id))).length, 0);
});

test("service success calls three agents, persists exact provenance, safe household projection, and no execution", { skip: !enabled }, async () => {
  const f = await fixture();
  const d = digestion();
  let calls = 0;
  const before = await Promise.all([count(shadowOrderIntents, f.household.id), count(orderIntents, f.household.id), count(ledgerTransactions, f.household.id), count(capitalRequests, f.household.id)]);
  const result = await runFamilyOfficeResearch(f.actor, { scope: "investment", ticker: "ACME", digestionPayload: original }, {
    structuredResearchDigestion: d,
    provider: { status: { enabled: true, state: "configured", model: "deterministic-test" }, research: async () => { calls++; return output(); } },
  });
  assert.equal(calls, 3);
  assert.equal(result.run.status, "completed");
  assert.equal(result.proposal?.digestionSummary?.fingerprint, d.fingerprint);
  const evidence = await db.select().from(familyOfficeEvidence).where(eq(familyOfficeEvidence.runId, result.run.id));
  const claimRows = evidence.filter((row) => row.sourceKind === "STRUCTURED_RESEARCH_DIGESTION");
  const inferenceRows = evidence.filter((row) => row.sourceKind === "USER_SUPPLIED_INFERENCE");
  assert.equal(claimRows.length, 2);
  assert.equal(inferenceRows.length, 1);
  assert.deepEqual((result.proposal?.advisorySections.fundamentals as { evidenceIds: string[] }).evidenceIds, [claimRows[0].id]);
  const other = await getFamilyOfficeSnapshot(f.otherActor);
  assert.ok(!other.proposals.some((proposal) => proposal.id === result.proposal?.id));
  assert.deepEqual(await Promise.all([count(shadowOrderIntents, f.household.id), count(orderIntents, f.household.id), count(ledgerTransactions, f.household.id), count(capitalRequests, f.household.id)]), before);
});

test("provider failure retains blocked immutable digestion audit without proposal, evidence, or execution", { skip: !enabled }, async () => {
  const f = await fixture();
  const d = digestion();
  const before = await Promise.all([count(shadowOrderIntents, f.household.id), count(orderIntents, f.household.id), count(ledgerTransactions, f.household.id), count(capitalRequests, f.household.id)]);
  const result = await runFamilyOfficeResearch(f.actor, { scope: "investment", ticker: "ACME", digestionPayload: original }, {
    structuredResearchDigestion: d,
    provider: { status: { enabled: false, state: "disabled", model: "disabled-test" }, research: async () => { throw new ProviderUnavailableError("AI_PROVIDER_DISABLED"); } },
  });
  assert.equal(result.run.status, "blocked");
  assert.equal(await count(familyOfficeResearchDigestions, f.household.id), 1);
  assert.equal((await db.select().from(familyOfficeProposals).where(eq(familyOfficeProposals.runId, result.run.id))).length, 0);
  assert.equal((await db.select().from(familyOfficeEvidence).where(eq(familyOfficeEvidence.runId, result.run.id))).length, 0);
  assert.equal((await db.select().from(auditEvents).where(and(eq(auditEvents.householdId, f.household.id), eq(auditEvents.entityId, result.run.id)))).length, 1);
  assert.deepEqual(await Promise.all([count(shadowOrderIntents, f.household.id), count(orderIntents, f.household.id), count(ledgerTransactions, f.household.id), count(capitalRequests, f.household.id)]), before);
});

test("mismatched supplied digestion is rejected before workspace, provider, or audit side effects", { skip: !enabled }, async () => {
  const f = await fixture();
  const d = digestion();
  let calls = 0;
  const where = eq(familyOfficeRuns.householdId, f.household.id);
  const before = {
    runs: (await db.select().from(familyOfficeRuns).where(where)).length,
    digestions: await count(familyOfficeResearchDigestions, f.household.id),
    proposals: (await db.select().from(familyOfficeProposals).where(eq(familyOfficeProposals.householdId, f.household.id))).length,
    audits: (await db.select().from(auditEvents).where(eq(auditEvents.householdId, f.household.id))).length,
    scorecards: (await db.select().from(familyOfficeAnalystScorecards).where(eq(familyOfficeAnalystScorecards.householdId, f.household.id))).length,
  };
  await assert.rejects(() => runFamilyOfficeResearch(f.actor, { scope: "investment", ticker: "ACME", digestionPayload: original }, {
    structuredResearchDigestion: { ...d, fingerprint: "0".repeat(64) },
    provider: { status: { enabled: true, state: "configured", model: "test" }, research: async () => { calls++; return output(); } },
  }), /fingerprint mismatch/);
  assert.equal(calls, 0);
  assert.equal((await db.select().from(familyOfficeRuns).where(where)).length, before.runs);
  assert.equal(await count(familyOfficeResearchDigestions, f.household.id), before.digestions);
  assert.equal((await db.select().from(familyOfficeProposals).where(eq(familyOfficeProposals.householdId, f.household.id))).length, before.proposals);
  assert.equal((await db.select().from(auditEvents).where(eq(auditEvents.householdId, f.household.id))).length, before.audits);
  assert.equal((await db.select().from(familyOfficeAnalystScorecards).where(eq(familyOfficeAnalystScorecards.householdId, f.household.id))).length, before.scorecards);
});

test("preview requires contribute, validates generated 422 envelope, and has no persistence side effects", { skip: !enabled }, async () => {
  process.env.NODE_ENV = "test";
  process.env.CAPITAL_OS_TEST_CONTEXT = "1";
  process.env.CAPITAL_OS_ALLOWED_ORIGIN = "http://capitalos.test";
  const f = await fixture();
  const [viewer] = await db.insert(users).values({ email: `dig-view-${randomUUID()}@test.local`, displayName: "Viewer", status: "active" }).returning();
  await db.insert(householdMembers).values({ householdId: f.household.id, userId: viewer.id, role: "viewer", permissions: ["read"], active: true });
  const { default: app } = await import("../app.ts");
  const server = app.listen(0);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const request = (userId: string, payload: string) => fetch(`http://127.0.0.1:${address.port}/api/family-office/research/digestion/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Test-User-Id": userId, "X-Test-Household-Id": f.household.id },
    body: JSON.stringify({ digestionPayload: payload }),
  });
  try {
    const before = await count(familyOfficeResearchDigestions, f.household.id);
    assert.equal((await request(viewer.id, original)).status, 403);
    const accepted = await request(f.user.id, original);
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json() as { fingerprint: string }).fingerprint, digestion().fingerprint);
    const invalid = await request(f.user.id, "{");
    assert.equal(invalid.status, 422);
    const envelope = await invalid.json() as { code: string; issues: unknown[]; advisoryOnly: boolean };
    assert.equal(envelope.code, "DIGESTION_VALIDATION_FAILED");
    assert.ok(envelope.issues.length > 0);
    assert.equal(envelope.advisoryOnly, true);
    assert.equal(await count(familyOfficeResearchDigestions, f.household.id), before);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});