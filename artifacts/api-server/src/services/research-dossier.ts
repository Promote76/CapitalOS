import { and, desc, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { db, auditEvents, investmentResearchDossiers, researchEvidence, schwabResearchCertifications, schwabMarketSnapshots, reviewedResearchEvidence } from "@workspace/db";
import type { Actor } from "./capital-os";
import { assertDocumentUploadGrant, assertPrivateObjectPath, createDocumentUploadGrant, downloadBusinessDocument, requestBusinessDocumentUpload } from "../lib/business-document-storage";
import { parseResearchDigestion } from "../domain/research-digestion";
import { runFamilyOfficeResearch } from "./family-office";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT = 100 * 1024;
const provenance = new Set(["UPLOADED_LICENSED_RESEARCH", "PRIMARY_SOURCE"]);
const mime = new Set(["application/pdf", "text/plain"]);
const review = new Set(["REVIEWED", "APPROVED"]);
const MAX_EXTRACTED = 100 * 1024;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function collectMissing(value: unknown, path = "", out: string[] = []): string[] {
  if (value === null || value === undefined) { out.push(path || "$"); return out; }
  if (Array.isArray(value)) { value.forEach((v, i) => collectMissing(v, `${path}[${i}]`, out)); return out; }
  if (typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([k, v]) => collectMissing(v, path ? `${path}.${k}` : k, out));
  return out;
}

function projectMarketSnapshot(row: typeof schwabMarketSnapshots.$inferSelect) {
  return {
    ...row,
    advisoryOnly: true as const,
    nonAuthoritative: true as const,
    readOnly: true as const,
    tradingEnabled: false as const,
    executionAuthority: "none" as const,
    noTradingOrMoneyMovement: true as const,
  };
}

export async function createSchwabMarketSnapshot(actor: Actor, input: {
  ticker: string; content: Record<string, unknown>; provenance: Record<string, unknown>;
  requestedAt: string; retrievedAt: string; providerAsOf: string | null; marketDate: string | null;
  realtime: boolean | null; delayed: boolean | null; freshness: string;
  missingFlags: string[]; qualityFlags: string[];
}) {
  const missingFlags = Array.from(new Set([...input.missingFlags, ...collectMissing(input.content)]));
  const [row] = await db.insert(schwabMarketSnapshots).values({
    householdId: actor.householdId, ticker: input.ticker, content: input.content, provenance: input.provenance,
    requestedAt: new Date(input.requestedAt), retrievedAt: new Date(input.retrievedAt),
    providerAsOf: input.providerAsOf ? new Date(input.providerAsOf) : null, marketDate: input.marketDate,
    realtime: input.realtime, delayed: input.delayed, freshness: input.freshness,
    missingFlags, qualityFlags: input.qualityFlags, createdBy: actor.userId,
  }).returning();
  await db.insert(auditEvents).values({
    householdId: actor.householdId,
    actor: actor.userId,
    eventType: "schwab_market_snapshot_draft_created",
    entity: "schwab_market_snapshot",
    entityId: row.id,
    reason: "Fresh normalized Schwab observations retained as non-authoritative draft pending human review",
    metadata: {
      ticker: row.ticker,
      readOnly: true,
      tradingEnabled: false,
      executionAuthority: "none",
      freshness: row.freshness,
      qualityFlags: row.qualityFlags,
    },
  });
  return projectMarketSnapshot(row);
}

export async function reviewSchwabMarketSnapshot(actor: Actor, snapshotId: string, disposition: "APPROVE" | "REJECT", reason?: string) {
  const result = await db.transaction(async (tx) => {
    const [snapshot] = await tx.select().from(schwabMarketSnapshots).where(and(eq(schwabMarketSnapshots.id, snapshotId), eq(schwabMarketSnapshots.householdId, actor.householdId))).limit(1);
    if (!snapshot) throw new Error("Market snapshot not found in this household");
    if (snapshot.reviewStatus !== "PENDING_HUMAN_REVIEW") throw new Error("Market snapshot review disposition is immutable");
    const [updated] = await tx.update(schwabMarketSnapshots).set({
      reviewStatus: disposition === "APPROVE" ? "APPROVED" : "REJECTED", reviewedBy: actor.userId, reviewedAt: new Date(), reviewReason: reason ?? null,
    }).where(and(eq(schwabMarketSnapshots.id, snapshotId), eq(schwabMarketSnapshots.householdId, actor.householdId), eq(schwabMarketSnapshots.reviewStatus, "PENDING_HUMAN_REVIEW"))).returning();
    if (!updated) throw new Error("Market snapshot was reviewed concurrently");
    let evidence: typeof reviewedResearchEvidence.$inferSelect | null = null;
    if (disposition === "APPROVE") {
      const canonicalContent = {
        ticker: snapshot.ticker,
        ...snapshot.content,
        snapshotContext: {
          requestedAt: snapshot.requestedAt.toISOString(),
          retrievedAt: snapshot.retrievedAt.toISOString(),
          providerAsOf: snapshot.providerAsOf?.toISOString() ?? null,
          marketDate: snapshot.marketDate,
          realtime: snapshot.realtime,
          delayed: snapshot.delayed,
          freshness: snapshot.freshness,
          missingFlags: snapshot.missingFlags,
          qualityFlags: snapshot.qualityFlags,
          readOnly: true,
          tradingEnabled: false,
          executionAuthority: "none",
          noTradingOrMoneyMovement: true,
        },
      };
      const canonicalSha256 = createHash("sha256").update(canonicalize({ content: canonicalContent, provenance: snapshot.provenance })).digest("hex");
      [evidence] = await tx.insert(reviewedResearchEvidence).values({
        householdId: actor.householdId, snapshotId: snapshot.id, ticker: snapshot.ticker,
        canonicalContent, canonicalSha256, provenance: snapshot.provenance, approvedBy: actor.userId,
        readOnly: true, tradingEnabled: false, executionAuthority: "none", nonAuthoritative: false,
      }).returning();
    }
    await tx.insert(auditEvents).values({
      householdId: actor.householdId,
      actor: actor.userId,
      eventType: "schwab_market_snapshot_reviewed",
      entity: "schwab_market_snapshot",
      entityId: snapshotId,
      reason: `Human disposition: ${disposition}`,
      metadata: { disposition, digest: evidence?.canonicalSha256 ?? null },
    });
    return { snapshot: updated, evidence };
  });
  return {
    ...result,
    snapshot: projectMarketSnapshot(result.snapshot),
    advisoryOnly: true as const,
    readOnly: true as const,
    tradingEnabled: false as const,
    executionAuthority: "none" as const,
    noTradingOrMoneyMovement: true as const,
  };
}

export function projectReviewedSnapshotForAgents(
  item: typeof reviewedResearchEvidence.$inferSelect,
) {
  const content = item.canonicalContent;
  const context = content.snapshotContext && typeof content.snapshotContext === "object"
    ? content.snapshotContext as Record<string, unknown>
    : {};
  return {
    id: item.id,
    title: `Schwab ${item.ticker} market snapshot`,
    provenanceClass: "PRIMARY_SOURCE" as const,
    excerpt: JSON.stringify({
      ticker: item.ticker,
      instrument: content.instrument ?? null,
      quote: content.quote ?? null,
      dailyHistory: content.dailyHistory ?? null,
      dataQuality: {
        provider: "schwab",
        reviewedAt: item.approvedAt.toISOString(),
        contentDigest: item.canonicalSha256,
        marketDate: context.marketDate ?? null,
        providerAsOf: context.providerAsOf ?? null,
        freshness: context.freshness ?? "UNKNOWN",
        realtime: context.realtime ?? null,
        delayed: context.delayed ?? null,
        missingFlags: context.missingFlags ?? [],
        qualityFlags: context.qualityFlags ?? [],
        readOnly: true,
        tradingEnabled: false,
        executionAuthority: "none",
        noTradingOrMoneyMovement: true,
      },
    }),
  };
}

export async function listSchwabMarketSnapshots(actor: Actor) {
  const snapshots = await db.select().from(schwabMarketSnapshots).where(eq(schwabMarketSnapshots.householdId, actor.householdId)).orderBy(desc(schwabMarketSnapshots.createdAt));
  const evidence = await db.select().from(reviewedResearchEvidence).where(eq(reviewedResearchEvidence.householdId, actor.householdId)).orderBy(desc(reviewedResearchEvidence.createdAt));
  return { snapshots: snapshots.map(projectMarketSnapshot), evidence };
}

async function extractPdf(bytes: Buffer) {
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return { text: null, status: "failed" };
  return new Promise<{ text: string | null; status: string }>((resolve) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"]);
    const chunks: Buffer[] = []; let total = 0; let settled = false;
    const finish = (value: { text: string | null; status: string }) => { if (!settled) { settled = true; child.kill(); resolve(value); } };
    const timer = setTimeout(() => finish({ text: null, status: "failed_timeout" }), 15_000);
    child.stdout.on("data", (chunk: Buffer) => { total += chunk.length; if (total > MAX_EXTRACTED) { clearTimeout(timer); finish({ text: null, status: "failed_output_bound" }); } else chunks.push(chunk); });
    child.on("error", () => { clearTimeout(timer); finish({ text: null, status: "needs_review_unsupported_pdf" }); });
    child.on("close", (code) => { clearTimeout(timer); if (code !== 0) finish({ text: null, status: "failed" }); else { const text = Buffer.concat(chunks).toString("utf8"); finish({ text: text || null, status: text ? "complete" : "failed" }); } });
    child.stdin.end(bytes);
  });
}

