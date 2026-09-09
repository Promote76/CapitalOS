import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, schwabMarketDataConnections, schwabMarketDataOAuthStates } from "@workspace/db";
import { encryptSchwabOAuthValue, SchwabOAuthConfigurationError, SchwabOAuthStateError, type SchwabTokenResponse } from "./schwab-oauth";

const CALLBACK_PATH = "/api/integrations/schwab/oauth/callback";
const STATE_TTL_MS = 10 * 60 * 1000;

const stateHash = (value: string) => createHash("sha256").update(value).digest("base64url");
const lifecycleLock = (householdId: string) =>
  sql`select pg_advisory_xact_lock(hashtextextended(${`schwab-market-data-lifecycle:${householdId}`}, 0))`;

export function schwabMarketDataCallbackUrl(env: NodeJS.ProcessEnv = process.env): string {
  const rawOrigin = env.CAPITAL_OS_PUBLIC_ORIGIN;
  if (!rawOrigin) throw new SchwabOAuthConfigurationError("Schwab Market Data public origin is not configured");
  let origin: URL;
  try { origin = new URL(rawOrigin); } catch { throw new SchwabOAuthConfigurationError("Schwab Market Data public origin is invalid"); }
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new SchwabOAuthConfigurationError("Schwab Market Data public origin must be a canonical HTTPS origin");
  }
  return `${origin.origin}${CALLBACK_PATH}`;
}

export function schwabMarketDataConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SCHWAB_MARKET_DATA_APP_KEY && env.SCHWAB_MARKET_DATA_APP_SECRET);
}

export async function createSchwabMarketDataOAuthState(input: { householdId: string; actorUserId: string; browserBinding: string; now?: Date }): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  const lifecycleGeneration = randomBytes(32).toString("base64url");
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    await tx.execute(lifecycleLock(input.householdId));
    await tx.insert(schwabMarketDataOAuthStates).values({
      stateHash: stateHash(state),
      householdId: input.householdId,
      actorUserId: input.actorUserId,
      lifecycleGeneration,
      browserBindingHash: stateHash(input.browserBinding),
      expiresAt: new Date(now.getTime() + STATE_TTL_MS),
    });
    await tx.insert(schwabMarketDataConnections).values({
      householdId: input.householdId,
      createdByUserId: input.actorUserId,
      status: "DISCONNECTED",
      lifecycleGeneration,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: schwabMarketDataConnections.householdId,
      set: { lifecycleGeneration, updatedAt: now },
    });
  });
  return state;
}

export async function consumeSchwabMarketDataOAuthState(state: string, browserBinding: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{40,}$/.test(state) || !/^[A-Za-z0-9_-]{40,}$/.test(browserBinding)) throw new SchwabOAuthStateError("OAuth state is invalid");
  const [consumed] = await db.update(schwabMarketDataOAuthStates)
    .set({ consumedAt: now })
    .where(and(
      eq(schwabMarketDataOAuthStates.stateHash, stateHash(state)),
      eq(schwabMarketDataOAuthStates.browserBindingHash, stateHash(browserBinding)),
      isNull(schwabMarketDataOAuthStates.consumedAt),
      gt(schwabMarketDataOAuthStates.expiresAt, now),
    ))
    .returning({
      householdId: schwabMarketDataOAuthStates.householdId,
      actorUserId: schwabMarketDataOAuthStates.actorUserId,
      lifecycleGeneration: schwabMarketDataOAuthStates.lifecycleGeneration,
    });
  if (!consumed) throw new SchwabOAuthStateError("OAuth state is expired, invalid, or already used");
  return consumed;
}

export function schwabMarketDataAuthorizationUrl(state: string, env: NodeJS.ProcessEnv = process.env): string {
  const appKey = env.SCHWAB_MARKET_DATA_APP_KEY;
  if (!appKey || !env.SCHWAB_MARKET_DATA_APP_SECRET) throw new SchwabOAuthConfigurationError("Schwab Market Data application credentials are not configured");
  const endpoint = new URL(env.SCHWAB_AUTHORIZATION_URL ?? "https://api.schwabapi.com/v1/oauth/authorize");
  if (endpoint.protocol !== "https:") throw new SchwabOAuthConfigurationError("Schwab authorization endpoint must use HTTPS");
  endpoint.searchParams.set("client_id", appKey);
  endpoint.searchParams.set("redirect_uri", schwabMarketDataCallbackUrl(env));
  endpoint.searchParams.set("response_type", "code");
  endpoint.searchParams.set("state", state);
  return endpoint.toString();
}

