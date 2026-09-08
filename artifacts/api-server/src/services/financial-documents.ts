import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  auditEvents, bankStatementDocuments, bankStatementTransactions, financialDocuments,
  profitLossDocuments, settlementDocuments,
} from "@workspace/db/schema";
import type { Actor } from "./capital-os";
import { assertPermission, GovernanceError } from "../domain/governance";
import { assertPrivateObjectPath, downloadBusinessDocument, requestBusinessDocumentUpload } from "../lib/business-document-storage";

const acceptedTypes = new Set([
  "STEVENS_SETTLEMENT", "BUSINESS_PROFIT_AND_LOSS", "BANK_STATEMENT", "1099",
  "INCOME_VERIFICATION", "INSURANCE_DOCUMENT", "AUTO_LOAN_DOCUMENT",
  "BUSINESS_LEASE_DOCUMENT", "OTHER_FINANCIAL_DOCUMENT",
]);
const reviewableStatuses = new Set(["UPLOADED", "PARSING", "PARSED", "NEEDS_REVIEW"]);

function response(document: typeof financialDocuments.$inferSelect, bankStatement?: typeof bankStatementDocuments.$inferSelect, transactions: readonly (typeof bankStatementTransactions.$inferSelect)[] = []) {
  const { householdId: _householdId, uploadedBy: _uploadedBy, reviewedBy: _reviewedBy, ...value } = document;
  return { ...value, bankStatement: bankStatement ?? null, transactions };
}

export async function requestFinancialDocumentUploadUrl(actor: Actor, input: {
  name: string; size: number; contentType: string; documentType: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!acceptedTypes.has(input.documentType)) throw new GovernanceError("INVALID_STATE", "Unsupported financial document type");
  if (!["application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(input.contentType)) {
    throw new GovernanceError("INVALID_STATE", "Financial evidence must be PDF, CSV, or XLSX");
  }
  return { ...input, ...(await requestBusinessDocumentUpload()) };
}

export async function ingestFinancialDocument(actor: Actor, input: {
  documentType: string; sourceFileName: string; sourceObjectPath: string; contentType: string; sourceSizeBytes: number;
  businessId?: string; sourceInstitution?: string; accountId?: string; statementStart?: string; statementEnd?: string;
  accountDisplayName?: string; accountMask?: string;
}) {
  assertPermission(actor.role, "contribute");
  if (!acceptedTypes.has(input.documentType)) throw new GovernanceError("INVALID_STATE", "Unsupported financial document type");
  assertPrivateObjectPath(input.sourceObjectPath);
  const { bytes, sha256 } = await downloadBusinessDocument(input.sourceObjectPath);
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(financialDocuments).where(and(
      eq(financialDocuments.householdId, actor.householdId), eq(financialDocuments.documentHash, sha256),
    )).limit(1);
    if (existing) throw new GovernanceError("CONFLICT", `DOCUMENT ALREADY EXISTS: ${existing.id}`);
    const [document] = await tx.insert(financialDocuments).values({
      householdId: actor.householdId, businessId: input.businessId, documentType: input.documentType,
      // No parser has claimed this evidence; it is explicitly awaiting human review.
      status: "UPLOADED", sourceInstitution: input.sourceInstitution, sourceFileName: input.sourceFileName,
      mimeType: input.contentType, sourceObjectPath: input.sourceObjectPath, documentHash: sha256,
      sourceMetadata: { declaredSizeBytes: input.sourceSizeBytes, observedSizeBytes: bytes.length, ingestion: "metadata_only" },
      uploadedBy: actor.userId,
    }).returning();
    let bankStatement: typeof bankStatementDocuments.$inferSelect | undefined;
    if (input.documentType === "BANK_STATEMENT") {
      [bankStatement] = await tx.insert(bankStatementDocuments).values({
        householdId: actor.householdId, documentId: document.id, accountId: input.accountId,
        institutionName: input.sourceInstitution, accountDisplayName: input.accountDisplayName, accountMask: input.accountMask,
        statementStart: input.statementStart, statementEnd: input.statementEnd,
        status: "DOCUMENT_EVIDENCE_PENDING_REVIEW",
      }).returning();
    }
    await tx.insert(auditEvents).values({
      householdId: actor.householdId, eventType: "financial_document_ingested", actor: actor.userId,
      entity: "financial_document", entityId: document.id,
      reason: "Financial evidence recorded; no ledger entry or bank write was made.",
      metadata: { documentType: input.documentType, documentHash: sha256, bankStatement: Boolean(bankStatement) },
    });
    return response(document, bankStatement);
  });
}

