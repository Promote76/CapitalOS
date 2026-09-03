import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes/index.ts";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requestContext } from "./middleware/request-context";
import { errorHandler } from "./middleware/errors";
import { correlationId, rateLimit, securityHeaders, writeBoundary } from "./middleware/safety";

const app: Express = express();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(rateLimit);
app.use(correlationId);
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({
  origin: process.env.CAPITAL_OS_ALLOWED_ORIGIN ?? false,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Idempotency-Key", "X-Correlation-ID", "X-Test-User-Id", "X-Test-Household-Id"],
}));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(writeBoundary);

// Artifact startup probes must not wait for database seeding. Keep both the
// artifact path and the documented health endpoint as dependency-free liveness
// checks; normal API routes still initialize and validate their data context.
app.get("/api", (_req, res) => {
  res.json({ status: "ok" });
});
app.use("/api", healthRouter);
app.use("/api", authRouter);
app.use("/api", requestContext);
app.use("/api", router);
app.use(errorHandler);

export default app;
