import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schwabConnections, schwabOAuthStates } from "@workspace/db";

const CALLBACK_PATH = "/api/integrations/schwab/oauth/callback";
const STATE_TTL_MS = 10 * 60 * 1000;

export class SchwabOAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchwabOAuthConfigurationError";
  }
}

export class SchwabOAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchwabOAuthStateError";
  }
}

export type EncryptedOAuthValue = {
  ciphertext: string;
  nonce: string;
  authTag: string;
};

function requiredSessionKey(env: NodeJS.ProcessEnv): Buffer {
  const secret = env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new SchwabOAuthConfigurationError("Schwab OAuth storage is not securely configured");
  }
  return createHash("sha256").update("capital-os:schwab-oauth:v1").update(secret).digest();
}

/** The browser cannot influence this origin or callback URL. */
export function schwabCallbackUrl(env: NodeJS.ProcessEnv = process.env): string {
  const rawOrigin = env.CAPITAL_OS_PUBLIC_ORIGIN;
  if (!rawOrigin) throw new SchwabOAuthConfigurationError("Schwab public origin is not configured");
  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    throw new SchwabOAuthConfigurationError("Schwab public origin is invalid");
  }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new SchwabOAuthConfigurationError("Schwab public origin must be a canonical HTTPS origin");
  }
  return `${origin.origin}${CALLBACK_PATH}`;
}

export function encryptSchwabOAuthValue(value: string, env: NodeJS.ProcessEnv = process.env): EncryptedOAuthValue {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requiredSessionKey(env), nonce);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64url"), nonce: nonce.toString("base64url"), authTag: cipher.getAuthTag().toString("base64url") };
}

