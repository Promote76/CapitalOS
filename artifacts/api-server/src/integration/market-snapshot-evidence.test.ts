import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import {
  auditEvents,
  db,
  familyOfficeAnalystScorecards,
  familyOfficeEvidence,
  familyOfficeProposals,
  familyOfficeRefreshes,
  familyOfficeReports,
  familyOfficeResearchDigestions,
  familyOfficeRuns,
  householdMembers,
  households,
  investmentResearchDossiers,
  reviewedResearchEvidence,
  reviewedSecFilingEvidence,
  schwabMarketSnapshots,
  secFilingSnapshots,
  users,
} from "@workspace/db";
import { createInvestmentResearchDossier, listResearchDossiers, listSchwabMarketSnapshots, projectReviewedSecForAgents, projectReviewedSnapshotForAgents, projectReviewedSnapshotPrefill, reviewSchwabMarketSnapshot } from "../services/research-dossier";
import { reviewSecFiling } from "../services/sec-research";
import { assertPermission } from "../domain/governance";
import { readFile } from "node:fs/promises";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";
const canonical = (v: unknown): string => Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object"
  ? `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`
  : JSON.stringify(v);

test("snapshot route permission contract is read/contribute/approve separated", () => {
  assert.throws(() => assertPermission("viewer", "contribute"));
  assert.throws(() => assertPermission("partner", "approve"));
  assert.doesNotThrow(() => assertPermission("owner", "approve"));
});

test("dossier service has no Schwab retrieval or execution seam", async () => {
  const source = await readFile(new URL("../services/research-dossier.ts", import.meta.url), "utf8");
  assert.equal(source.includes("requestSchwabResearch"), false);
  assert.equal(source.includes("trader/v1/orders"), false);
  assert.equal(source.includes("executionAuthority: \"none\""), true);
  assert.equal(source.includes("await tx.insert(auditEvents)"), true);
});

test("Grok projection excludes provider transport metadata and raw capability envelopes", () => {
  const item = {
    id: randomUUID(),
    householdId: randomUUID(),
    snapshotId: randomUUID(),
    ticker: "BKSC",
    canonicalContent: {
      ticker: "BKSC",
      instrument: { symbol: "BKSC", fundamental: { asOf: null } },
      quote: { lastPrice: "10.00" },
      dailyHistory: { candles: [{ marketDate: "2026-01-02", close: "10.00" }] },
      capabilities: [{ providerRequestId: "forbidden-request-id", rateLimit: { remaining: 99 } }],
      snapshotContext: { freshness: "UNKNOWN", qualityFlags: ["FUNDAMENTAL_AS_OF_UNKNOWN"] },
      rawPayload: "forbidden-raw-payload",
      token: "forbidden-token",
      connectionId: "forbidden-connection-id",
    },
    canonicalSha256: "c".repeat(64),
    provenance: {
      requests: [{ endpoint: "/marketdata/v1/quotes", providerRequestId: "forbidden-request-id" }],
    },
    readOnly: true,
    tradingEnabled: false,
    executionAuthority: "none",
    nonAuthoritative: false,
    approvedBy: randomUUID(),
    approvedAt: new Date("2026-01-02T14:01:00Z"),
    createdAt: new Date("2026-01-02T14:01:00Z"),
  };
  const projected = projectReviewedSnapshotForAgents(item);
  const prefill = projectReviewedSnapshotPrefill(item);
  assert.equal(projected.excerpt.includes("forbidden-request-id"), false);
  assert.equal(projected.excerpt.includes("rateLimit"), false);
  assert.equal(projected.excerpt.includes("/marketdata/"), false);
  assert.equal(projected.excerpt.includes("\"lastPrice\":\"10.00\""), true);
  assert.equal(projected.excerpt.includes("\"contentDigest\""), true);
  assert.equal(JSON.stringify(prefill).includes("forbidden-request-id"), false);
  assert.equal(JSON.stringify(prefill).includes("rateLimit"), false);
  assert.equal(JSON.stringify(prefill).includes("forbidden-raw-payload"), false);
  assert.equal(JSON.stringify(prefill).includes("forbidden-token"), false);
  assert.equal(JSON.stringify(prefill).includes("forbidden-connection-id"), false);
  assert.equal(prefill.ticker, "BKSC");
  assert.equal(prefill.quote.lastPrice, "10.00");
  assert.equal(prefill.priceHistory.candleCount, 1);
  assert.deepEqual(prefill.warnings.qualityFlags, ["FUNDAMENTAL_AS_OF_UNKNOWN"]);
});