export async function listFinancialDocuments(actor: Actor) {
  const documents = await db.select().from(financialDocuments).where(eq(financialDocuments.householdId, actor.householdId)).orderBy(desc(financialDocuments.uploadedAt));
  const ids = documents.map((document) => document.id);
  const statements = ids.length ? await db.select().from(bankStatementDocuments).where(and(eq(bankStatementDocuments.householdId, actor.householdId), inArray(bankStatementDocuments.documentId, ids))) : [];
  const byDocument = new Map(statements.map((statement) => [statement.documentId, statement]));
  return { documents: documents.map((document) => response(document, byDocument.get(document.id))) };
}

export async function getFinancialDocument(actor: Actor, documentId: string) {
  const [document] = await db.select().from(financialDocuments).where(and(eq(financialDocuments.id, documentId), eq(financialDocuments.householdId, actor.householdId))).limit(1);
  if (!document) throw new GovernanceError("INVALID_STATE", "Financial document not found");
  const [statement] = await db.select().from(bankStatementDocuments).where(and(eq(bankStatementDocuments.documentId, document.id), eq(bankStatementDocuments.householdId, actor.householdId))).limit(1);
  const transactions = statement ? await db.select().from(bankStatementTransactions).where(and(eq(bankStatementTransactions.bankStatementDocumentId, statement.id), eq(bankStatementTransactions.householdId, actor.householdId))) : [];
  return response(document, statement, transactions);
}

export async function reviewFinancialDocument(actor: Actor, documentId: string, input: { decision: "VERIFIED" | "REJECTED" | "NEEDS_REVIEW"; reason: string }) {
  assertPermission(actor.role, "approve");
  const [document] = await db.update(financialDocuments).set({
    status: input.decision, reviewDecision: input.decision, reviewReason: input.reason, reviewedBy: actor.userId, reviewedAt: new Date(),
  }).where(and(eq(financialDocuments.id, documentId), eq(financialDocuments.householdId, actor.householdId))).returning();
  if (!document) throw new GovernanceError("INVALID_STATE", "Financial document not found");
  await db.insert(auditEvents).values({ householdId: actor.householdId, eventType: "financial_document_reviewed", actor: actor.userId, entity: "financial_document", entityId: document.id, reason: input.reason, metadata: { decision: input.decision } });
  return getFinancialDocument(actor, document.id);
}

export async function listFinancialReviewQueue(actor: Actor) {
  const [documents, bankTransactions, settlements, pnls] = await Promise.all([
    db.select().from(financialDocuments).where(and(eq(financialDocuments.householdId, actor.householdId), inArray(financialDocuments.status, [...reviewableStatuses]))),
    db.select().from(bankStatementTransactions).where(and(eq(bankStatementTransactions.householdId, actor.householdId), eq(bankStatementTransactions.reviewStatus, "document_evidence_pending_review"))),
    db.select().from(settlementDocuments).where(and(eq(settlementDocuments.householdId, actor.householdId), eq(settlementDocuments.verificationStatus, "needs_review"))),
    db.select().from(profitLossDocuments).where(and(eq(profitLossDocuments.householdId, actor.householdId), eq(profitLossDocuments.verificationStatus, "needs_review"))),
  ]);
  return { items: [
    ...documents.map((row) => ({ type: "financial_document", id: row.id, status: row.status, sourceFileName: row.sourceFileName })),
    ...bankTransactions.map((row) => ({ type: "bank_statement_transaction", id: row.id, status: row.reviewStatus, description: row.description })),
    ...settlements.map((row) => ({ type: "settlement", id: row.id, status: row.verificationStatus, sourceFileName: row.sourceFileName })),
    ...pnls.map((row) => ({ type: "profit_loss", id: row.id, status: row.verificationStatus, sourceFileName: row.sourceFileName })),
  ] };
}