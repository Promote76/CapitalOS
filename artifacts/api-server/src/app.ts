import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import router from "./routes/index.ts";
import authRouter from "./routes/auth";
import healthRouter from "./routes/health";
import bankingWebhookRouter from "./routes/banking-webhooks";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { requestContext } from "./middleware/request-context";
import { errorHandler } from "./middleware/errors";
import { allowedOrigins, correlationId, rateLimit, securityHeaders, trustedProxySetting, writeBoundary } from "./middleware/safety";
import { readReliabilityConfiguration } from "./domain/reliability.ts";
import { apiMetrics } from "./observability/metrics";

const app: Express = express();

app.disable("x-powered-by");
if (process.env.NODE_ENV === "production") {
  readReliabilityConfiguration();
}
app.set("trust proxy", trustedProxySetting());
app.use(securityHeaders);
app.use(correlationId);
app.use(apiMetrics);
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
// Provider webhooks authenticate with provider signatures, not browser
// sessions or origin headers, and require the untouched request bytes.
app.use("/api", bankingWebhookRouter);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
const corsOrigins = allowedOrigins();
app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : false,
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
app.use(rateLimit);
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
