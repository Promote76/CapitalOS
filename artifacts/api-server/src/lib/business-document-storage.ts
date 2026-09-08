import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

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
  method: "GET" | "PUT";
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

export async function downloadBusinessDocument(objectPath: string) {
  assertPrivateObjectPath(objectPath);
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("Managed object storage is not configured");
  const relativePath = objectPath.replace(/^\/objects\//, "");
  const { bucketName, objectName } = parseObjectPath(`${privateDir.replace(/\/$/, "")}/${relativePath}`);
  const signedURL = await signObjectUrl({ bucketName, objectName, method: "GET" });
  const response = await fetch(signedURL, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Managed document download failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}