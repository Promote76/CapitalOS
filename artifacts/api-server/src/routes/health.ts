import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { recordMetric, setMetric } from "../observability/metrics";
import { logger } from "../lib/logger";

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
    const schemaResult = await db.execute<{
      audit_events: string | null;
      audit_events_archive: string | null;
      operations_jobs: string | null;
      archive_trigger: boolean;
      observability_rules: number;
      observability_destinations: number;
    }>(sql`
      select
        to_regclass('public.audit_events')::text as audit_events,
        to_regclass('public.audit_events_archive')::text as audit_events_archive,
        to_regclass('public.operations_jobs')::text as operations_jobs,
        exists (
          select 1
          from pg_trigger
          where tgname = 'audit_events_archive_on_insert'
            and tgenabled <> 'D'
        ) as archive_trigger,
        (select count(*)::int from public.observability_alert_rules where enabled = true) as observability_rules,
        (select count(*)::int from public.observability_alert_destinations where enabled = true) as observability_destinations
    `);
    const schemaCheck = schemaResult.rows[0];
    setMetric("database_readiness", 1);
    recordMetric("database_query_duration_ms", Number(process.hrtime.bigint() - startedAt) / 1_000_000, { component: "postgres" });
    const workerEnabled = process.env.OPERATIONS_WORKER_ENABLED === "1";
    const schedulerEnabled = process.env.OPERATIONS_SCHEDULER_ENABLED === "1";
    const runtimeRequired = process.env.NODE_ENV === "production";
    const schemaReady = Boolean(
      schemaCheck?.audit_events
      && schemaCheck.audit_events_archive
      && schemaCheck.operations_jobs
      && schemaCheck.archive_trigger,
    );
    const runtimeReady = !runtimeRequired || (workerEnabled && schedulerEnabled);
    const observabilityReady = !runtimeRequired || Boolean(
      schemaCheck.observability_rules > 0 && schemaCheck.observability_destinations > 0,
    );
    if (!schemaReady || !runtimeReady || !observabilityReady) {
      const blockedComponent = !schemaReady ? "schema" : !runtimeReady ? "operations" : "observability";
      recordMetric("readiness_blocked_total", 1, { component: blockedComponent });
      res.status(503).json({
        status: "not_ready",
        code: !schemaReady
          ? "SCHEMA_NOT_READY"
          : !runtimeReady
            ? "OPERATIONS_RUNTIME_NOT_READY"
            : "OBSERVABILITY_NOT_READY",
        dependencies: {
          postgres: "ok",
          schema: schemaReady ? "ready" : "incomplete",
          auditArchive: schemaCheck?.archive_trigger ? "ready" : "unavailable",
          operationsWorker: workerEnabled ? "enabled" : "disabled",
          operationsScheduler: schedulerEnabled ? "enabled" : "disabled",
          observabilityRules: schemaCheck.observability_rules > 0 ? "ready" : "missing",
          observabilityDestination: schemaCheck.observability_destinations > 0 ? "ready" : "missing",
        },
      });
      return;
    }
    res.json({
      status: "ready",
      dependencies: {
        postgres: "ok",
        schema: "ready",
        auditArchive: "ready",
        operationsWorker: workerEnabled ? "enabled" : "disabled",
        operationsScheduler: schedulerEnabled ? "enabled" : "disabled",
        observabilityRules: "ready",
        observabilityDestination: "ready",
      },
      safety: {
        execution: "advisory_only",
        venueExecution: "disabled",
        moneyMovement: "disabled",
      },
    });
  } catch (error) {
    setMetric("database_readiness", 0);
    recordMetric("database_errors_total", 1, { component: "postgres" });
    logger.error({ err: error }, "Application readiness check failed");
    res.status(503).json({
      status: "not_ready",
      dependencies: { postgres: "unavailable" },
      code: "DATABASE_NOT_READY",
    });
  }
});

export default router;