async function fixture() {
  const [[a], [b]] = await Promise.all([
    db.insert(users).values({ email: `snapshot-${randomUUID()}@test.local`, displayName: "Snapshot A", status: "active" }).returning(),
    db.insert(users).values({ email: `snapshot-other-${randomUUID()}@test.local`, displayName: "Snapshot B", status: "active" }).returning(),
  ]);
  const [ha] = await db.insert(households).values({ name: `Snapshot A ${randomUUID()}`, timezone: "UTC" }).returning();
  const [hb] = await db.insert(households).values({ name: `Snapshot B ${randomUUID()}`, timezone: "UTC" }).returning();
  await db.insert(householdMembers).values([
    { householdId: ha.id, userId: a.id, role: "owner", permissions: ["read", "contribute", "approve"], active: true },
    { householdId: hb.id, userId: b.id, role: "owner", permissions: ["read", "contribute", "approve"], active: true },
  ]);
  return {
    a: { householdId: ha.id, userId: a.id, role: "owner" as const, source: "test-database" as const },
    b: { householdId: hb.id, userId: b.id, role: "owner" as const, source: "test-database" as const },
  };
}

test("market snapshot list and review are household isolated, digest exact, and one-way", { skip: !enabled }, async () => {
  const f = await fixture();
  const content = { ticker: "BKSC", capabilities: [{ capability: "CURRENT_QUOTE", data: { lastPrice: null, marketDate: "2026-01-02" } }] };
  const provenance = { provider: "schwab", payloadSha256: "a".repeat(64), providerRequestId: "safe-id" };
  const [snapshot] = await db.insert(schwabMarketSnapshots).values({
    householdId: f.a.householdId, ticker: "BKSC", content, provenance,
    requestedAt: new Date("2026-01-02T14:00:00Z"), retrievedAt: new Date("2026-01-02T14:00:01Z"),
    freshness: "UNKNOWN", missingFlags: ["capabilities[0].data.lastPrice"], qualityFlags: ["DELAY_STATUS_UNKNOWN"], createdBy: f.a.userId,
  }).returning();
  assert.equal((await listSchwabMarketSnapshots(f.b)).snapshots.length, 0);
  await assert.rejects(() => reviewSchwabMarketSnapshot(f.b, snapshot.id, "APPROVE"));
  const reviewed = await Promise.allSettled([
    reviewSchwabMarketSnapshot(f.a, snapshot.id, "APPROVE"),
    reviewSchwabMarketSnapshot(f.a, snapshot.id, "REJECT"),
  ]);
  assert.equal(reviewed.filter((result) => result.status === "fulfilled").length, 1);
  const [row] = await db.select().from(schwabMarketSnapshots).where(eq(schwabMarketSnapshots.id, snapshot.id));
  assert.ok(row.reviewStatus === "APPROVED" || row.reviewStatus === "REJECTED");
  if (row.reviewStatus === "APPROVED") {
    const [evidence] = await db.select().from(reviewedResearchEvidence).where(eq(reviewedResearchEvidence.snapshotId, snapshot.id));
    assert.ok(evidence);
    const canonicalContent = {
      ...content,
      snapshotContext: {
        requestedAt: "2026-01-02T14:00:00.000Z",
        retrievedAt: "2026-01-02T14:00:01.000Z",
        providerAsOf: null,
        marketDate: null,
        realtime: null,
        delayed: null,
        freshness: "UNKNOWN",
        missingFlags: ["capabilities[0].data.lastPrice"],
        qualityFlags: ["DELAY_STATUS_UNKNOWN"],
        readOnly: true,
        tradingEnabled: false,
        executionAuthority: "none",
        noTradingOrMoneyMovement: true,
      },
    };
    assert.equal(evidence.canonicalSha256, createHash("sha256").update(canonical({ content: canonicalContent, provenance })).digest("hex"));
    assert.equal(evidence.readOnly, true);
    assert.equal(evidence.tradingEnabled, false);
    assert.equal(evidence.executionAuthority, "none");
    assert.equal(evidence.nonAuthoritative, false);
  }
  await assert.rejects(() => reviewSchwabMarketSnapshot(f.a, snapshot.id, "APPROVE"));
});

