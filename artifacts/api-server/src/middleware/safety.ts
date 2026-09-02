import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const requestCounts = new Map<string, { windowStartedAt: number; count: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;

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

export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    requestCounts.set(key, { windowStartedAt: now, count: 1 });
    next();
    return;
  }
  current.count += 1;
  if (current.count > MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({ code: "RATE_LIMITED", message: "Too many requests; please try again shortly", correlationId: res.locals.correlationId });
    return;
  }
  next();
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