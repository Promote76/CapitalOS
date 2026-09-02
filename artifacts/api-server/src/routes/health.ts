import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

function live(_req: Request, res: Response) {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
}

router.get("/health/live", live);
router.get("/healthz", live);

router.get("/health/ready", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ready", dependencies: { postgres: "ok" } });
  } catch {
    res.status(503).json({
      status: "not_ready",
      dependencies: { postgres: "unavailable" },
      code: "DATABASE_NOT_READY",
    });
  }
});

export default router;
