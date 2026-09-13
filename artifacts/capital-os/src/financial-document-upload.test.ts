import assert from "node:assert/strict";
import test from "node:test";
import type { FinancialDocumentUploadTarget } from "@workspace/api-client-react";
import { uploadAndIngestFinancialDocument } from "./financial-document-upload";

const target = (contentType = "application/pdf"): FinancialDocumentUploadTarget => ({
  name: "wells-fargo.pdf",
  size: 3,
  contentType,
  documentType: "BANK_STATEMENT",
  uploadURL: "https://storage.example/upload",
  objectPath: "/objects/uploads/00000000-0000-0000-0000-000000000000",
  uploadGrant: "g".repeat(40),
});

test("progresses from storage upload to ingest only after a successful PUT", async () => {
  const file = new Blob(["pdf"]);
  const events: string[] = [];
  let ingested: Record<string, unknown> | undefined;

  await uploadAndIngestFinancialDocument({
    file,
    contentType: "application/pdf",
    requestUpload: async () => {
      events.push("request-upload-url");
      return target();
    },
    fetchImpl: async (url, init) => {
      events.push("storage-put");
      assert.equal(url, "https://storage.example/upload");
      assert.equal(init?.method, "PUT");
      assert.deepEqual(init?.headers, { "Content-Type": "application/pdf" });
      assert.equal(init?.body, file);
      return new Response(null, { status: 200 });
    },
    ingest: async (input) => {
      events.push("ingest");
      ingested = input;
    },
    ingestInput: {
      documentType: "BANK_STATEMENT",
      sourceFileName: file.name || "wells-fargo.pdf",
      accountId: "account-wells-fargo",
      sourceInstitution: "Wells Fargo",
      accountDisplayName: "Checking",
    },
  });

  assert.deepEqual(events, ["request-upload-url", "storage-put", "ingest"]);
  assert.deepEqual(ingested, {
    documentType: "BANK_STATEMENT",
    sourceFileName: "wells-fargo.pdf",
    accountId: "account-wells-fargo",
    sourceInstitution: "Wells Fargo",
    accountDisplayName: "Checking",
    sourceObjectPath: target().objectPath,
    contentType: "application/pdf",
    sourceSizeBytes: file.size,
    uploadGrant: target().uploadGrant,
  });
});

test("surfaces HTTP storage failures and does not invoke ingest", async () => {
  const events: string[] = [];
  let ingestCalled = false;

  await assert.rejects(
    uploadAndIngestFinancialDocument({
      file: new Blob(["pdf"]),
      contentType: "application/pdf",
      requestUpload: async () => target(),
      fetchImpl: async () => {
        events.push("storage-put");
        return new Response("<Error><Code>SignatureDoesNotMatch</Code></Error>", {
          status: 403,
          statusText: "Forbidden",
        });
      },
      ingest: async () => {
        ingestCalled = true;
      },
      ingestInput: {
        documentType: "BANK_STATEMENT",
        sourceFileName: "wells-fargo.pdf",
      },
    }),
    /App Storage upload failed with HTTP 403 Forbidden: <Error><Code>SignatureDoesNotMatch<\/Code><\/Error>/,
  );

  assert.deepEqual(events, ["storage-put"]);
  assert.equal(ingestCalled, false);
});

test("surfaces network or CORS failures and does not invoke ingest", async () => {
  let ingestCalled = false;

  await assert.rejects(
    uploadAndIngestFinancialDocument({
      file: new Blob(["pdf"]),
      contentType: "application/pdf",
      requestUpload: async () => target(),
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
      ingest: async () => {
        ingestCalled = true;
      },
      ingestInput: {
        documentType: "BANK_STATEMENT",
        sourceFileName: "wells-fargo.pdf",
      },
    }),
    /App Storage upload failed due to a network or CORS error: Failed to fetch/,
  );

  assert.equal(ingestCalled, false);
});