import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { recordMetric, setMetric } from "../observability/metrics";
import { logger } from "../lib/logger";
import { AUDIT_VERIFICATION_MAX_AGE_MS, currentAuditMarker } from "../services/audit-backfill";

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
    const baseSchema = await db.execute<{ audit_events: string | null; audit_events_archive: string | null; audit_chain_heads: string | null; audit_backfill_state: string | null; audit_verification_state: string | null }>(sql`
      select to_regclass('public.audit_events')::text as audit_events,
        to_regclass('public.audit_events_archive')::text as audit_events_archive,
        to_regclass('public.audit_chain_heads')::text as audit_chain_heads,
        to_regclass('public.audit_backfill_state')::text as audit_backfill_state,
        to_regclass('public.audit_verification_state')::text as audit_verification_state
    `);
    const base = baseSchema.rows[0];
    if (!base?.audit_events || !base.audit_events_archive || !base.audit_chain_heads || !base.audit_backfill_state || !base.audit_verification_state) {
      setMetric("database_readiness", 0);
      res.status(503).json({ status: "not_ready", code: "SCHEMA_NOT_READY", dependencies: { postgres: "ok", schema: "incomplete" } });
      return;
    }
    const schemaResult = await db.execute<{
      audit_events: string | null;
      audit_events_archive: string | null;
      operations_jobs: string | null;
       audit_backfill_status: string | null;
       audit_missing_archive: number;
       audit_missing_digest: number;
       audit_bad_chain: number;
       audit_verification_status: string | null;
       audit_verified_at: Date | null;
        audit_verification_marker: string | null;
      observability_rules: number;
      observability_destinations: number;
    }>(sql`
      select
        to_regclass('public.audit_events')::text as audit_events,
        to_regclass('public.audit_events_archive')::text as audit_events_archive,
        to_regclass('public.operations_jobs')::text as operations_jobs,
         (select status from public.audit_backfill_state where scope = 'legacy-v1') as audit_backfill_status,
         (select count(*)::int from public.audit_events e
           left join public.audit_events_archive a on a.event_id = e.id::text
           where a.event_id is null) as audit_missing_archive,
         (select count(*)::int from public.audit_events
           where event_hash is null or event_hash = '') as audit_missing_digest,
          (select count(*)::int from public.audit_chain_heads h left join public.audit_events e
            on e.chain_key = h.chain_key and e.sequence = h.sequence
           where e.id is null or e.event_hash <> h.event_hash) as audit_bad_chain,
         (select status from public.audit_verification_state where scope = 'legacy-v1') as audit_verification_status,
         (select verified_at from public.audit_verification_state where scope = 'legacy-v1') as audit_verified_at,
          (select high_water_digest from public.audit_verification_state where scope = 'legacy-v1') as audit_verification_marker,
        (select count(*)::int from public.observability_alert_rules where enabled = true) as observability_rules,
        (select count(*)::int from public.observability_alert_destinations where enabled = true) as observability_destinations
    `);
    const schemaCheck = schemaResult.rows[0];
     const auditCurrentMarker = await currentAuditMarker();
    setMetric("database_readiness", 1);
    recordMetric("database_query_duration_ms", Number(process.hrtime.bigint() - startedAt) / 1_000_000, { component: "postgres" });
    const workerEnabled = process.env.OPERATIONS_WORKER_ENABLED === "1";
    const schedulerEnabled = process.env.OPERATIONS_SCHEDULER_ENABLED === "1";
    const runtimeRequired = process.env.NODE_ENV === "production";
    const schemaReady = Boolean(
      schemaCheck?.audit_events
      && schemaCheck.audit_events_archive
       && schemaCheck.operations_jobs,
    );
    const runtimeReady = !runtimeRequired || (workerEnabled && schedulerEnabled);
    const observabilityReady = !runtimeRequired || Boolean(
      schemaCheck.observability_rules > 0 && schemaCheck.observability_destinations > 0,
    );
     const auditBackfillReady = schemaReady && schemaCheck.audit_backfill_status === "COMPLETE";
     const auditParityReady = schemaReady && schemaCheck.audit_missing_archive === 0;
     const auditDigestReady = schemaReady && schemaCheck.audit_missing_digest === 0;
     const auditChainReady = schemaReady && schemaCheck.audit_bad_chain === 0;
     const verificationAge = schemaCheck.audit_verified_at ? Date.now() - new Date(schemaCheck.audit_verified_at).getTime() : Infinity;
     const auditVerificationReady = schemaReady && schemaCheck.audit_verification_status === "PASS";
      const auditVerificationFresh = auditVerificationReady && verificationAge <= AUDIT_VERIFICATION_MAX_AGE_MS;
      const auditVerificationCurrent = auditVerificationReady && schemaCheck.audit_verification_marker === auditCurrentMarker;
     if (!schemaReady || !auditBackfillReady || !auditParityReady || !auditDigestReady || !auditChainReady || !auditVerificationReady || !auditVerificationFresh || !auditVerificationCurrent || !runtimeReady || !observabilityReady) {
       const blockedComponent = !schemaReady ? "schema" : !auditBackfillReady ? "audit_backfill" : !auditParityReady ? "audit_parity" : !auditDigestReady ? "audit_digest" : !auditChainReady ? "audit_chain" : !auditVerificationReady ? "audit_verification" : !auditVerificationFresh || !auditVerificationCurrent ? "audit_verification_stale" : !runtimeReady ? "operations" : "observability";
      recordMetric("readiness_blocked_total", 1, { component: blockedComponent });
      res.status(503).json({
        status: "not_ready",
         code: !schemaReady
          ? "SCHEMA_NOT_READY"
          : !auditBackfillReady ? "AUDIT_BACKFILL_NOT_READY"
            : !auditParityReady ? "AUDIT_PARITY_NOT_READY"
              : !auditDigestReady ? "AUDIT_DIGEST_NOT_READY"
                : !auditChainReady ? "AUDIT_CHAIN_NOT_READY"
                  : !auditVerificationReady ? "AUDIT_CHAIN_INVALID"
                    : !auditVerificationFresh || !auditVerificationCurrent ? "AUDIT_VERIFICATION_STALE"
          : !runtimeReady
            ? "OPERATIONS_RUNTIME_NOT_READY"
            : "OBSERVABILITY_NOT_READY",
        dependencies: {
          postgres: "ok",
          schema: schemaReady ? "ready" : "incomplete",
           auditArchive: auditParityReady ? "ready" : "parity_pending",
           auditBackfill: schemaCheck.audit_backfill_status ?? "pending",
           auditDigest: auditDigestReady ? "verified" : "pending",
           auditChain: auditChainReady ? "verified" : "pending",
           auditVerification: auditVerificationFresh ? "fresh" : auditVerificationReady ? "stale" : "failed",
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
         auditBackfill: "complete",
         auditDigest: "verified",
         auditChain: "verified",
         auditVerification: "fresh",
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
