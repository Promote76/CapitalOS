import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptSchwabOAuthValue,
  encryptSchwabOAuthValue,
  exchangeSchwabToken,
  SchwabOAuthStateError,
  schwabAuthorizationUrl,
  schwabCallbackUrl,
} from "./schwab-oauth.ts";

const env = {
  SESSION_SECRET: "a-session-secret-that-is-long-enough-for-key-derivation",
  CAPITAL_OS_PUBLIC_ORIGIN: "https://capital-os-fund.replit.app",
  SCHWAB_APP_KEY: "test-key",
  SCHWAB_APP_SECRET: "test-secret",
};

test("Schwab OAuth callback is server-derived and token material round trips only through GCM", () => {
  assert.equal(schwabCallbackUrl(env), "https://capital-os-fund.replit.app/api/integrations/schwab/oauth/callback");
  const encrypted = encryptSchwabOAuthValue("access-token", env);
  assert.notEqual(encrypted.ciphertext, "access-token");
  assert.equal(decryptSchwabOAuthValue(encrypted, env), "access-token");
  assert.match(schwabAuthorizationUrl("A".repeat(43), env), /redirect_uri=https%3A%2F%2Fcapital-os-fund\.replit\.app/);
});

test("Schwab OAuth rejects absent public origin and tampered encrypted material", () => {
  assert.throws(() => schwabCallbackUrl({ ...env, CAPITAL_OS_PUBLIC_ORIGIN: "" }));
  const encrypted = encryptSchwabOAuthValue("access-token", env);
  assert.throws(() => decryptSchwabOAuthValue({ ...encrypted, authTag: "invalid" }, env));
});

test("Schwab OAuth encryption never preserves plaintext and rejects altered ciphertext, nonce, or tag", () => {
  const secret = "access-token-that-must-never-reach-a-client-or-database-in-plaintext";
  const encrypted = encryptSchwabOAuthValue(secret, env);
  const alter = (value: string) => `${value[0] === "A" ? "B" : "A"}${value.slice(1)}`;
  assert.doesNotMatch(JSON.stringify(encrypted), new RegExp(secret));
  assert.equal(decryptSchwabOAuthValue(encrypted, env), secret);
  for (const altered of [
    { ...encrypted, ciphertext: alter(encrypted.ciphertext) },
    { ...encrypted, nonce: alter(encrypted.nonce) },
    { ...encrypted, authTag: alter(encrypted.authTag) },
  ]) {
    assert.throws(() => decryptSchwabOAuthValue(altered, env), SchwabOAuthStateError);
  }
});

test("Schwab token exchange validates success responses and builds authorization-code requests", async () => {
  let request: RequestInit | undefined;
  const result = await exchangeSchwabToken({ code: "authorization-code" }, env, async (_url, init) => {
    request = init;
    return new Response(JSON.stringify({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 1800,
      refresh_token_expires_in: 86400,
    }), { status: 200, headers: { "content-type": "application/json" } });
  });
  assert.deepEqual(result, { accessToken: "access", refreshToken: "refresh", expiresIn: 1800, refreshTokenExpiresIn: 86400 });
  assert.equal(request?.method, "POST");
  assert.match(String(request?.headers && (request.headers as Record<string, string>).authorization), /^Basic /);
  assert.match(String(request?.body), /grant_type=authorization_code/);
  assert.match(String(request?.body), /code=authorization-code/);
  assert.match(String(request?.body), /redirect_uri=https%3A%2F%2Fcapital-os-fund\.replit\.app/);
});

test("Schwab token exchange supports a refresh response without refresh replacement", async () => {
  let body = "";
  const token = await exchangeSchwabToken({ refreshToken: "old-refresh" }, env, async (_url, init) => {
    body = String(init?.body);
    return new Response(JSON.stringify({ access_token: "new-access", expires_in: 900 }), { status: 200 });
  });
  assert.deepEqual(token, { accessToken: "new-access", refreshToken: undefined, expiresIn: 900, refreshTokenExpiresIn: undefined });
  assert.equal(body, "grant_type=refresh_token&refresh_token=old-refresh");
});

test("Schwab token exchange accepts a rotated refresh token", async () => {
  const token = await exchangeSchwabToken({ refreshToken: "old-refresh" }, env, async () =>
    new Response(JSON.stringify({ access_token: "new-access", refresh_token: "rotated-refresh", expires_in: 900, refresh_token_expires_in: 7200 }), { status: 200 }));
  assert.deepEqual(token, { accessToken: "new-access", refreshToken: "rotated-refresh", expiresIn: 900, refreshTokenExpiresIn: 7200 });
});

test("Schwab token exchange fails closed for provider failures, timeouts, and malformed responses", async () => {
  const rejected = async () => new Response("no", { status: 401 });
  const unavailable = async () => { throw new Error("timeout"); };
  const malformed = async () => new Response(JSON.stringify({ access_token: "leak", expires_in: "never" }), { status: 200 });
  await assert.rejects(() => exchangeSchwabToken({ code: "code" }, env, rejected), SchwabOAuthStateError);
  await assert.rejects(() => exchangeSchwabToken({ code: "code" }, env, unavailable), SchwabOAuthStateError);
  await assert.rejects(() => exchangeSchwabToken({ code: "code" }, env, malformed), SchwabOAuthStateError);
});