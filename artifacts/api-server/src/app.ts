import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { requestContext } from "./middleware/request-context";
import { errorHandler } from "./middleware/errors";
import { rateLimit, securityHeaders, writeBoundary } from "./middleware/safety";

const app: Express = express();

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(rateLimit);
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
app.use(cors({
  origin: process.env.CAPITAL_OS_ALLOWED_ORIGIN ?? true,
  methods: ["GET", "POST", "PATCH"],
  allowedHeaders: ["Content-Type", "Idempotency-Key", "X-Household-Role"],
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(writeBoundary);

app.use("/api", requestContext);
app.use("/api", router);
app.use(errorHandler);

export default app;
