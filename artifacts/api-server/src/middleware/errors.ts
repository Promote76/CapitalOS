import type { ErrorRequestHandler, RequestHandler } from "express";
import { GovernanceError } from "../domain/governance";
import { logger } from "../lib/logger";

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
  if (error instanceof GovernanceError) {
    const status = error.code === "FORBIDDEN" ? 403 : error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400;
    res.status(status).json({ code: error.code, message: error.message, correlationId });
    return;
  }
  logger.error({ err: error, method: req.method, path: req.path }, "Unhandled API error");
  res.status(500).json({ code: "INTERNAL_ERROR", message: "The request could not be completed", correlationId });
};