test("approved snapshot evidence list never exposes another household", { skip: !enabled }, async () => {
  const f = await fixture();
  const [snapshot] = await db.insert(schwabMarketSnapshots).values({
    householdId: f.a.householdId,
    ticker: "BKSC",
    content: { ticker: "BKSC", capabilities: [] },
    provenance: { provider: "schwab" },
    requestedAt: new Date("2026-01-02T14:00:00Z"),
    retrievedAt: new Date("2026-01-02T14:00:01Z"),
    freshness: "UNKNOWN",
    createdBy: f.a.userId,
    reviewStatus: "APPROVED",
    reviewedBy: f.a.userId,
    reviewedAt: new Date("2026-01-02T14:01:00Z"),
  }).returning();
  await db.insert(reviewedResearchEvidence).values({
    householdId: f.a.householdId, snapshotId: snapshot.id, ticker: "BKSC",
    canonicalContent: { ticker: "BKSC" }, canonicalSha256: "b".repeat(64), provenance: { provider: "schwab" }, approvedBy: f.a.userId,
  });
  assert.equal((await listSchwabMarketSnapshots(f.b)).evidence.length, 0);
  const ownDossierEvidence = (await listResearchDossiers(f.a)).evidence;
  assert.equal(ownDossierEvidence.length, 1);
  assert.equal(ownDossierEvidence[0]!.reviewStatus, "APPROVED");
  assert.equal(ownDossierEvidence[0]!.extractionStatus, "complete");
  assert.equal(ownDossierEvidence[0]!.evidenceKind, "SCHWAB_MARKET_SNAPSHOT");
  assert.equal(ownDossierEvidence[0]!.dossierPrefill.ticker, "BKSC");
});

