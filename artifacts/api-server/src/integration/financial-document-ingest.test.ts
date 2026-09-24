import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import test from "node:test";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  auditEvents,
  bankStatementDocuments,
  bankStatementTransactions,
  db,
  financeTransactions,
  financialDocumentParseGenerations,
  financialDocuments,
  households,
  users,
} from "@workspace/db";
import {
  createDocumentUploadGrant,
  deleteBusinessDocumentObject,
  requestBusinessDocumentUpload,
} from "../lib/business-document-storage.ts";
import { BANK_STATEMENT_PARSER_VERSION } from "../services/bank-statement-parser.ts";

const enabled = process.env.CAPITAL_OS_RUN_INTEGRATION === "1";


async function startHermeticObjectStorageSidecar() {
  const previousPrivateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  process.env.PRIVATE_OBJECT_DIR = "/capital-os-ci-private";
  const objects = new Map<string, { bytes: Buffer; contentType: string }>();
  let server: Server | null = null;

  const readBody = async (request: IncomingMessage) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks);
  };

  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1:1106");
      if (request.method === "POST" && url.pathname === "/object-storage/signed-object-url") {
        const body = JSON.parse((await readBody(request)).toString("utf8")) as {
          bucket_name?: string;
          object_name?: string;
          method?: string;
        };
        if (!body.bucket_name || !body.object_name || !body.method) {
          response.writeHead(400).end();
          return;
        }
        const token = Buffer.from(JSON.stringify({
          bucket: body.bucket_name,
          object: body.object_name,
          method: body.method,
        })).toString("base64url");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ signed_url: `http://127.0.0.1:1106/test-object/${token}` }));
        return;
      }

      const token = url.pathname.match(/^\/test-object\/([^/]+)$/)?.[1];
      if (!token) {
        response.writeHead(404).end();
        return;
      }
      const signed = JSON.parse(Buffer.from(token, "base64url").toString("utf8")) as {
        bucket: string;
        object: string;
        method: string;
      };
      if (signed.method !== request.method) {
        response.writeHead(403).end();
        return;
      }
      const key = `${signed.bucket}/${signed.object}`;
      if (request.method === "PUT") {
        const bytes = await readBody(request);
        objects.set(key, {
          bytes,
          contentType: String(request.headers["content-type"] ?? "application/octet-stream"),
        });
        response.writeHead(200).end();
        return;
      }
      if (request.method === "GET") {
        const stored = objects.get(key);
        if (!stored) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          "content-type": stored.contentType,
          "content-length": String(stored.bytes.length),
        });
        response.end(stored.bytes);
        return;
      }
      if (request.method === "DELETE") {
        objects.delete(key);
        response.writeHead(204).end();
        return;
      }
      response.writeHead(405).end();
    } catch {
      response.writeHead(500).end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(1106, "127.0.0.1", () => resolve());
  });

  return async () => {
    await new Promise<void>((resolve, reject) => {
      server!.close((error) => error ? reject(error) : resolve());
    });
    if (previousPrivateObjectDir === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = previousPrivateObjectDir;
  };
}

function representativePdf(page: string) {
  const stream = `BT /F1 5 Tf 50 750 Td ${page.split("\n").map((line, index) => `${index ? "0 -8 Td " : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" ")} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const wellsFargoPdf = representativePdf([
  "Wells Fargo Everyday Checking",
  "September 8, 2026 Page 1 of 1",
  "Statement period activity summary                                      Account number: XXXX1259",
  "Beginning balance on 8/10",
  "Deposits/Additions                                                      200.00",
  "Withdrawals/Subtractions                                              - 23.17",
  "Ending balance on 9/8                                                   $176.83",
  "Transaction history",
  "                         Check                                                                                 Deposits/        Withdrawals/       Ending daily",
  "       Date             Number Description                                                                     Additions         Subtractions          balance",
  "       8/12                    Payroll deposit                                                                    200.00                                 200.00",
  "       8/17                    Grocery purchase                                                                                  23.17           176.83",
  "      Totals                                                                                                $200.00              $23.17",
].join("\n"));

const rowParsingFailurePdf = representativePdf([
  "Wells Fargo Everyday Checking",
  "Statement period activity summary                                      Account number: XXXX1259",
  "Beginning balance on 8/10                                                  $0.00",
  "Deposits/Additions                                                      200.00",
  "Withdrawals/Subtractions                                              - 23.17",
  "Ending balance on 9/8                                                   $176.83",
].join("\n"));

