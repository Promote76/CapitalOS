import type {
  FinancialDocumentIngestInput,
  FinancialDocumentUploadTarget,
} from "@workspace/api-client-react";

const MAX_UPLOAD_ERROR_BODY_LENGTH = 2000;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type FinancialDocumentUploadFailure = {
  status?: number;
  statusText?: string;
  responseBody?: string;
  networkError?: string;
};

function formatResponseBody(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_UPLOAD_ERROR_BODY_LENGTH
    ? `${normalized.slice(0, MAX_UPLOAD_ERROR_BODY_LENGTH)}…`
    : normalized;
}

async function readResponseBody(response: Response) {
  try {
    return formatResponseBody(await response.text());
  } catch {
    return "";
  }
}

export async function uploadFinancialDocumentToStorage(
  target: FinancialDocumentUploadTarget,
  file: Blob,
  expectedContentType: string,
  fetchImpl: FetchLike = fetch,
) {
  if (target.contentType !== expectedContentType) {
    throw new Error(
      `App Storage upload target content type mismatch: expected ${expectedContentType}, received ${target.contentType}.`,
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(target.uploadURL, {
      method: "PUT",
      headers: { "Content-Type": expectedContentType },
      body: file,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`App Storage upload failed due to a network or CORS error: ${detail}`);
  }

  if (!response.ok) {
    const responseBody = await readResponseBody(response);
    const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    throw new Error(
      `App Storage upload failed with HTTP ${status}${responseBody ? `: ${responseBody}` : "."}`,
    );
  }
}

type UploadAndIngestInput = {
  file: Blob;
  contentType: string;
  requestUpload: () => Promise<FinancialDocumentUploadTarget>;
  ingest: (input: FinancialDocumentIngestInput) => Promise<unknown>;
  ingestInput: Omit<
    FinancialDocumentIngestInput,
    "sourceObjectPath" | "contentType" | "sourceSizeBytes" | "uploadGrant"
  >;
  fetchImpl?: FetchLike;
};

export async function uploadAndIngestFinancialDocument({
  file,
  contentType,
  requestUpload,
  ingest,
  ingestInput,
  fetchImpl = fetch,
}: UploadAndIngestInput) {
  const target = await requestUpload();
  await uploadFinancialDocumentToStorage(target, file, contentType, fetchImpl);
  return ingest({
    ...ingestInput,
    sourceObjectPath: target.objectPath,
    contentType,
    sourceSizeBytes: file.size,
    uploadGrant: target.uploadGrant,
  });
}