export async function exchangeSchwabMarketDataToken(
  grant: { code: string } | { refreshToken: string },
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<SchwabTokenResponse> {
  const appKey = env.SCHWAB_MARKET_DATA_APP_KEY;
  const secret = env.SCHWAB_MARKET_DATA_APP_SECRET;
  if (!appKey || !secret) throw new SchwabOAuthConfigurationError("Schwab Market Data application credentials are not configured");
  const endpoint = new URL(env.SCHWAB_TOKEN_URL ?? "https://api.schwabapi.com/v1/oauth/token");
  if (endpoint.protocol !== "https:") throw new SchwabOAuthConfigurationError("Schwab token endpoint must use HTTPS");
  const body = new URLSearchParams("code" in grant
    ? { grant_type: "authorization_code", code: grant.code, redirect_uri: schwabMarketDataCallbackUrl(env) }
    : { grant_type: "refresh_token", refresh_token: grant.refreshToken });
  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${appKey}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SchwabOAuthStateError("Schwab Market Data token service is unavailable");
  }
  if (!response.ok) throw new SchwabOAuthStateError("Schwab Market Data token exchange was rejected");
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== "object") throw new SchwabOAuthStateError("Schwab Market Data token response is invalid");
  const token = value as Record<string, unknown>;
  if (typeof token.access_token !== "string" || typeof token.expires_in !== "number" || ("code" in grant && typeof token.refresh_token !== "string")) {
    throw new SchwabOAuthStateError("Schwab Market Data token response is invalid");
  }
  return {
    accessToken: token.access_token,
    refreshToken: typeof token.refresh_token === "string" ? token.refresh_token : undefined,
    expiresIn: token.expires_in,
    refreshTokenExpiresIn: typeof token.refresh_token_expires_in === "number" ? token.refresh_token_expires_in : undefined,
  };
}

export async function completeSchwabMarketDataOAuthCallback(input: { state: string; code: string; browserBinding: string }) {
  const binding = await consumeSchwabMarketDataOAuthState(input.state, input.browserBinding);
  if (!input.code || input.code.length > 4096) throw new SchwabOAuthStateError("OAuth authorization code is invalid");
  const tokens = await exchangeSchwabMarketDataToken({ code: input.code });
  if (!tokens.refreshToken) throw new SchwabOAuthStateError("Schwab Market Data refresh token is missing");
  const access = encryptSchwabOAuthValue(tokens.accessToken);
  const refresh = encryptSchwabOAuthValue(tokens.refreshToken);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.execute(lifecycleLock(binding.householdId));
    const [current] = await tx.select({ lifecycleGeneration: schwabMarketDataConnections.lifecycleGeneration })
      .from(schwabMarketDataConnections).where(eq(schwabMarketDataConnections.householdId, binding.householdId)).limit(1);
    if (current?.lifecycleGeneration !== binding.lifecycleGeneration) throw new SchwabOAuthStateError("OAuth attempt was invalidated");
    await tx.update(schwabMarketDataConnections).set({
      status: "LIVE_CONNECTED",
      accessTokenCiphertext: access.ciphertext, accessTokenNonce: access.nonce, accessTokenAuthTag: access.authTag,
      refreshTokenCiphertext: refresh.ciphertext, refreshTokenNonce: refresh.nonce, refreshTokenAuthTag: refresh.authTag,
      accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
      refreshTokenExpiresAt: tokens.refreshTokenExpiresIn ? new Date(now.getTime() + tokens.refreshTokenExpiresIn * 1000) : null,
      lastErrorCode: null,
      updatedAt: now,
    }).where(eq(schwabMarketDataConnections.householdId, binding.householdId));
  });
  return binding;
}

export { lifecycleLock as schwabMarketDataLifecycleLock };