export function decryptSchwabOAuthValue(value: EncryptedOAuthValue, env: NodeJS.ProcessEnv = process.env): string {
  try {
    const decipher = createDecipheriv("aes-256-gcm", requiredSessionKey(env), Buffer.from(value.nonce, "base64url"));
    decipher.setAuthTag(Buffer.from(value.authTag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    throw new SchwabOAuthStateError("Stored Schwab authorization material is invalid");
  }
}

function stateHash(state: string): string {
  return createHash("sha256").update(state).digest("base64url");
}

export async function createSchwabOAuthState(input: { householdId: string; actorUserId: string; browserBinding: string; now?: Date }): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  const lifecycleGeneration = randomBytes(32).toString("base64url");
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`schwab-lifecycle:${input.householdId}`}, 0))`);
    await tx.insert(schwabOAuthStates).values({
      stateHash: stateHash(state),
      householdId: input.householdId,
      actorUserId: input.actorUserId,
      lifecycleGeneration,
      browserBindingHash: stateHash(input.browserBinding),
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    });
    await tx.insert(schwabConnections).values({
      householdId: input.householdId,
      createdByUserId: input.actorUserId,
      status: "DISCONNECTED",
      lifecycleGeneration,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: schwabConnections.householdId,
      set: { lifecycleGeneration, updatedAt: now },
    });
  });
  return state;
}

/**
 * Atomic consume makes replay fail even if two callback requests race. The
 * recovered identity is exclusively state-bound, never callback query input.
 */
export async function consumeSchwabOAuthState(state: string, browserBinding: string, now = new Date()): Promise<{ householdId: string; actorUserId: string; createdAt: Date; lifecycleGeneration: string }> {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(state) || !/^[A-Za-z0-9_-]{40,}$/.test(browserBinding)) throw new SchwabOAuthStateError("OAuth state is invalid");
  const [consumed] = await db.update(schwabOAuthStates)
    .set({ consumedAt: now })
    .where(and(
      eq(schwabOAuthStates.stateHash, stateHash(state)),
      eq(schwabOAuthStates.browserBindingHash, stateHash(browserBinding)),
      isNull(schwabOAuthStates.consumedAt),
      gt(schwabOAuthStates.expiresAt, now),
    ))
    .returning({ householdId: schwabOAuthStates.householdId, actorUserId: schwabOAuthStates.actorUserId, createdAt: schwabOAuthStates.createdAt, lifecycleGeneration: schwabOAuthStates.lifecycleGeneration });
  if (!consumed) throw new SchwabOAuthStateError("OAuth state is expired, invalid, or already used");
  return consumed;
}

export function schwabAuthorizationUrl(state: string, env: NodeJS.ProcessEnv = process.env): string {
  const appKey = env.SCHWAB_APP_KEY;
  if (!appKey || !env.SCHWAB_APP_SECRET) throw new SchwabOAuthConfigurationError("Schwab application credentials are not configured");
  const endpoint = env.SCHWAB_AUTHORIZATION_URL ?? "https://api.schwabapi.com/v1/oauth/authorize";
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new SchwabOAuthConfigurationError("Schwab authorization endpoint is invalid");
  }
  if (url.protocol !== "https:") throw new SchwabOAuthConfigurationError("Schwab authorization endpoint must use HTTPS");
  url.searchParams.set("client_id", appKey);
  url.searchParams.set("redirect_uri", schwabCallbackUrl(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

export type SchwabTokenResponse = { accessToken: string; refreshToken?: string; expiresIn: number; refreshTokenExpiresIn?: number };

export async function exchangeSchwabToken(
  grant: { code: string } | { refreshToken: string },
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<SchwabTokenResponse> {
  const appKey = env.SCHWAB_APP_KEY;
  const secret = env.SCHWAB_APP_SECRET;
  if (!appKey || !secret) throw new SchwabOAuthConfigurationError("Schwab application credentials are not configured");
  const endpoint = env.SCHWAB_TOKEN_URL ?? "https://api.schwabapi.com/v1/oauth/token";
  let url: URL;
  try { url = new URL(endpoint); } catch { throw new SchwabOAuthConfigurationError("Schwab token endpoint is invalid"); }
  if (url.protocol !== "https:") throw new SchwabOAuthConfigurationError("Schwab token endpoint must use HTTPS");
  const body = new URLSearchParams("code" in grant
    ? { grant_type: "authorization_code", code: grant.code, redirect_uri: schwabCallbackUrl(env) }
    : { grant_type: "refresh_token", refresh_token: grant.refreshToken });
  let response: globalThis.Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${appKey}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body, signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SchwabOAuthStateError("Schwab token service is unavailable");
  }
  if (!response.ok) throw new SchwabOAuthStateError("Schwab token exchange was rejected");
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object") throw new SchwabOAuthStateError("Schwab token response is invalid");
  const token = data as Record<string, unknown>;
  if (typeof token.access_token !== "string" || typeof token.expires_in !== "number" || ("code" in grant && typeof token.refresh_token !== "string")) {
    throw new SchwabOAuthStateError("Schwab token response is invalid");
  }
  return { accessToken: token.access_token, refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : undefined, expiresIn: token.expires_in, refreshTokenExpiresIn: typeof token.refresh_token_expires_in === "number" ? token.refresh_token_expires_in : undefined };
}

/** Server-only read request seam. It accepts no write method and is used only
 * for observation endpoints by the connector. */
export async function fetchSchwabObservation(
  path: string,
  accessToken: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const base = env.SCHWAB_API_BASE_URL ?? "https://api.schwabapi.com";
  let url: URL;
  try { url = new URL(path, base); } catch { throw new SchwabOAuthConfigurationError("Schwab API endpoint is invalid"); }
  if (url.protocol !== "https:" || url.origin !== new URL(base).origin) throw new SchwabOAuthConfigurationError("Schwab API endpoint is invalid");
  let response: globalThis.Response;
  try { response = await fetcher(url, { method: "GET", headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" }, signal: AbortSignal.timeout(10_000) }); }
  catch { throw new SchwabOAuthStateError("Schwab observation service is unavailable"); }
  if (!response.ok) throw new SchwabOAuthStateError("Schwab observation request was rejected");
  return response.json().catch(() => { throw new SchwabOAuthStateError("Schwab observation response is invalid"); });
}