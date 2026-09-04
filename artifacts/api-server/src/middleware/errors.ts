import type { ErrorRequestHandler, RequestHandler } from "express";
import { GovernanceError } from "../domain/governance";
import { logger } from "../lib/logger";
import { recordMetric } from "../observability/metrics";

export function asyncRoute(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function isValidationError(error: unknown): error is { name: "ZodError"; flatten: () => unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ZodError" &&
    "flatten" in error &&
    typeof error.flatten === "function"
  );
}

function isInvalidUuidError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "22P02") return true;
  if ("cause" in error && typeof error.cause === "object" && error.cause !== null) {
    return "code" in error.cause && error.cause.code === "22P02";
  }
  return false;
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const correlationId = res.locals.correlationId;
  if (isValidationError(error)) {
    res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "The request did not pass validation",
      details: error.flatten(),
      correlationId,
    });
    return;
  }
  if (isInvalidUuidError(error)) {
    res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "The request contains an invalid identifier",
      correlationId,
    });
    return;
  }
  if (error instanceof GovernanceError) {
    if (error.code === "FORBIDDEN") recordMetric("authorization_denials_total", 1, { component: "api" });
    if (error.code === "IDEMPOTENCY_CONFLICT") recordMetric("idempotency_conflict_total");
    if (error.code === "RISK_BLOCKED") {
      recordMetric("protected_capital_denial_total");
    }
    const status = error.code === "FORBIDDEN" ? 403 : error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
    res.status(status).json({ code: error.code, message: error.message, correlationId });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" && /^(08|53|57|58)/.test(error.code)) {
    recordMetric("database_errors_total", 1, { component: "postgres" });
  }
  logger.error({ err: error, method: req.method, path: req.path }, "Unhandled API error");
  res.status(500).json({ code: "INTERNAL_ERROR", message: "The request could not be completed", correlationId });
};