test("Financial Inbox ingest persists Wells Fargo parser outcomes without creating ledger transactions", { skip: !enabled }, async () => {
  const stopObjectStorage = await startHermeticObjectStorageSidecar();
  const suffix = randomUUID();
  const [user] = await db.insert(users).values({
    email: `financial-document-ingest-${suffix}@test.invalid`,
    displayName: "Financial document ingest fixture",
    status: "active",
  }).returning();
  const [household] = await db.insert(households).values({
    name: `DISPOSABLE financial document ingest ${suffix}`,
    timezone: "UTC",
  }).returning();
  const actor = { userId: user.id, householdId: household.id, role: "owner" as const, source: "test-database" as const };
  const objectPaths: string[] = [];

  const upload = async (bytes: Buffer, fileName: string) => {
    const target = await requestBusinessDocumentUpload();
    objectPaths.push(target.objectPath);
    const uploadResponse = await fetch(target.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "Content-Length": String(bytes.length) },
      body: bytes,
    });
    assert.equal(uploadResponse.ok, true);
    return {
      documentType: "BANK_STATEMENT",
      sourceFileName: fileName,
      sourceObjectPath: target.objectPath,
      contentType: "application/pdf",
      sourceSizeBytes: bytes.length,
      uploadGrant: createDocumentUploadGrant({
        householdId: household.id,
        userId: user.id,
        objectPath: target.objectPath,
        contentType: "application/pdf",
        size: bytes.length,
      }),
    };
  };

  try {
    const successful = await (await import("../services/financial-documents.ts")).ingestFinancialDocument(actor, await upload(wellsFargoPdf, "wells-fargo-statement.pdf"));
    const successfulDocumentId = successful.id;
    const [successfulDocument] = await db.select().from(financialDocuments).where(eq(financialDocuments.id, successfulDocumentId));
    const [successfulStatement] = await db.select().from(bankStatementDocuments).where(eq(bankStatementDocuments.documentId, successfulDocumentId));
    const [successfulGeneration] = await db.select().from(financialDocumentParseGenerations).where(and(
      eq(financialDocumentParseGenerations.financialDocumentId, successfulDocumentId),
      eq(financialDocumentParseGenerations.status, "CURRENT"),
    ));
    const successfulRows = await db.select().from(bankStatementTransactions).where(eq(bankStatementTransactions.bankStatementDocumentId, successfulStatement.id)).orderBy(asc(bankStatementTransactions.postedDate));

    assert.equal(successfulDocument.sourceObjectPath, objectPaths[0]);
    assert.equal(successfulDocument.documentHash.length, 64);
    assert.equal(successfulDocument.periodStart, "2026-08-10");
    assert.equal(successfulDocument.periodEnd, "2026-09-08");
    assert.equal(successfulDocument.parserVersion, BANK_STATEMENT_PARSER_VERSION);
    assert.equal(successfulDocument.sourceRecordType, "bank_statement_document");
    assert.equal(successfulDocument.sourceRecordId, successfulStatement.id);
    assert.equal(successfulDocument.sourceMetadata.parserVersion, BANK_STATEMENT_PARSER_VERSION);
    assert.equal(successfulDocument.sourceMetadata.parserErrorKind, null);
    assert.deepEqual(successfulDocument.sourceMetadata.parserErrors, []);
    assert.equal(successfulDocument.sourceMetadata.extractedAccountLastFour, "1259");
    assert.equal(successfulDocument.sourceMetadata.extractedStatementStart, "2026-08-10");
    assert.equal(successfulDocument.sourceMetadata.extractedStatementEnd, "2026-09-08");
    assert.equal(successfulStatement.accountMask, "1259");
    assert.equal(successfulStatement.statementStart, "2026-08-10");
    assert.equal(successfulStatement.statementEnd, "2026-09-08");
    assert.equal(successfulStatement.openingBalance, null);
    assert.equal(successfulStatement.totalDeposits, "200.00");
    assert.equal(successfulStatement.totalWithdrawals, "23.17");
    assert.equal(successfulStatement.closingBalance, "176.83");
    assert.equal(successfulRows.length, 2);
    assert.deepEqual(successfulRows.map((row) => [row.postedDate, row.amount, row.direction]), [
      ["2026-08-12", "200.00", "deposit"],
      ["2026-08-17", "23.17", "withdrawal"],
    ]);
    assert.equal(successfulGeneration.parserVersion, BANK_STATEMENT_PARSER_VERSION);
    assert.equal(successfulGeneration.extractionStatus, "complete");
    assert.equal(successfulGeneration.sourceRecordType, "bank_statement_document");
    assert.equal(successfulGeneration.sourceRecordId, successfulStatement.id);
    assert.equal(successfulGeneration.evidence.parserErrorKind, null);
    assert.deepEqual(successfulGeneration.evidence.parserErrors, []);
    assert.equal(successfulGeneration.evidence.extractedAccountLastFour, "1259");
    assert.equal(successfulGeneration.evidence.extractedStatementStart, "2026-08-10");
    assert.equal(successfulGeneration.evidence.extractedStatementEnd, "2026-09-08");

    // Simulate a stale parent rejection from an earlier parser generation while
    // preserving the valid source bytes. A parser retry creates a new evidence
    // generation, so the obsolete parent review decision must be invalidated.
    await db.delete(bankStatementTransactions).where(eq(bankStatementTransactions.bankStatementDocumentId, successfulStatement.id));
    await db.update(financialDocuments).set({
      status: "REJECTED",
      reviewDecision: "REJECTED",
      reviewReason: "Rejected while the previous parser generation was unavailable.",
      reviewedBy: user.id,
      reviewedAt: new Date(),
      sourceMetadata: {
        ...(successfulDocument.sourceMetadata ?? {}),
        parserErrorKind: "extraction",
        parserErrors: ["Previous parser generation could not extract this preserved source."],
      },
    }).where(eq(financialDocuments.id, successfulDocumentId));
    await db.update(bankStatementDocuments).set({ status: "document_evidence_rejected" }).where(eq(bankStatementDocuments.id, successfulStatement.id));

    const retryResult = await (await import("../services/financial-documents.ts")).retryBankStatementParser(actor, successfulDocumentId, {
      reason: "Re-read preserved source after parser recovery.",
      idempotencyKey: randomUUID(),
    }) as {
      reviewDecision: string | null;
      reviewReason: string | null;
      status: string;
      sourceMetadata: { parserErrors?: unknown[] };
      transactions?: unknown[];
    };
    assert.equal(retryResult.reviewDecision, null);
    assert.equal(retryResult.reviewReason, null);
    assert.equal(retryResult.status, "NEEDS_REVIEW");
    assert.deepEqual(retryResult.sourceMetadata.parserErrors, []);
    assert.equal(retryResult.transactions?.length, 2);
    const [retriedDocument] = await db.select().from(financialDocuments).where(eq(financialDocuments.id, successfulDocumentId));
    assert.equal(retriedDocument.reviewDecision, null);
    assert.equal(retriedDocument.reviewReason, null);
    assert.equal(retriedDocument.reviewedBy, null);
    assert.equal(retriedDocument.reviewedAt, null);

    const rowParsingFailure = await (await import("../services/financial-documents.ts")).ingestFinancialDocument(actor, await upload(rowParsingFailurePdf, "wells-fargo-row-parsing-failure.pdf"));
    const [rowParsingDocument] = await db.select().from(financialDocuments).where(eq(financialDocuments.id, rowParsingFailure.id));
    const [rowParsingGeneration] = await db.select().from(financialDocumentParseGenerations).where(and(
      eq(financialDocumentParseGenerations.financialDocumentId, rowParsingFailure.id),
      eq(financialDocumentParseGenerations.status, "CURRENT"),
    ));
    assert.equal(rowParsingDocument.sourceMetadata.parserErrorKind, "row_parsing");
    assert.deepEqual(rowParsingDocument.sourceMetadata.parserErrors, ["No unambiguous transaction rows were found in the PDF."]);
    assert.equal(rowParsingGeneration.extractionStatus, "failed");
    assert.equal(rowParsingGeneration.evidence.parserErrorKind, "row_parsing");
    assert.deepEqual(rowParsingGeneration.evidence.parserErrors, rowParsingDocument.sourceMetadata.parserErrors);
    assert.equal(rowParsingGeneration.evidence.parserErrorKind, "row_parsing");

    const extractionFailure = await (await import("../services/financial-documents.ts")).ingestFinancialDocument(actor, await upload(Buffer.from("%PDF-"), "wells-fargo-extraction-failure.pdf"));
    const [extractionDocument] = await db.select().from(financialDocuments).where(eq(financialDocuments.id, extractionFailure.id));
    const [extractionGeneration] = await db.select().from(financialDocumentParseGenerations).where(and(
      eq(financialDocumentParseGenerations.financialDocumentId, extractionFailure.id),
      eq(financialDocumentParseGenerations.status, "CURRENT"),
    ));
    assert.equal(extractionDocument.sourceMetadata.parserErrorKind, "extraction");
    assert.deepEqual(extractionDocument.sourceMetadata.parserErrors, ["PDF extraction failed: the PDF structure is malformed, incomplete, or corrupt. Retry the preserved source only if the original file is known to be readable; otherwise upload a fresh copy."]);
    assert.equal(extractionGeneration.evidence.parserErrorKind, "extraction");
    assert.notDeepEqual(extractionGeneration.evidence.parserErrors, rowParsingGeneration.evidence.parserErrors);

    assert.equal((await db.select().from(financeTransactions).where(eq(financeTransactions.householdId, household.id))).length, 0);
  } finally {
    await Promise.all(objectPaths.map((objectPath) => deleteBusinessDocumentObject(objectPath)));
    await stopObjectStorage();
    await db.delete(auditEvents).where(eq(auditEvents.householdId, household.id));
    await db.delete(households).where(eq(households.id, household.id));
    await db.delete(users).where(inArray(users.id, [user.id]));
  }
});