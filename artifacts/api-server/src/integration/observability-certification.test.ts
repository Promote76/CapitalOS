import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import {
  auditEvents,
  db,
  householdMembers,
  households,
  observabilityAlertDeliveries,
  observabilityAlertDestinations,
  observabilityAlertIncidents,
  observabilityAlertRules,
  users,
} from "@workspace/db";
import type { Actor } from "../services/capital-os";
import {
  OBSERVABILITY_METRIC_DEFINITIONS,
  metricSnapshot,
  metricsOpenMetrics,
  recordMetric,
  resetMetricsForCertification,
  setMetric,
} from "../observability/metrics";
import {
  ensureObservabilityRules,
  ensureObservabilityDefaults,
  evaluateObservabilityMetric,
  listObservabilityDeliveries,
  listObservabilityIncidents,
  projectObservabilityMetrics,
  reprocessObservabilityAlert,
  resolveObservabilityAlert,
  triggerObservabilityAlert,
} from "../services/observability-alerts";
import { GovernanceError } from "../domain/governance";

const enabled =
  process.env.CAPITAL_OS_RUN_OBSERVABILITY_CERTIFICATION === "1" &&
  process.env.CAPITAL_OS_CERTIFICATION_MODE === "1" &&
  Boolean(process.env.DATABASE_URL);

