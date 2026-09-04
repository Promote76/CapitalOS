import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { recordMetric, setMetric } from "../observability/metrics";

const router: IRouter = Router();

function live(_req: Request, res: Response) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

router.get("/health/live", live);
router.get("/healthz", live);

router.get("/health/ready", async (_req, res) => {
  const startedAt = process.hrtime.bigint();
  try {
    await db.execute(sql`select 1`);
    setMetric("database_readiness", 1);
    recordMetric("database_query_duration_ms", Number(process.hrtime.bigint() - startedAt) / 1_000_000, { component: "postgres" });
    res.json({ status: "ready", dependencies: { postgres: "ok" } });
  } catch {
    setMetric("database_readiness", 0);
    recordMetric("database_errors_total", 1, { component: "postgres" });
    res.status(503).json({
      status: "not_ready",
      dependencies: { postgres: "unavailable" },
      code: "DATABASE_NOT_READY",
    });
  }
});

export default router;
