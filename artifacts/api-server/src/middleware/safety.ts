import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import {
  RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
  RATE_LIMIT_WINDOW_MS,
} from "../domain/reliability.ts";
import { logger } from "../lib/logger.ts";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type RateLimitDecision = {
  allowed: boolean;
  count: number;
  resetAt: Date;
};

export type RateLimitStore = {
  consume(bucketKey: string, now?: Date): Promise<RateLimitDecision>;
};

let configuredRateLimitStore: RateLimitStore | undefined;

async function postgresRateLimitStore(): Promise<RateLimitStore> {
  const { pool } = await import("@workspace/db");
  return {
    async consume(bucketKey, now = new Date()) {
      const result = await pool.query<{
        window_started_at: Date;
        request_count: number;
      }>(
        `INSERT INTO rate_limit_buckets (bucket_key, window_started_at, request_count, updated_at)
         VALUES ($1, $2, 1, $2)
         ON CONFLICT (bucket_key) DO UPDATE
         SET
           window_started_at = CASE
             WHEN rate_limit_buckets.window_started_at <= $2 - ($3 * interval '1 millisecond')
               THEN $2
             ELSE rate_limit_buckets.window_started_at
           END,
           request_count = CASE
             WHEN rate_limit_buckets.window_started_at <= $2 - ($3 * interval '1 millisecond')
               THEN 1
             ELSE rate_limit_buckets.request_count + 1
           END,
           updated_at = $2
         RETURNING window_started_at, request_count`,
        [bucketKey, now, RATE_LIMIT_WINDOW_MS],
      );
      const row = result.rows[0];
      if (!row) throw new Error("Shared rate-limit store returned no bucket row");
      return {
        allowed: row.request_count <= RATE_LIMIT_MAX_REQUESTS_PER_WINDOW,
        count: row.request_count,
        resetAt: new Date(row.window_started_at.getTime() + RATE_LIMIT_WINDOW_MS),
      };
    },
  };
}

function isProtectedMutation(req: Request) {
  return writeMethods.has(req.method);
}

function routeClass(req: Request) {
  const normalized = req.path
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id")
    .split("/")
    .filter(Boolean)
    .slice(0, 4)
    .join("/");
  return `${req.method}:${normalized || "root"}`;
}

function requestHousehold(req: Request, res: Response) {
  const localHousehold = res.locals.householdId;
  if (typeof localHousehold === "string" && localHousehold) return localHousehold;
  if (process.env.NODE_ENV === "test" && process.env.CAPITAL_OS_TEST_CONTEXT === "1") {
    return req.header("X-Test-Household-Id") ?? "unresolved";
  }
  return "unresolved";
}

export function buildRateLimitKey(req: Request, res: Response) {
  const requestAuth = (req as Request & { auth?: { userId?: string } }).auth;
  const actor = res.locals.securityContext?.userId ?? requestAuth?.userId ?? "anonymous";
  const network = req.ip ?? req.socket.remoteAddress ?? "unknown";
  return [
    routeClass(req),
    `actor:${actor}`,
    `household:${requestHousehold(req, res)}`,
    `network:${network}`,
  ].join("|");
}

export function setRateLimitStoreForTests(store: RateLimitStore | undefined) {
  configuredRateLimitStore = store;
}

async function getRateLimitStore() {
  if (configuredRateLimitStore) return configuredRateLimitStore;
  return postgresRateLimitStore();
}

export function correlationId(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header("X-Correlation-ID");
  const id = supplied && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
  res.locals.correlationId = id;
  res.setHeader("X-Correlation-ID", id);
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
}

export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const decision = await (await getRateLimitStore()).consume(buildRateLimitKey(req, res));
    if (!decision.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil((decision.resetAt.getTime() - Date.now()) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds);
      logger.warn(
        { correlationId: res.locals.correlationId, route: routeClass(req), count: decision.count },
        "Shared rate limit exceeded",
      );
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many requests; please try again shortly",
        correlationId: res.locals.correlationId,
      });
      return;
    }
    next();
  } catch (error) {
    logger.error(
      { err: error, correlationId: res.locals.correlationId, method: req.method, path: req.path },
      "Shared rate-limit store unavailable",
    );
    if (isProtectedMutation(req)) {
      res.status(503).json({
        code: "RATE_LIMITER_UNAVAILABLE",
        message: "This protected operation is temporarily unavailable",
        correlationId: res.locals.correlationId,
      });
      return;
    }
    // Availability of the limiter must not take the liveness endpoint down.
    // Read traffic is allowed through while the operator repairs the store;
    // protected writes remain fail-closed above.
    next();
  }
}

export function resetRateLimitForTests() {
  configuredRateLimitStore = undefined;
}

export function trustedProxySetting(
  env: Record<string, string | undefined> = process.env,
): false | string | string[] {
  const proxies = (env.CAPITAL_OS_TRUSTED_PROXY ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (env.NODE_ENV === "production" && proxies.length === 0) {
    throw new Error("CAPITAL_OS_TRUSTED_PROXY must identify the API ingress proxy in production");
  }
  if (proxies.length === 0) return false;
  return proxies.length === 1 ? proxies[0] : proxies;
}

export function writeBoundary(req: Request, res: Response, next: NextFunction) {
  if (!writeMethods.has(req.method)) {
    next();
    return;
  }
  const origin = req.header("Origin");
  const allowedOrigin = process.env.CAPITAL_OS_ALLOWED_ORIGIN;
  const fetchSite = req.header("Sec-Fetch-Site");
  const isTestRequest = process.env.NODE_ENV === "test" && process.env.CAPITAL_OS_TEST_CONTEXT === "1";
  if (isTestRequest && !origin) {
    next();
    return;
  }
  if (!allowedOrigin) {
    res.status(403).json({ code: "ORIGIN_POLICY_MISSING", message: "Write origin policy is not configured", correlationId: res.locals.correlationId });
    return;
  }
  if (fetchSite === "cross-site") {
    res.status(403).json({ code: "CSRF_BLOCKED", message: "Cross-site writes are not allowed", correlationId: res.locals.correlationId });
    return;
  }
  if (origin !== allowedOrigin) {
    res.status(403).json({ code: "ORIGIN_NOT_ALLOWED", message: "Write origin is not allowed", correlationId: res.locals.correlationId });
    return;
  }
  next();
}