test(
  "Capital OS observability certification OB-01 through OB-25",
  { skip: !enabled },
  async (t) => {
    const [owner, viewer] = await db
      .insert(users)
      .values([
        {
          email: `observability-owner-${randomUUID()}@capitalos.test`,
          displayName: "Observability owner",
          status: "active",
        },
        {
          email: `observability-viewer-${randomUUID()}@capitalos.test`,
          displayName: "Observability viewer",
          status: "active",
        },
      ])
      .returning({ id: users.id });
    const [home] = await db
      .insert(households)
      .values({ name: `observability-${randomUUID()}` })
      .returning({ id: households.id });
    await db.insert(householdMembers).values([
      {
        householdId: home.id,
        userId: owner.id,
        role: "owner",
        permissions: ["read", "contribute", "approve", "manage_risk"],
        active: true,
      },
      {
        householdId: home.id,
        userId: viewer.id,
        role: "viewer",
        permissions: ["read"],
        active: true,
      },
    ]);
    const actor: Actor = {
      userId: owner.id,
      householdId: home.id,
      role: "owner",
      permissions: ["read", "contribute", "approve", "manage_risk"],
      source: "test-database",
    };
    const viewerActor: Actor = {
      userId: viewer.id,
      householdId: home.id,
      role: "viewer",
      permissions: ["read"],
      source: "test-database",
    };

    await t.test("OB-01 authenticated OpenMetrics exporter vocabulary", () => {
      resetMetricsForCertification();
      const output = metricsOpenMetrics();
      assert.match(output, /# TYPE http_requests_total counter/);
      assert.match(output, /# EOF\n$/);
    });
    await t.test("OB-02 API request, error, and duration metrics", () => {
      recordMetric("http_requests_total", 1, {
        route: "/api/test",
        status_class: "200",
      });
      recordMetric("http_request_errors_total", 1, {
        route: "/api/test",
        status_class: "500",
      });
      recordMetric("http_request_duration_ms", 12, { route: "/api/test" });
      assert.match(
        metricsOpenMetrics(),
        /http_request_duration_ms\{route="\/api\/test"\} 12/,
      );
    });
    await t.test(
      "OB-03 authentication, authorization, and tenant denial metrics",
      () => {
        for (const metric of [
          "auth_failures_total",
          "authorization_denials_total",
          "tenant_denials_total",
        ]) {
          recordMetric(metric, 1, { component: "api" });
        }
        assert.equal(
          Object.keys(metricSnapshot()).filter((key) =>
            key.includes("denials_total"),
          ).length,
          2,
        );
      },
    );
    await t.test(
      "OB-04 database readiness, errors, and query duration metrics",
      () => {
        setMetric("database_readiness", 1);
        recordMetric("database_errors_total", 1, { component: "postgres" });
        recordMetric("database_query_duration_ms", 2, {
          component: "readiness",
        });
        assert.match(metricsOpenMetrics(), /database_readiness 1/);
      },
    );
    await t.test("OB-05 financial integrity metric vocabulary", () => {
      const names = new Set(
        OBSERVABILITY_METRIC_DEFINITIONS.map((item) => item.name),
      );
      for (const name of [
        "ledger_imbalance_total",
        "idempotency_conflict_total",
        "negative_balance_prevention_total",
        "protected_capital_denial_total",
        "safe_to_deploy_invariant_failure_total",
        "audit_persistence_failure_total",
      ]) {
        assert.ok(names.has(name));
      }
    });
    await t.test(
      "OB-06 certified queue, worker, and scheduler projections",
      async () => {
        const health = await projectObservabilityMetrics(actor);
        assert.equal(typeof health.queue.queueDepth, "number");
        assert.equal(typeof health.scheduler.schedulerLagMs, "number");
      },
    );
    await t.test(
      "OB-07 execution safety and Guardian projections",
      async () => {
        const health = await projectObservabilityMetrics(actor);
        assert.equal(health.execution.microLive, "DISABLED");
        assert.equal(metricSnapshot()["micro_live_enabled|"], 0);
      },
    );
    await t.test(
      "OB-08 provider-neutral and read-only banking vocabulary",
      () => {
        const names = new Set(
          OBSERVABILITY_METRIC_DEFINITIONS.map((item) => item.name),
        );
        assert.ok(names.has("provider_auth_failure_total"));
        assert.ok(names.has("bank_replay_rejection_total"));
      },
    );
    await t.test("OB-09 cardinality and private-data guard", () => {
      assert.throws(() =>
        recordMetric("http_requests_total", 1, { household_id: home.id }),
      );
      const output = metricsOpenMetrics();
      assert.doesNotMatch(output, new RegExp(home.id, "i"));
      assert.doesNotMatch(output, /@capitalos\.test|password|secret|token/i);
    });
    await t.test("OB-10 durable alert rules", async () => {
      await ensureObservabilityRules();
      const rules = await db.select().from(observabilityAlertRules);
      assert.ok(rules.length >= 13);
      const previousTarget = process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID;
      // Use the connected workspace's operator DM so the certification records
      // a real Slack provider receipt instead of a synthetic channel name.
      process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID = "D0BUQAUMUPR";
      try {
        const first = await ensureObservabilityDefaults();
        const second = await ensureObservabilityDefaults();
        assert.equal(first.destinationConfigured, true);
        assert.equal(second.destinationConfigured, true);
        const destinations = await db.select().from(observabilityAlertDestinations);
        assert.equal(destinations.filter((row) => row.name === "slack-critical").length, 1);
        assert.ok(destinations.find((row) => row.name === "slack-critical")?.target);
      } finally {
        if (previousTarget === undefined) delete process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID;
        else process.env.CAPITAL_OS_ALERT_SLACK_CHANNEL_ID = previousTarget;
      }
    });
    await t.test("OB-11 deterministic database alert evaluation", async () => {
      process.env.CAPITAL_OS_ALERT_DELIVERY_MODE = "fail";
      const result = await evaluateObservabilityMetric(
        actor,
        "database_readiness",
        0,
        "ob-11",
      );
      assert.equal(result.length, 1);
    });
    await t.test(
      "OB-12 deterministic ledger, audit, and safe-to-deploy rules",
      async () => {
        const rules = await db.select().from(observabilityAlertRules);
        for (const key of [
          "ledger-imbalance",
          "audit-persistence-failure",
          "safe-to-deploy-failure",
        ]) {
          assert.ok(
            rules.some(
              (rule) => rule.ruleKey === key && rule.severity === "CRITICAL",
            ),
          );
        }
      },
    );
    await t.test("OB-13 deterministic operations health rules", async () => {
      const rules = await db.select().from(observabilityAlertRules);
      for (const key of [
        "dead-letter-present",
        "worker-heartbeat-stale",
        "scheduler-heartbeat-stale",
        "queue-age",
      ]) {
        assert.ok(rules.some((rule) => rule.ruleKey === key));
      }
    });
    await t.test(
      "OB-14 deterministic execution and reconciliation rules",
      async () => {
        const rules = await db.select().from(observabilityAlertRules);
        for (const key of [
          "guardian-stop",
          "execution-stop",
          "reconciliation-failure",
        ]) {
          assert.ok(rules.some((rule) => rule.ruleKey === key));
        }
      },
    );
    await t.test(
      "OB-15 deterministic provider authentication rule",
      async () => {
        const rules = await db.select().from(observabilityAlertRules);
        assert.ok(
          rules.some((rule) => rule.ruleKey === "provider-auth-failure"),
        );
      },
    );
    let incidentId = "";
    await t.test("OB-16 authorization and actor-scoped incidents", async () => {
      await assert.rejects(
        () =>
          triggerObservabilityAlert(viewerActor, "certification-test-critical"),
        (error) =>
          error instanceof GovernanceError && error.code === "FORBIDDEN",
      );
      const visible = await listObservabilityIncidents(viewerActor);
      assert.ok(visible.length >= 1);
      assert.ok(visible.every((incident) => incident.householdId === home.id));
    });
    await t.test(
      "OB-17 named Slack destination through connector transport",
      async () => {
        process.env.CAPITAL_OS_ALERT_DELIVERY_MODE = "real";
        const result = await triggerObservabilityAlert(
          actor,
          "certification-test-critical",
          "ob-real-slack",
        );
        incidentId = result.incident.id;
        assert.equal(result.delivery.status, "DELIVERED");
        const [destination] = await db
          .select()
          .from(observabilityAlertDestinations);
        assert.equal(destination.name, "slack-critical");
        assert.equal(destination.kind, "slack");
      },
    );
    await t.test("OB-18 persisted real delivery receipt", async () => {
      const deliveries = await listObservabilityDeliveries(actor, incidentId);
      assert.equal(deliveries[0]?.status, "DELIVERED");
      assert.ok(deliveries[0]?.providerReceipt);
    });
    await t.test("OB-19 incident deduplication", async () => {
      process.env.CAPITAL_OS_ALERT_DELIVERY_MODE = "fail";
      const second = await triggerObservabilityAlert(
        actor,
        "certification-test-critical",
        "ob-dedupe",
      );
      assert.equal(second.incident.id, incidentId);
      assert.equal(second.incident.occurrenceCount, 2);
    });
    await t.test("OB-20 durable retry scheduling", async () => {
      const deliveries = await db
        .select()
        .from(observabilityAlertDeliveries)
        .where(eq(observabilityAlertDeliveries.incidentId, incidentId));
      assert.ok(
        deliveries.some((delivery) => delivery.status === "RETRY_PENDING"),
      );
    });
    await t.test("OB-21 dead-letter after bounded attempts", async () => {
      const result = await reprocessObservabilityAlert(actor, incidentId);
      assert.equal(result.status, "DEAD_LETTER");
    });
    await t.test(
      "OB-22 authorized replay and real recovery delivery",
      async () => {
        process.env.CAPITAL_OS_ALERT_DELIVERY_MODE = "real";
        const replay = await reprocessObservabilityAlert(actor, incidentId);
        assert.equal(replay.status, "DELIVERED");
      },
    );
    await t.test(
      "OB-23 recovery notification and incident resolution",
      async () => {
        const resolved = await resolveObservabilityAlert(
          actor,
          incidentId,
          "Certification recovery",
        );
        assert.equal(resolved.status, "RESOLVED");
        const deliveries = await listObservabilityDeliveries(actor, incidentId);
        assert.equal(deliveries[0]?.status, "DELIVERED");
      },
    );
    await t.test(
      "OB-24 actor-attributed immutable audit evidence",
      async () => {
        const rows = await db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.entityId, incidentId));
        assert.ok(
          rows.some(
            (row) =>
              row.actor === actor.userId &&
              row.eventType === "observability_alert_triggered",
          ),
        );
        assert.ok(
          rows.some(
            (row) =>
              row.actor === actor.userId &&
              row.eventType === "observability_alert_resolved",
          ),
        );
      },
    );
    await t.test(
      "OB-25 all critical observability states remain fail-closed",
      async () => {
        const [incident] = await db
          .select()
          .from(observabilityAlertIncidents)
          .where(eq(observabilityAlertIncidents.id, incidentId));
        const deliveries = await db
          .select()
          .from(observabilityAlertDeliveries)
          .where(eq(observabilityAlertDeliveries.incidentId, incidentId));
        assert.equal(incident.status, "RESOLVED");
        assert.ok(
          deliveries.some((delivery) => delivery.status === "DEAD_LETTER"),
        );
        assert.ok(
          deliveries.some((delivery) => delivery.status === "DELIVERED"),
        );
        assert.equal(metricSnapshot()["micro_live_enabled|"], 0);
      },
    );
  },
);
