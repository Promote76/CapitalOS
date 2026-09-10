import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { db, householdMembers, households, reviewedResearchEvidence, schwabMarketSnapshots, users } from "@workspace/db";
import { listResearchDossiers, listSchwabMarketSnapshots, projectReviewedSnapshotForAgents, projectReviewedSnapshotPrefill, reviewSchwabMarketSnapshot } from "../services/research-dossier";
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