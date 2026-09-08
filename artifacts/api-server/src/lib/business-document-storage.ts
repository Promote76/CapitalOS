import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

function privateObjectPath(objectId: string) {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("Managed object storage is not configured");
  return `${privateDir.replace(/\/$/, "")}/uploads/${objectId}`;
}

function parseObjectPath(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const [bucketName, ...objectParts] = normalized.slice(1).split("/");
  if (!bucketName || objectParts.length === 0) throw new Error("Invalid object path");
  return { bucketName, objectName: objectParts.join("/") };
}

async function signObjectUrl(input: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE";
}) {
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: input.bucketName,
      object_name: input.objectName,
      method: input.method,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Managed object storage signing failed (${response.status})`);
  const body = await response.json() as { signed_url?: string };
  if (!body.signed_url) throw new Error("Managed object storage returned no signed URL");
  return body.signed_url;
}

export function assertPrivateObjectPath(objectPath: string) {
  if (!/^\/objects\/uploads\/[0-9a-f-]{36}$/i.test(objectPath)) {
    throw new Error("Invalid managed document object path");
  }
}

export async function requestBusinessDocumentUpload() {
  const objectId = randomUUID();
  const fullPath = privateObjectPath(objectId);
  const { bucketName, objectName } = parseObjectPath(fullPath);
  return {
    uploadURL: await signObjectUrl({ bucketName, objectName, method: "PUT" }),
    objectPath: `/objects/uploads/${objectId}`,
  };
}

type UploadGrantClaims = { householdId: string; userId: string; objectPath: string; contentType: string; size: number };

export function createDocumentUploadGrant(input: UploadGrantClaims) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Session signing is not configured");
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: Date.now() + 15 * 60 * 1000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function assertDocumentUploadGrant(token: string, input: UploadGrantClaims) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Session signing is not configured");
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) throw new Error("Invalid document upload grant");
  const expected = createHmac("sha256", secret).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error("Invalid document upload grant");
  let grant: Partial<UploadGrantClaims> & { expiresAt?: number };
  try {
    grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid document upload grant");
  }
  if (grant.householdId !== input.householdId || grant.userId !== input.userId || grant.objectPath !== input.objectPath || grant.contentType !== input.contentType || grant.size !== input.size || !grant.expiresAt || grant.expiresAt < Date.now()) {
    throw new Error("Document upload grant is expired or belongs to another household");
  }
}

export async function downloadBusinessDocument(objectPath: string, limits?: { maxBytes: number; expectedBytes: number; expectedContentType: string }) {
  assertPrivateObjectPath(objectPath);
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("Managed object storage is not configured");
  const relativePath = objectPath.replace(/^\/objects\//, "");
  const { bucketName, objectName } = parseObjectPath(`${privateDir.replace(/\/$/, "")}/${relativePath}`);
  const signedURL = await signObjectUrl({ bucketName, objectName, method: "GET" });
  const response = await fetch(signedURL, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Managed document download failed (${response.status})`);
  if (limits) {
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && (declaredLength > limits.maxBytes || declaredLength !== limits.expectedBytes)) {
      throw new Error("Stored document size does not match its authorized upload");
    }
    const storedType = response.headers.get("content-type")?.split(";")[0].trim();
    if (storedType && storedType !== "application/octet-stream" && storedType !== limits.expectedContentType) {
      throw new Error("Stored document type does not match its authorized upload");
    }
  }
  if (!response.body) throw new Error("Managed document download returned no body");
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (limits && total > limits.maxBytes) {
      await response.body.cancel();
      throw new Error("Stored document exceeds the authorized size limit");
    }
    chunks.push(bytes);
  }
  if (limits && total !== limits.expectedBytes) throw new Error("Stored document size does not match its authorized upload");
  const bytes = Buffer.concat(chunks);
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function storedObjectTarget(objectPath: string) {
  assertPrivateObjectPath(objectPath);
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("Managed object storage is not configured");
  const relativePath = objectPath.replace(/^\/objects\//, "");
  return parseObjectPath(`${privateDir.replace(/\/$/, "")}/${relativePath}`);
}

export async function businessDocumentObjectExists(objectPath: string) {
  const target = storedObjectTarget(objectPath);
  const signedURL = await signObjectUrl({ ...target, method: "GET" });
  const response = await fetch(signedURL, {
    headers: { Range: "bytes=0-0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error(`Managed document preflight failed (${response.status})`);
  await response.body?.cancel();
  return true;
}

export async function assertBusinessDocumentObjectExists(objectPath: string) {
  if (!await businessDocumentObjectExists(objectPath)) throw new Error("Managed document preflight failed (404)");
}

export async function deleteBusinessDocumentObject(objectPath: string) {
  const target = storedObjectTarget(objectPath);
  const signedURL = await signObjectUrl({ ...target, method: "DELETE" });
  const response = await fetch(signedURL, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Managed document deletion failed (${response.status})`);
}