export async function requestResearchEvidenceUpload(actor: Actor, input: { contentType: string; size: number }) {
  if (!mime.has(input.contentType) || !Number.isSafeInteger(input.size) || input.size <= 0 || input.size > MAX_BYTES) {
    throw new Error("Research evidence must be a bounded PDF or plain-text upload");
  }
  const target = await requestBusinessDocumentUpload();
  return {
    ...target,
    uploadGrant: createDocumentUploadGrant({ householdId: actor.householdId, userId: actor.userId, objectPath: target.objectPath, contentType: input.contentType, size: input.size }),
  };
}

function requiredText(value: unknown, max: number, name: string) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} is required and bounded`);
  return value.trim();
}

export async function registerResearchEvidence(actor: Actor, input: {
  title: string; objectPath: string; byteLength: number; mimeType: string; uploadGrant: string;
  provenanceClass: string; financialDocumentId?: string;
}) {
  const title = requiredText(input.title, 240, "title");
  if (!provenance.has(input.provenanceClass)) throw new Error("Unsupported provenance class");
  if (!mime.has(input.mimeType)) throw new Error("Research evidence must be PDF or plain text");
  if (!Number.isSafeInteger(input.byteLength) || input.byteLength <= 0 || input.byteLength > MAX_BYTES) throw new Error("Evidence exceeds the bounded download limit");
  assertPrivateObjectPath(input.objectPath);
  assertDocumentUploadGrant(input.uploadGrant, { householdId: actor.householdId, userId: actor.userId, objectPath: input.objectPath, contentType: input.mimeType, size: input.byteLength });
  const stored = await downloadBusinessDocument(input.objectPath, { maxBytes: MAX_BYTES, expectedBytes: input.byteLength, expectedContentType: input.mimeType });
  const extraction = input.mimeType === "application/pdf" ? await extractPdf(stored.bytes) : { text: (() => { const text = stored.bytes.toString("utf8"); if (Buffer.byteLength(text, "utf8") > MAX_TEXT || text.includes("\uFFFD")) throw new Error("Plain-text extraction failed or exceeded bounds"); return text; })(), status: "complete" };
  const extractedText = extraction.text;
  const existing = await db.select().from(researchEvidence).where(and(eq(researchEvidence.householdId, actor.householdId), eq(researchEvidence.sha256, stored.sha256))).limit(1);
  if (existing[0]) return { ...existing[0], duplicate: true, advisoryOnly: true };
  const [row] = await db.insert(researchEvidence).values({
    householdId: actor.householdId, title, objectPath: input.objectPath, byteLength: input.byteLength,
    mimeType: input.mimeType, sha256: stored.sha256, provenanceClass: input.provenanceClass,
    financialDocumentId: input.financialDocumentId, uploadedBy: actor.userId, extractedText,
    extractionStatus: extraction.status,
  }).returning();
  await db.insert(auditEvents).values({ householdId: actor.householdId, actor: actor.userId, eventType: "research_evidence_registered", entity: "research_evidence", entityId: row.id, reason: "User-declared research provenance retained pending human review", metadata: { provenanceClass: input.provenanceClass, sha256: row.sha256 } });
  return { ...row, duplicate: false, advisoryOnly: true };
}

export async function reviewResearchEvidence(actor: Actor, evidenceId: string, status: "REVIEWED" | "REJECTED") {
  const [row] = await db.update(researchEvidence).set({ reviewStatus: status, reviewedBy: actor.userId, reviewedAt: new Date() }).where(and(eq(researchEvidence.id, evidenceId), eq(researchEvidence.householdId, actor.householdId), eq(researchEvidence.reviewStatus, "PENDING_HUMAN_REVIEW"))).returning();
  if (!row) throw new Error("Research evidence not found in this household");
  await db.insert(auditEvents).values({ householdId: actor.householdId, actor: actor.userId, eventType: "research_evidence_reviewed", entity: "research_evidence", entityId: evidenceId, reason: `Human review status: ${status}`, metadata: { status } });
  return { ...row, advisoryOnly: true };
}

export async function createInvestmentResearchDossier(actor: Actor, input: { ticker: string; title: string; evidenceIds: string[]; digestionPayload: string }) {
  const ticker = requiredText(input.ticker, 16, "ticker").toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker)) throw new Error("Invalid ticker");
  if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length > 25) throw new Error("At most 25 evidence items may be selected");
  const parsed = parseResearchDigestion(input.digestionPayload);
  if (!parsed.success) throw new Error("Research digestion failed validation");
  const uploadedEvidence = input.evidenceIds.length ? await db.select().from(researchEvidence).where(and(eq(researchEvidence.householdId, actor.householdId), inArray(researchEvidence.id, input.evidenceIds))) : [];
  const reviewedSnapshots = input.evidenceIds.length ? await db.select().from(reviewedResearchEvidence).where(and(eq(reviewedResearchEvidence.householdId, actor.householdId), inArray(reviewedResearchEvidence.id, input.evidenceIds))) : [];
  if (reviewedSnapshots.some((item) => item.ticker !== ticker)) {
    throw new Error("Reviewed market snapshot evidence must match the dossier ticker");
  }
  const evidence = [
    ...uploadedEvidence.map((item) => ({ ...item, evidenceText: item.extractedText })),
    ...reviewedSnapshots.map((item) => ({ id: item.id, title: `Schwab ${item.ticker} market snapshot`, provenanceClass: "PRIMARY_SOURCE", reviewStatus: "APPROVED", extractionStatus: "complete", extractedText: JSON.stringify(item.canonicalContent), evidenceText: JSON.stringify(item.canonicalContent) })),
  ];
  if (evidence.length !== input.evidenceIds.length || evidence.some((item) => !review.has(item.reviewStatus) || item.extractionStatus !== "complete")) throw new Error("Only reviewed, completely extracted evidence from this household may be selected");
  const [row] = await db.insert(investmentResearchDossiers).values({
    householdId: actor.householdId, ticker, title: requiredText(input.title, 240, "title"), evidenceIds: input.evidenceIds,
     digestion: { ...parsed.data, uploadedEvidence: evidence.filter((e) => review.has(e.reviewStatus) && e.extractionStatus === "complete").map((e) => ({ id: e.id, title: e.title, text: e.evidenceText })) } as unknown as Record<string, unknown>, createdBy: actor.userId,
    report: { status: "PENDING_PROVIDER", advisoryOnly: true, executionAuthority: "none", evidenceClasses: evidence.map((e) => e.provenanceClass) },
  }).returning();
  await db.insert(auditEvents).values({ householdId: actor.householdId, actor: actor.userId, eventType: "investment_research_dossier_created", entity: "investment_research_dossier", entityId: row.id, reason: "Advisory-only research dossier created from reviewed evidence", metadata: { advisoryOnly: true, executionAuthority: "none", evidenceIds: input.evidenceIds } });
  // The established three-agent pipeline remains the only report producer. A
  // provider failure leaves this durable, reviewable dossier pending rather
  // than fabricating a report or granting authority.
  try {
    const result = await runFamilyOfficeResearch(actor, {
      scope: "investment_research_dossier",
      ticker,
      prompt: "Produce an advisory-only investment research report. Do not authorize execution or capital movement.",
      digestionPayload: input.digestionPayload,
      }, { reviewedResearchEvidence: [
        ...uploadedEvidence.map((item) => ({
          id: item.id,
          title: item.title,
          provenanceClass: item.provenanceClass as "UPLOADED_LICENSED_RESEARCH" | "PRIMARY_SOURCE",
          excerpt: item.extractedText!.slice(0, 4000),
        })),
        ...reviewedSnapshots.map(projectReviewedSnapshotForAgents),
      ] });
    const [completed] = await db.update(investmentResearchDossiers).set({ report: result as unknown as Record<string, unknown>, reviewStatus: "PENDING_HUMAN_REVIEW" }).where(and(eq(investmentResearchDossiers.id, row.id), eq(investmentResearchDossiers.householdId, actor.householdId))).returning();
    const dossier = snapshotDossier(completed ?? row);
    return { dossier, proposal: (result as { proposal?: unknown }).proposal ?? null, refresh: await listResearchDossiers(actor) };
  } catch {
    return { dossier: snapshotDossier(row), proposal: null, refresh: await listResearchDossiers(actor) };
  }
}

function snapshotDossier(row: typeof investmentResearchDossiers.$inferSelect) {
  const report = row.report && typeof row.report === "object" ? row.report as Record<string, unknown> : {};
  const run = report.run && typeof report.run === "object" ? report.run as Record<string, unknown> : {};
  const proposal = report.proposal && typeof report.proposal === "object" ? report.proposal : null;
  const reportStatus = typeof run.status === "string"
    ? run.status
    : typeof run.providerStatus === "string" ? run.providerStatus : "PENDING_PROVIDER";
  const { report: _report, digestion: _digestion, ...safe } = row;
  return { ...safe, createdAt: row.createdAt, reportStatus, proposal, advisoryOnly: true, executionAuthority: "none", noCapitalSideEffects: true };
}

export async function listResearchDossiers(actor: Actor) {
  const rows = await db.select().from(investmentResearchDossiers).where(eq(investmentResearchDossiers.householdId, actor.householdId)).orderBy(desc(investmentResearchDossiers.createdAt));
  const evidence = await db.select().from(researchEvidence).where(eq(researchEvidence.householdId, actor.householdId)).orderBy(desc(researchEvidence.createdAt));
  const approvedSnapshotEvidence = await db.select().from(reviewedResearchEvidence).where(eq(reviewedResearchEvidence.householdId, actor.householdId)).orderBy(desc(reviewedResearchEvidence.createdAt));
  const [latestCertification] = await db.select().from(schwabResearchCertifications)
    .where(eq(schwabResearchCertifications.householdId, actor.householdId))
    .orderBy(desc(schwabResearchCertifications.createdAt))
    .limit(1);
  const certifiedCapabilities = new Set(
    Array.isArray(latestCertification?.record?.capabilities)
      ? latestCertification.record.capabilities
        .filter((item): item is { capability: string; status: string } => Boolean(item && typeof item === "object" && "capability" in item && "status" in item))
        .filter((item) => item.status === "CONFIRMED")
        .map((item) => item.capability)
      : [],
  );
  return { evidence: [
    ...evidence.map((item) => ({ ...item, advisoryOnly: true })),
    ...approvedSnapshotEvidence.map((item) => ({
      id: item.id, householdId: item.householdId, title: `Schwab ${item.ticker} market snapshot`,
      provenanceClass: "PRIMARY_SOURCE", reviewStatus: "APPROVED", mimeType: "application/json", objectPath: "",
      byteLength: Buffer.byteLength(JSON.stringify(item.canonicalContent)), sha256: item.canonicalSha256,
      extractionStatus: "complete", advisoryOnly: true, metadata: item.provenance,
      createdAt: item.createdAt, reviewedBy: item.approvedBy, reviewedAt: item.approvedAt,
    })),
  ], dossiers: rows.map(snapshotDossier), capabilityReadiness: {
    quote: "implemented", market_hours: "implemented", portfolio_position: "implemented",
    instrument_metadata: certifiedCapabilities.has("INSTRUMENT_FUNDAMENTAL") ? "CONFIRMED" : "PENDING_PROVIDER_CONFIRMATION",
    fundamentals: certifiedCapabilities.has("INSTRUMENT_FUNDAMENTAL") ? "CONFIRMED" : "PENDING_PROVIDER_CONFIRMATION",
    price_history: certifiedCapabilities.has("DAILY_PRICE_HISTORY") ? "CONFIRMED" : "PENDING_PROVIDER_CONFIRMATION",
    movers: "PENDING_PROVIDER_CONFIRMATION",
    options: "PENDING_PROVIDER_CONFIRMATION", streaming: "PENDING_PROVIDER_CONFIRMATION",
    news: "PENDING_PROVIDER_CONFIRMATION", tax_data: "PENDING_PROVIDER_CONFIRMATION",
    schwab_reports: "PENDING_PROVIDER_CONFIRMATION",
    execution: "DISABLED_NOT_IN_SCOPE", order: "DISABLED_NOT_IN_SCOPE",
    transfer: "DISABLED_NOT_IN_SCOPE", withdrawal: "DISABLED_NOT_IN_SCOPE",
    micro_live: "DISABLED_NOT_IN_SCOPE", capital_allocation: "DISABLED_NOT_IN_SCOPE",
    reasons: { deferred: "Provider confirmation is required before exposing this capability.", disabled: "Investment research is advisory-only and has no execution or capital authority." },
  }, advisoryOnly: true };
}