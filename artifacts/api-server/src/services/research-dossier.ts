import { and, desc, eq, inArray } from "drizzle-orm";
import { spawn } from "node:child_process";
import { db, auditEvents, investmentResearchDossiers, researchEvidence, schwabResearchCertifications } from "@workspace/db";
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
  const [row] = await db.update(researchEvidence).set({ reviewStatus: status, reviewedBy: actor.userId, reviewedAt: new Date() }).where(and(eq(researchEvidence.id, evidenceId), eq(researchEvidence.householdId, actor.householdId))).returning();
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
  const evidence = input.evidenceIds.length ? await db.select().from(researchEvidence).where(and(eq(researchEvidence.householdId, actor.householdId), inArray(researchEvidence.id, input.evidenceIds))) : [];
  if (evidence.length !== input.evidenceIds.length || evidence.some((item) => !review.has(item.reviewStatus) || item.extractionStatus !== "complete")) throw new Error("Only reviewed, completely extracted evidence from this household may be selected");
  const [row] = await db.insert(investmentResearchDossiers).values({
    householdId: actor.householdId, ticker, title: requiredText(input.title, 240, "title"), evidenceIds: input.evidenceIds,
    digestion: { ...parsed.data, uploadedEvidence: evidence.filter((e) => review.has(e.reviewStatus) && e.extractionStatus === "complete").map((e) => ({ id: e.id, title: e.title, text: e.extractedText })) } as unknown as Record<string, unknown>, createdBy: actor.userId,
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
    }, { reviewedResearchEvidence: evidence.map((item) => ({ id: item.id, title: item.title, provenanceClass: item.provenanceClass as "UPLOADED_LICENSED_RESEARCH" | "PRIMARY_SOURCE", excerpt: item.extractedText!.slice(0, 4000) })) });
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
  return { evidence: evidence.map((item) => ({ ...item, advisoryOnly: true })), dossiers: rows.map(snapshotDossier), capabilityReadiness: {
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