test("SEC facts require household-scoped human approval and retain multi-source citations without execution authority", { skip: !enabled }, async () => {
  const f = await fixture();
  const [marketSnapshot] = await db.insert(schwabMarketSnapshots).values({
    householdId: f.a.householdId, ticker: "BKSC",
    content: { ticker: "BKSC", instrument: { symbol: "BKSC" }, capabilities: [] },
    provenance: { provider: "schwab" },
    requestedAt: new Date("2026-08-02T00:00:00Z"), retrievedAt: new Date("2026-08-02T00:00:01Z"),
    freshness: "CURRENT", createdBy: f.a.userId, reviewStatus: "APPROVED",
    reviewedBy: f.a.userId, reviewedAt: new Date("2026-08-02T00:01:00Z"),
  }).returning();
  await db.insert(reviewedResearchEvidence).values({
    householdId: f.a.householdId, snapshotId: marketSnapshot.id, ticker: "BKSC",
    canonicalContent: { ticker: "BKSC" }, canonicalSha256: createHash("sha256").update(randomUUID()).digest("hex"),
    provenance: { provider: "schwab" }, approvedBy: f.a.userId,
  });
  const secContent = {
    ticker: "BKSC",
    filingPriority: "LATEST_10Q_THEN_10K_ONLY_FOR_MISSING_FIELDS",
    filings: [{ form: "10-Q", filingDate: "2026-08-01", accession: "0000000001-26-000010", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000010/q.htm" }],
    metrics: { totalAssets: { tag: "Assets", unit: "USD", value: 100, start: null, end: "2026-06-30", accession: "0000000001-26-000010", form: "10-Q", filed: "2026-08-01", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000010/q.htm" } },
  };
  const [draft] = await db.insert(secFilingSnapshots).values({
    householdId: f.a.householdId, ticker: "BKSC", filingForm: "10-Q", filingDate: "2026-08-01",
    accession: `0000000001-26-${randomUUID().slice(0, 6)}`, sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/000000000126000010/q.htm",
    content: secContent, provenance: { provider: "SEC EDGAR", accessedAt: "2026-09-10T00:00:00Z" },
    missingFields: ["uninsuredDeposits"], evidenceQuality: "LOW", extractionTimestamp: new Date("2026-09-10T00:00:00Z"), createdBy: f.a.userId,
  }).returning();

  assert.equal((await listResearchDossiers(f.a)).evidence.some((item) => item.evidenceKind === "SEC_FILING"), false);
  await assert.rejects(() => reviewSecFiling(f.b, draft.id, "APPROVE"));
  const reviewed = await reviewSecFiling(f.a, draft.id, "APPROVE");
  assert.equal(reviewed.evidence.readOnly, true);
  assert.equal(reviewed.evidence.tradingEnabled, false);
  assert.equal(reviewed.evidence.executionAuthority, "none");
  const listed = (await listResearchDossiers(f.a)).evidence;
  assert.equal(listed.filter((item) => item.evidenceKind === "SCHWAB_MARKET_SNAPSHOT").length, 1);
  const sec = listed.find((item) => item.evidenceKind === "SEC_FILING");
  assert.ok(sec?.dossierPrefill.sourceFacts.some((fact) => fact.evidenceId === reviewed.evidence.id && fact.accession === "0000000001-26-000010"));
  assert.equal((await listResearchDossiers(f.b)).evidence.some((item) => item.evidenceKind === "SEC_FILING"), false);
  const [stored] = await db.select().from(reviewedSecFilingEvidence).where(eq(reviewedSecFilingEvidence.id, reviewed.evidence.id));
  const projection = projectReviewedSecForAgents(stored);
  assert.equal(projection.excerpt.includes("\"value\":100"), true);
  assert.equal(projection.excerpt.includes("accessedAt"), false);
  assert.equal(projection.excerpt.includes("executionAuthority\":\"none"), true);
});

test("invalid dossier digestion stops before dossier or Research Chair side effects", { skip: !enabled }, async () => {
  const f = await fixture();
  await assert.rejects(
    () => createInvestmentResearchDossier(f.a, {
      ticker: "BKSC",
      title: "BKSC Investment Research",
      evidenceIds: [],
      digestionPayload: "Company: Bank of South Carolina\nTicker: BKSC\nSources:\n- ",
    }),
    /Research digestion failed validation/,
  );

  const [
    dossiers,
    dossierAudits,
    runs,
    digestions,
    chairEvidence,
    proposals,
    reports,
    refreshes,
    scorecards,
  ] = await Promise.all([
    db.select({ id: investmentResearchDossiers.id }).from(investmentResearchDossiers).where(eq(investmentResearchDossiers.householdId, f.a.householdId)),
    db.select({ id: auditEvents.id }).from(auditEvents).where(and(eq(auditEvents.householdId, f.a.householdId), eq(auditEvents.eventType, "investment_research_dossier_created"))),
    db.select({ id: familyOfficeRuns.id }).from(familyOfficeRuns).where(eq(familyOfficeRuns.householdId, f.a.householdId)),
    db.select({ id: familyOfficeResearchDigestions.id }).from(familyOfficeResearchDigestions).where(eq(familyOfficeResearchDigestions.householdId, f.a.householdId)),
    db.select({ id: familyOfficeEvidence.id }).from(familyOfficeEvidence).where(eq(familyOfficeEvidence.householdId, f.a.householdId)),
    db.select({ id: familyOfficeProposals.id }).from(familyOfficeProposals).where(eq(familyOfficeProposals.householdId, f.a.householdId)),
    db.select({ id: familyOfficeReports.id }).from(familyOfficeReports).where(eq(familyOfficeReports.householdId, f.a.householdId)),
    db.select({ id: familyOfficeRefreshes.id }).from(familyOfficeRefreshes).where(eq(familyOfficeRefreshes.householdId, f.a.householdId)),
    db.select({ id: familyOfficeAnalystScorecards.id }).from(familyOfficeAnalystScorecards).where(eq(familyOfficeAnalystScorecards.householdId, f.a.householdId)),
  ]);
  assert.deepEqual(
    [dossiers, dossierAudits, runs, digestions, chairEvidence, proposals, reports, refreshes, scorecards].map((rows) => rows.length),
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
});