import { FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  Activity,
  ArchiveRestore,
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ListChecks,
  LockKeyhole,
  Play,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Workflow,
  X,
  RadioTower,
  Eye,
  RotateCcw,
  CheckSquare,
} from "lucide-react";
import {
  getGetOperationsOverviewQueryKey,
  getGetOperationsJobMetricsQueryKey,
  getGetOperationsNotificationPreferencesQueryKey,
  getListOperationsAlertsQueryKey,
  getListOperationsApprovalsQueryKey,
  getListOperationsAutomationsQueryKey,
  getListOperationsTasksQueryKey,
  getListOperationsJobsQueryKey,
  getListOperationsSchedulersQueryKey,
  getListOperationsWorkerHealthQueryKey,
  getListObservabilityIncidentsQueryKey,
  getGetObservabilityHealthQueryKey,
  useCreateOperationsTask,
  useDecideOperationsApproval,
  useGetOperationsNotificationPreferences,
  useGetOperationsOverview,
  useGetOperationsJobMetrics,
  useListOperationsAlerts,
  useListOperationsApprovals,
  useListOperationsAutomations,
  useListOperationsTasks,
  useListOperationsJobs,
  useListOperationsSchedulers,
  useListOperationsWorkerHealth,
  useReprocessOperationsJob,
  useAcquireOperationsSchedulerLeadership,
  useRecoverMissedOperationsSchedules,
  useRunOperationsAutomation,
  useUpdateOperationsAlert,
  useUpdateOperationsNotificationPreferences,
  useUpdateOperationsTask,
  useGetObservabilityHealth,
  useListObservabilityIncidents,
  useResolveObservabilityIncident,
  useReprocessObservabilityIncident,
  useListObservabilityIncidentDeliveries,
  type OperationsAlert,
  type OperationsApproval,
  type OperationsAutomation,
  type OperationsJob,
  type OperationsScheduler,
  type OperationsWorker,
  type OperationsNotificationPreferences,
  type OperationsTask,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProviderProtectedAction } from "@/lib/reverification";

// Observability Types (Local, Safe Views)
type ObservabilityHealthView = {
  status: "OK" | "DEGRADED" | "UNKNOWN";
  nodes: {
    queue: { status: "OK" | "DEGRADED" | "UNKNOWN"; message: string };
    scheduler: { status: "OK" | "DEGRADED" | "UNKNOWN"; message: string };
    worker: { status: "OK" | "DEGRADED" | "UNKNOWN"; message: string };
    executionControl: {
      status: "OK" | "DEGRADED" | "DISABLED" | "UNKNOWN";
      message: string;
    };
    guardian: {
      status: "OK" | "DEGRADED" | "DISABLED" | "UNKNOWN";
      message: string;
    };
    microLive: {
      status: "OK" | "DEGRADED" | "DISABLED" | "UNKNOWN";
      message: string;
    };
  };
  openIncidents: number;
};

type IncidentView = {
  id: string;
  type: string;
  status: "OPEN" | "RESOLVED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
  message: string;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
};

type DeliveryView = {
  id: string;
  destination: string;
  status: "PENDING" | "DELIVERED" | "FAILED" | "UNKNOWN";
  timestamp: string;
};

// Safe cast functions for unknown generated responses
function parseHealth(raw: unknown): ObservabilityHealthView {
  const data = raw as any;
  if (!data || typeof data !== "object")
    return {
      status: "UNKNOWN",
      nodes: {
        queue: { status: "UNKNOWN", message: "No data" },
        scheduler: { status: "UNKNOWN", message: "No data" },
        worker: { status: "UNKNOWN", message: "No data" },
        executionControl: { status: "UNKNOWN", message: "No data" },
        guardian: { status: "UNKNOWN", message: "No data" },
        microLive: { status: "UNKNOWN", message: "No data" },
      },
      openIncidents: 0,
    };

  const parseNode = (node: any) => ({
    status:
      node?.status && ["OK", "DEGRADED", "DISABLED"].includes(node.status)
        ? node.status
        : "UNKNOWN",
    message:
      typeof node?.message === "string" ? node.message : "Status unknown",
  });

  return {
    status:
      data.status === "OK" || data.status === "DEGRADED"
        ? data.status
        : "UNKNOWN",
    nodes: {
      queue: parseNode(data.nodes?.queue),
      scheduler: parseNode(data.nodes?.scheduler),
      worker: parseNode(data.nodes?.worker),
      executionControl: parseNode(data.nodes?.executionControl),
      guardian: parseNode(data.nodes?.guardian),
      microLive: parseNode(data.nodes?.microLive),
    },
    openIncidents:
      typeof data.openIncidents === "number" ? data.openIncidents : 0,
  };
}

function parseIncidents(raw: unknown): IncidentView[] {
  const data = raw as any;
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    id: typeof item?.id === "string" ? item.id : "unknown",
    type: typeof item?.type === "string" ? item.type : "System Event",
    status: item?.status === "RESOLVED" ? "RESOLVED" : "OPEN",
    severity:
      item?.severity &&
      ["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(item.severity)
        ? item.severity
        : "UNKNOWN",
    message:
      typeof item?.message === "string" ? item.message : "No message provided",
    createdAt:
      typeof item?.createdAt === "string"
        ? item.createdAt
        : new Date().toISOString(),
    resolvedAt:
      typeof item?.resolvedAt === "string" ? item.resolvedAt : undefined,
    resolutionNote:
      typeof item?.resolutionNote === "string"
        ? item.resolutionNote
        : undefined,
  }));
}

function parseDeliveries(raw: unknown): DeliveryView[] {
  const data = raw as any;
  if (!Array.isArray(data)) return [];
  return data.map((item) => ({
    id: typeof item?.id === "string" ? item.id : "unknown",
    destination:
      typeof item?.destination === "string"
        ? item.destination
        : "Unknown channel",
    status:
      item?.status && ["PENDING", "DELIVERED", "FAILED"].includes(item.status)
        ? item.status
        : "UNKNOWN",
    timestamp:
      typeof item?.timestamp === "string"
        ? item.timestamp
        : new Date().toISOString(),
  }));
}

type Feedback = (message: string) => void;
type TaskStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "DISMISSED"
  | "EXPIRED";
type ApprovalDecision = "APPROVED" | "REJECTED" | "DEFERRED";

const taskStatuses: TaskStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "BLOCKED",
  "COMPLETED",
  "DISMISSED",
  "EXPIRED",
];
type NotificationGroupKey = Exclude<
  keyof OperationsNotificationPreferences,
  "quietHoursStart" | "quietHoursEnd"
>;
const notificationGroups: Array<{ key: NotificationGroupKey; label: string }> =
  [
    { key: "criticalAlerts", label: "Critical alerts" },
    { key: "bills", label: "Bills" },
    { key: "budget", label: "Budget" },
    { key: "duplexGoal", label: "Duplex goal" },
    { key: "property", label: "Property" },
    { key: "strategies", label: "Strategies" },
    { key: "accounting", label: "Accounting" },
    { key: "security", label: "Security" },
    { key: "weeklyReports", label: "Weekly reports" },
    { key: "monthlyReports", label: "Monthly reports" },
  ];

function titleCase(value: string | null | undefined) {
  return (value || "Unassigned")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null | undefined, fallback = "No date") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statusTone(value: string) {
  const normalized = value.toLowerCase();
  if (
    normalized.includes("critical") ||
    normalized.includes("blocked") ||
    normalized.includes("high")
  )
    return "review";
  if (
    normalized.includes("pending") ||
    normalized.includes("waiting") ||
    normalized.includes("medium")
  )
    return "pending";
  return "";
}

function OperationsSkeleton() {
  return (
    <div
      className="operations-skeleton"
      aria-label="Loading operations command center"
    >
      <div className="skeleton operations-skeleton-banner" />
      <div className="operations-skeleton-metrics">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <div className="operations-skeleton-columns">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}

function OperationsError({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className="card card-pad operations-inline-error"
      role="alert"
      data-testid="status-operations-error"
    >
      <AlertCircle size={19} />
      <div>
        <strong>Operations view is temporarily unavailable.</strong>
        <span>
          No household actions were changed. Try again when the service is
          ready.
        </span>
      </div>
      <button
        className="btn"
        type="button"
        onClick={onRetry}
        data-testid="button-retry-operations"
      >
        Try again
      </button>
    </section>
  );
}

function OperationsMetric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: string;
}) {
  return (
    <div className={`operations-metric ${tone}`}>
      <span className="operations-kicker">{label}</span>
      <strong
        data-testid={`text-operations-${label.toLowerCase().replaceAll(" ", "-")}`}
      >
        {value}
      </strong>
      <span>{detail}</span>
    </div>
  );
}

function TaskRow({
  task,
  onUpdate,
  pending,
}: {
  task: OperationsTask;
  onUpdate: (id: string, status: TaskStatus) => void;
  pending: boolean;
}) {
  const nextStatus =
    task.status === "COMPLETED"
      ? "OPEN"
      : task.status === "IN_PROGRESS"
        ? "COMPLETED"
        : "IN_PROGRESS";
  return (
    <article
      className={`operations-task-row ${task.status === "COMPLETED" ? "complete" : ""}`}
      data-testid={`row-operations-task-${task.id}`}
    >
      <div
        className={`operations-task-check ${task.status === "COMPLETED" ? "checked" : ""}`}
      >
        {task.status === "COMPLETED" ? (
          <Check size={14} />
        ) : (
          <Clock3 size={14} />
        )}
      </div>
      <div className="operations-task-copy">
        <div className="operations-task-title">
          <strong data-testid={`text-operations-task-title-${task.id}`}>
            {task.title}
          </strong>
          <span
            className={`status ${statusTone(task.priority)}`}
            data-testid={`status-operations-task-${task.id}`}
          >
            {titleCase(task.priority)}
          </span>
        </div>
        <p>{task.description}</p>
        <div className="operations-task-meta">
          <span>
            <CalendarClock size={12} /> {dateLabel(task.dueDate)}
          </span>
          <span>
            <UserRound size={12} /> {task.assignedTo || "Household"}
          </span>
          <span>{titleCase(task.domain)}</span>
        </div>
      </div>
      <button
        className="btn operations-task-action"
        type="button"
        disabled={pending}
        onClick={() => onUpdate(task.id, nextStatus)}
        data-testid={`button-update-task-${task.id}`}
      >
        {pending
          ? "Saving…"
          : task.status === "COMPLETED"
            ? "Reopen"
            : task.status === "IN_PROGRESS"
              ? "Complete"
              : "Start"}
      </button>
    </article>
  );
}

function ApprovalCard({
  approval,
  onDecide,
  pending,
}: {
  approval: OperationsApproval;
  onDecide: (
    approval: OperationsApproval,
    decision: ApprovalDecision,
    reason: string,
  ) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  const isPending = approval.status === "PENDING";
  return (
    <article
      className="operations-approval-card"
      data-testid={`card-operations-approval-${approval.id}`}
    >
      <div className="operations-approval-top">
        <div>
          <span className="operations-kicker">
            {titleCase(approval.requestType)}
          </span>
          <h3>{approval.relatedEntity}</h3>
        </div>
        <span
          className={`status ${statusTone(approval.status)}`}
          data-testid={`status-operations-approval-${approval.id}`}
        >
          {titleCase(approval.status)}
        </span>
      </div>
      <div className="operations-approval-states">
        <div>
          <span>Current</span>
          <strong>{approval.currentState}</strong>
        </div>
        <div className="operations-state-arrow">→</div>
        <div>
          <span>Proposed</span>
          <strong>{approval.proposedState}</strong>
        </div>
      </div>
      <p className="operations-approval-reason">{approval.reason}</p>
      <div className="operations-approval-facts">
        <span>
          <b>Financial</b>
          {approval.financialImpact}
        </span>
        <span>
          <b>Risk</b>
          {approval.riskImpact}
        </span>
        <span>
          <b>Duplex plan</b>
          {approval.duplexImpact}
        </span>
      </div>
      {approval.evidence.length > 0 && (
        <div className="operations-evidence">
          <b>Evidence</b>
          {approval.evidence.map((item) => (
            <span key={item}>
              <CheckCircle2 size={12} />
              {item}
            </span>
          ))}
        </div>
      )}
      {isPending && (
        <>
          <div className="operations-decision-instruction">
            <strong>Decision record required</strong>
            <span>
              Add a short reason below to enable Approve, Defer, or Reject.
              Capital-changing decisions may also ask you to verify your Clerk
              session.
            </span>
          </div>
          <textarea
            className="operations-reason-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Add a short decision record"
            maxLength={1000}
            data-testid={`input-approval-reason-${approval.id}`}
          />
          <div className="operations-approval-actions">
            <button
              className="btn btn-primary"
              type="button"
              disabled={pending || reason.trim().length < 1}
              onClick={() => onDecide(approval, "APPROVED", reason.trim())}
              data-testid={`button-approve-operations-${approval.id}`}
            >
              <Check size={14} /> Approve
            </button>
            <button
              className="btn"
              type="button"
              disabled={pending || reason.trim().length < 1}
              onClick={() => onDecide(approval, "DEFERRED", reason.trim())}
              data-testid={`button-defer-operations-${approval.id}`}
            >
              Defer
            </button>
            <button
              className="btn btn-quiet-danger"
              type="button"
              disabled={pending || reason.trim().length < 1}
              onClick={() => onDecide(approval, "REJECTED", reason.trim())}
              data-testid={`button-reject-operations-${approval.id}`}
            >
              <X size={14} /> Reject
            </button>
          </div>
        </>
      )}
    </article>
  );
}

function AlertRow({
  alert,
  onUpdate,
  pending,
}: {
  alert: OperationsAlert;
  onUpdate: (
    id: string,
    status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED",
  ) => void;
  pending: boolean;
}) {
  return (
    <article
      className={`operations-alert-row ${alert.severity === "CRITICAL" || alert.severity === "HIGH" ? "alert-high" : ""}`}
      data-testid={`row-operations-alert-${alert.id}`}
    >
      <div className="operations-alert-icon">
        <AlertCircle size={15} />
      </div>
      <div className="operations-alert-copy">
        <div>
          <strong>{alert.title}</strong>
          <span
            className={`status ${statusTone(alert.severity)}`}
            data-testid={`status-operations-alert-${alert.id}`}
          >
            {titleCase(alert.severity)}
          </span>
        </div>
        <p>{alert.message}</p>
        <small>
          {titleCase(alert.domain)} · seen {dateLabel(alert.lastSeen)} ·{" "}
          {alert.occurrenceCount} occurrence
          {alert.occurrenceCount === 1 ? "" : "s"}
        </small>
      </div>
      {alert.status === "ACTIVE" && (
        <div className="operations-alert-actions">
          <button
            className="btn"
            type="button"
            disabled={pending}
            onClick={() => onUpdate(alert.id, "ACKNOWLEDGED")}
            data-testid={`button-acknowledge-alert-${alert.id}`}
          >
            Acknowledge
          </button>
          <button
            className="icon-btn"
            type="button"
            disabled={pending}
            aria-label={`Resolve ${alert.title}`}
            onClick={() => onUpdate(alert.id, "RESOLVED")}
            data-testid={`button-resolve-alert-${alert.id}`}
          >
            <Check size={14} />
          </button>
        </div>
      )}
      {alert.status !== "ACTIVE" && (
        <span className="operations-alert-resolved">
          <CheckCircle2 size={14} /> {titleCase(alert.status)}
        </span>
      )}
    </article>
  );
}

function jobStatusTone(status: string) {
  if (status === "DEAD_LETTER") return "review";
  if (status === "RETRY_PENDING" || status === "LEASED" || status === "RUNNING")
    return "pending";
  return "";
}

function DeliveryList({ incidentId }: { incidentId: string }) {
  const deliveriesQuery = useListObservabilityIncidentDeliveries(incidentId);
  const deliveries = parseDeliveries(deliveriesQuery.data);

  if (deliveriesQuery.isLoading)
    return (
      <div className="deliveries-box">
        <span className="deliveries-title">Loading deliveries...</span>
      </div>
    );
  if (!deliveries.length)
    return (
      <div className="deliveries-box">
        <span className="deliveries-title">No delivery attempts recorded</span>
      </div>
    );

  return (
    <div className="deliveries-box">
      <div className="deliveries-title">Delivery Status</div>
      {deliveries.map((d) => (
        <div key={d.id} className="delivery-row">
          <span>{d.destination}</span>
          <span
            className={`delivery-status ${d.status === "FAILED" ? "delivery-failed" : ""}`}
          >
            {d.status} • {dateLabel(d.timestamp)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ObservabilityPanel({
  onFeedback,
  refreshAll,
}: {
  onFeedback: Feedback;
  refreshAll: () => void;
}) {
  const queryClient = useQueryClient();
  const healthQuery = useGetObservabilityHealth();
  const incidentsQuery = useListObservabilityIncidents();
  const resolveIncident = useResolveObservabilityIncident();
  const reprocessIncident = useReprocessObservabilityIncident();
  const [resolvingId, setResolvingId] = useState("");
  const [reprocessingId, setReprocessingId] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: getGetObservabilityHealthQueryKey(),
    });
    void queryClient.invalidateQueries({
      queryKey: getListObservabilityIncidentsQueryKey(),
    });
    refreshAll();
  };

  const handleResolve = async (id: string, note: string) => {
    setResolvingId(id);
    try {
      // NOTE: Our generated API type does not actually document note param in resolve mutation,
      // but instruction says: "- useResolveObservabilityIncident(options?) — mutation (incidentId, data {note})."
      // We will cast to any since the types are currently unknown or mismatched.
      await (resolveIncident as any).mutateAsync({
        incidentId: id,
        data: { note },
      });
      invalidate();
      onFeedback("Incident resolved.");
      setResolutionNote("");
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "Could not resolve incident.",
      );
    } finally {
      setResolvingId("");
    }
  };

  const handleReprocess = async (id: string) => {
    setReprocessingId(id);
    try {
      await reprocessIncident.mutateAsync({ incidentId: id });
      invalidate();
      onFeedback("Delivery reprocessing scheduled.");
    } catch (error) {
      onFeedback(
        error instanceof Error
          ? error.message
          : "Could not reprocess delivery.",
      );
    } finally {
      setReprocessingId("");
    }
  };

  const healthData = parseHealth(healthQuery.data);
  const incidents = parseIncidents(incidentsQuery.data);

  return (
    <section className="card card-pad operations-runtime observability-panel animate-in delay-2">
      <div className="operations-section-heading">
        <div>
          <span className="operations-kicker">Live Telemetry</span>
          <h2>Platform Observability</h2>
          <p>
            Real-time node health, execution-control boundaries, and
            actor-scoped incidents.
          </p>
        </div>
        <RadioTower size={18} />
      </div>

      <div className="observability-grid">
        <div
          className={`observability-node ${healthData.nodes.queue.status === "OK" ? "node-ok" : "node-warning"}`}
        >
          <div className="node-head">
            <span className="node-title">Queue</span>
            <span className="node-state">{healthData.nodes.queue.status}</span>
          </div>
          <p className="node-message">{healthData.nodes.queue.message}</p>
        </div>
        <div
          className={`observability-node ${healthData.nodes.scheduler.status === "OK" ? "node-ok" : "node-warning"}`}
        >
          <div className="node-head">
            <span className="node-title">Scheduler</span>
            <span className="node-state">
              {healthData.nodes.scheduler.status}
            </span>
          </div>
          <p className="node-message">{healthData.nodes.scheduler.message}</p>
        </div>
        <div
          className={`observability-node ${healthData.nodes.worker.status === "OK" ? "node-ok" : "node-warning"}`}
        >
          <div className="node-head">
            <span className="node-title">Worker</span>
            <span className="node-state">{healthData.nodes.worker.status}</span>
          </div>
          <p className="node-message">{healthData.nodes.worker.message}</p>
        </div>
        <div
          className={`observability-node ${healthData.nodes.executionControl.status === "OK" ? "node-ok" : healthData.nodes.executionControl.status === "DISABLED" ? "node-disabled" : "node-warning"}`}
        >
          <div className="node-head">
            <span className="node-title">Execution Control</span>
            <span className="node-state">
              {healthData.nodes.executionControl.status}
            </span>
          </div>
          <p className="node-message">
            {healthData.nodes.executionControl.message}
          </p>
        </div>
        <div
          className={`observability-node ${healthData.nodes.guardian.status === "OK" ? "node-ok" : healthData.nodes.guardian.status === "DISABLED" ? "node-disabled" : "node-warning"}`}
        >
          <div className="node-head">
            <span className="node-title">Guardian</span>
            <span className="node-state">
              {healthData.nodes.guardian.status}
            </span>
          </div>
          <p className="node-message">{healthData.nodes.guardian.message}</p>
        </div>
        <div
          className={`observability-node ${healthData.nodes.microLive.status === "OK" ? "node-ok" : healthData.nodes.microLive.status === "DISABLED" ? "node-disabled" : "node-warning"}`}
        >
          <div className="node-head">
            <span className="node-title">Micro-Live</span>
            <span className="node-state">
              {healthData.nodes.microLive.status}
            </span>
          </div>
          <p className="node-message">{healthData.nodes.microLive.message}</p>
        </div>
      </div>

      <div className="incidents-section">
        <div className="incidents-title">
          <Eye size={16} /> Actor-Scoped Incidents{" "}
          {incidents.length > 0 && (
            <span className="status">
              {incidents.length} record{incidents.length !== 1 && "s"}
            </span>
          )}
        </div>
        {incidentsQuery.isLoading && (
          <div className="operations-loading-line">Reading incidents…</div>
        )}
        {!incidentsQuery.isLoading && incidents.length === 0 && (
          <div className="operations-empty-line">
            <CheckSquare size={14} /> No incidents recorded for this actor
            scope.
          </div>
        )}

        {incidents.length > 0 && (
          <div className="incidents-list">
            {incidents.map((inc) => (
              <div key={inc.id} className="incident-item">
                <div className="incident-top">
                  <div className="incident-info">
                    <strong>{inc.type}</strong>
                    <p>{inc.message}</p>
                    <div className="incident-meta">
                      <span
                        className={`incident-badge ${inc.status === "OPEN" ? "open" : ""}`}
                      >
                        {inc.status}
                      </span>
                      <span>{inc.severity}</span>
                      <span>{dateLabel(inc.createdAt)}</span>
                    </div>
                  </div>
                </div>

                <DeliveryList incidentId={inc.id} />

                {inc.status === "OPEN" && (
                  <div className="incident-actions">
                    <button
                      className="btn"
                      type="button"
                      disabled={reprocessingId === inc.id}
                      onClick={() => handleReprocess(inc.id)}
                    >
                      <RotateCcw size={14} />{" "}
                      {reprocessingId === inc.id
                        ? "Queuing..."
                        : "Reprocess Deliveries"}
                    </button>
                    {resolvingId === inc.id ? (
                      <div style={{ display: "flex", gap: "8px", flex: 1 }}>
                        <input
                          type="text"
                          placeholder="Resolution note"
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          style={{
                            flex: 1,
                            padding: "0 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--line)",
                          }}
                        />
                        <button
                          className="btn btn-primary"
                          onClick={() => handleResolve(inc.id, resolutionNote)}
                          disabled={!resolutionNote.trim()}
                        >
                          Confirm Resolve
                        </button>
                        <button
                          className="btn"
                          onClick={() => setResolvingId("")}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => setResolvingId(inc.id)}
                      >
                        <Check size={14} /> Resolve Incident
                      </button>
                    )}
                  </div>
                )}
                {inc.status === "RESOLVED" && inc.resolutionNote && (
                  <div
                    style={{
                      marginTop: "12px",
                      fontSize: "11px",
                      color: "var(--ink-soft)",
                      padding: "8px",
                      background: "#f9f8f4",
                      borderRadius: "4px",
                      fontStyle: "italic",
                    }}
                  >
                    Resolution note: {inc.resolutionNote}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DurableOperationsPanel({
  jobs,
  metrics,
  workers,
  schedulers,
  loading,
  onReprocess,
  onLeadership,
  onRecoverSchedules,
  pendingJobId,
  leadershipPending,
  recoveryPending,
}: {
  jobs: OperationsJob[];
  metrics?: {
    queueDepth: number;
    retryQueueDepth: number;
    deadLetterCount: number;
    statuses: Record<string, number>;
  };
  workers: OperationsWorker[];
  schedulers: OperationsScheduler[];
  loading: boolean;
  onReprocess: (job: OperationsJob) => void;
  onLeadership: () => void;
  onRecoverSchedules: () => void;
  pendingJobId: string;
  leadershipPending: boolean;
  recoveryPending: boolean;
}) {
  const statusOrder = [
    "QUEUED",
    "LEASED",
    "RUNNING",
    "RETRY_PENDING",
    "DEAD_LETTER",
    "SUCCEEDED",
  ];
  return (
    <section
      className="card card-pad operations-runtime animate-in delay-2"
      data-testid="card-operations-runtime"
    >
      <div className="operations-section-heading">
        <div>
          <span className="operations-kicker">Durable runtime</span>
          <h2>Work that survives a restart.</h2>
          <p>
            Jobs, leases, retries, and scheduler state remain PostgreSQL-backed.
            This surface is advisory-only and cannot move capital or submit
            orders.
          </p>
        </div>
        <Activity size={18} />
      </div>
      {loading && (
        <div className="operations-loading-line">
          Reading durable runtime state…
        </div>
      )}
      <div className="operations-runtime-metrics">
        <div>
          <span>Queue depth</span>
          <strong>{metrics?.queueDepth ?? "—"}</strong>
        </div>
        <div>
          <span>Retry queue</span>
          <strong>{metrics?.retryQueueDepth ?? "—"}</strong>
        </div>
        <div>
          <span>Dead letter</span>
          <strong>{metrics?.deadLetterCount ?? "—"}</strong>
        </div>
        <div>
          <span>Workers</span>
          <strong>{workers.length || "—"}</strong>
        </div>
      </div>
      <div className="operations-runtime-grid">
        <div>
          <div className="operations-runtime-subheading">
            <strong>Queue status</strong>
            <span>{jobs.length} recent jobs</span>
          </div>
          <div className="operations-status-pills">
            {statusOrder.map((status) => (
              <span
                key={status}
                className={`operations-status-pill ${jobStatusTone(status)}`}
              >
                <b>{metrics?.statuses?.[status] ?? 0}</b>
                {titleCase(status)}
              </span>
            ))}
          </div>
          {jobs.length === 0 && (
            <div className="operations-empty-line">
              <ArchiveRestore size={14} /> No durable jobs have been recorded.
            </div>
          )}
          {jobs.slice(0, 6).map((job) => (
            <article
              className="operations-job-row"
              key={job.id}
              data-testid={`row-operations-job-${job.id}`}
            >
              <div className="operations-job-icon">
                <Server size={14} />
              </div>
              <div>
                <strong>{titleCase(job.kind)}</strong>
                <span>
                  {job.correlationId || job.jobKey} · attempt {job.attempts}/
                  {job.maxAttempts}
                </span>
                <small>
                  {job.lastError || `Available ${dateLabel(job.availableAt)}`}
                </small>
              </div>
              <div className="operations-job-side">
                <span className={`status ${jobStatusTone(job.status)}`}>
                  {titleCase(job.status)}
                </span>
                {job.status === "DEAD_LETTER" && (
                  <button
                    className="btn"
                    type="button"
                    disabled={pendingJobId === job.id}
                    onClick={() => onReprocess(job)}
                    data-testid={`button-reprocess-job-${job.id}`}
                  >
                    {pendingJobId === job.id ? "Requeueing…" : "Reprocess"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <div>
          <div className="operations-runtime-subheading">
            <strong>Workers & scheduler</strong>
            <span>{schedulers.length} schedules</span>
          </div>
          {workers.length === 0 && (
            <div className="operations-empty-line">
              <Activity size={14} /> No worker heartbeat has been recorded.
            </div>
          )}
          {workers.slice(0, 3).map((worker) => (
            <div className="operations-runtime-line" key={worker.workerId}>
              <span>
                <Server size={13} /> {worker.workerId}
              </span>
              <span className="status">
                {titleCase(worker.status)} ·{" "}
                {dateLabel(worker.lastHeartbeatAt, "No heartbeat")}
              </span>
            </div>
          ))}
          {schedulers.slice(0, 3).map((schedule) => (
            <div className="operations-runtime-line" key={schedule.id}>
              <span>
                <CalendarClock size={13} /> {schedule.name}
              </span>
              <span>
                {titleCase(schedule.missedRunPolicy)} ·{" "}
                {dateLabel(schedule.nextRunAt)}
              </span>
            </div>
          ))}
          <div className="operations-runtime-actions">
            <button
              className="btn"
              type="button"
              disabled={leadershipPending}
              onClick={onLeadership}
              data-testid="button-operations-scheduler-leadership"
            >
              {leadershipPending ? "Acquiring…" : "Acquire scheduler lease"}
            </button>
            <button
              className="btn"
              type="button"
              disabled={recoveryPending}
              onClick={onRecoverSchedules}
              data-testid="button-recover-operations-schedules"
            >
              {recoveryPending ? "Recovering…" : "Recover missed runs"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function NotificationPreferences({
  preferences,
  onSaved,
  onFeedback,
}: {
  preferences: OperationsNotificationPreferences;
  onSaved: (data: Partial<OperationsNotificationPreferences>) => Promise<void>;
  onFeedback: Feedback;
}) {
  const [draft, setDraft] = useState(preferences);
  const [quietStart, setQuietStart] = useState(
    preferences.quietHoursStart || "",
  );
  const [quietEnd, setQuietEnd] = useState(preferences.quietHoursEnd || "");
  const channels = ["email", "in_app", "sms"];
  const toggle = (
    key: keyof OperationsNotificationPreferences,
    channel: string,
  ) => {
    const value = draft[key];
    if (!Array.isArray(value)) return;
    setDraft({
      ...draft,
      [key]: value.includes(channel)
        ? value.filter((item) => item !== channel)
        : [...value, channel],
    });
  };
  const save = async () => {
    const payload: Partial<OperationsNotificationPreferences> = {
      ...draft,
      quietHoursStart: quietStart || null,
      quietHoursEnd: quietEnd || null,
    };
    await onSaved(payload);
    onFeedback("Notification preferences saved.");
  };
  return (
    <section
      className="card card-pad operations-preferences"
      data-testid="card-operations-notifications"
    >
      <div className="operations-section-heading">
        <div>
          <span className="operations-kicker">Quiet controls</span>
          <h2>Choose how the house reaches you.</h2>
          <p>
            Critical items stay visible. Everything else can arrive on the
            rhythm that suits your review.
          </p>
        </div>
        <BellRing size={18} />
      </div>
      <div className="operations-preference-grid">
        {notificationGroups.map(({ key, label }) => (
          <div className="operations-preference-row" key={key}>
            <strong>{label}</strong>
            <div>
              {channels.map((channel) => (
                <label key={channel} className="operations-channel">
                  <input
                    type="checkbox"
                    checked={draft[key].includes(channel)}
                    onChange={() => toggle(key, channel)}
                    data-testid={`checkbox-notification-${key}-${channel}`}
                  />
                  <span>{titleCase(channel)}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="operations-quiet-hours">
        <div>
          <span className="operations-kicker">Quiet hours</span>
          <p>Non-critical notices wait until the window closes.</p>
        </div>
        <label>
          From
          <input
            type="time"
            value={quietStart}
            onChange={(event) => setQuietStart(event.target.value)}
            data-testid="input-quiet-hours-start"
          />
        </label>
        <label>
          To
          <input
            type="time"
            value={quietEnd}
            onChange={(event) => setQuietEnd(event.target.value)}
            data-testid="input-quiet-hours-end"
          />
        </label>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            void save();
          }}
          data-testid="button-save-notification-preferences"
        >
          Save preferences
        </button>
      </div>
    </section>
  );
}

export default function OperationsPage({
  onFeedback,
}: {
  onFeedback: Feedback;
}) {
  const queryClient = useQueryClient();
  const overview = useGetOperationsOverview();
  const tasksQuery = useListOperationsTasks();
  const approvalsQuery = useListOperationsApprovals();
  const alertsQuery = useListOperationsAlerts();
  const automationsQuery = useListOperationsAutomations();
  const preferencesQuery = useGetOperationsNotificationPreferences();
  const jobsQuery = useListOperationsJobs();
  const jobMetricsQuery = useGetOperationsJobMetrics();
  const workersQuery = useListOperationsWorkerHealth();
  const schedulersQuery = useListOperationsSchedulers();
  const createTask = useCreateOperationsTask();
  const updateTask = useUpdateOperationsTask();
  const updateTaskWithReverification = useProviderProtectedAction(
    (input: Parameters<typeof updateTask.mutateAsync>[0]) =>
      updateTask.mutateAsync(input),
  );
  const decideApproval = useDecideOperationsApproval();
  const decideApprovalWithReverification = useProviderProtectedAction(
    (input: Parameters<typeof decideApproval.mutateAsync>[0]) =>
      decideApproval.mutateAsync(input),
  );
  const updateAlert = useUpdateOperationsAlert();
  const runAutomation = useRunOperationsAutomation();
  const updatePreferences = useUpdateOperationsNotificationPreferences();
  const reprocessJob = useReprocessOperationsJob();
  const acquireLeadership = useAcquireOperationsSchedulerLeadership();
  const recoverSchedules = useRecoverMissedOperationsSchedules();
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    domain: "household",
    priority: "MEDIUM" as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
    dueDate: "",
    assignedTo: "",
  });
  const [mutationId, setMutationId] = useState("");
  const [automationRun, setAutomationRun] = useState("");
  const [runtimeMutationId, setRuntimeMutationId] = useState("");

  const tasks = tasksQuery.data || overview.data?.tasks || [];
  const approvals = approvalsQuery.data || overview.data?.approvals || [];
  const alerts = alertsQuery.data || overview.data?.alerts || [];
  const automations = automationsQuery.data || overview.data?.automations || [];
  const filteredTasks = useMemo(
    () =>
      taskFilter === "ALL"
        ? tasks
        : tasks.filter((task) => task.status === taskFilter),
    [taskFilter, tasks],
  );
  const refreshAll = () => {
    void Promise.all([
      overview.refetch(),
      tasksQuery.refetch(),
      approvalsQuery.refetch(),
      alertsQuery.refetch(),
      automationsQuery.refetch(),
      preferencesQuery.refetch(),
      jobsQuery.refetch(),
      jobMetricsQuery.refetch(),
      workersQuery.refetch(),
      schedulersQuery.refetch(),
    ]);
  };
  const invalidateOperations = async (
    ...keys: ReadonlyArray<readonly unknown[]>
  ) => {
    await Promise.all(
      keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  };
  const submitTask = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !taskForm.title.trim() ||
      !taskForm.description.trim() ||
      !taskForm.dueDate
    )
      return;
    try {
      await createTask.mutateAsync({
        data: {
          ...taskForm,
          assignedTo: taskForm.assignedTo || undefined,
          requiresApproval: false,
        },
      });
      await invalidateOperations(
        getListOperationsTasksQueryKey(),
        getGetOperationsOverviewQueryKey(),
      );
      setTaskForm({
        title: "",
        description: "",
        domain: "household",
        priority: "MEDIUM",
        dueDate: "",
        assignedTo: "",
      });
      setShowTaskForm(false);
      onFeedback("Task added to the household queue.");
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "Task could not be added.",
      );
    }
  };
  const updateTaskStatus = async (id: string, status: TaskStatus) => {
    setMutationId(id);
    try {
      await updateTaskWithReverification({ taskId: id, data: { status } });
      await invalidateOperations(
        getListOperationsTasksQueryKey(),
        getGetOperationsOverviewQueryKey(),
      );
      onFeedback(
        status === "COMPLETED"
          ? "Task completed and recorded."
          : "Task status updated.",
      );
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "Task could not be updated.",
      );
    } finally {
      setMutationId("");
    }
  };
  const decide = async (
    approval: OperationsApproval,
    decision: ApprovalDecision,
    reason: string,
  ) => {
    setMutationId(approval.id);
    try {
      await decideApprovalWithReverification({
        approvalId: approval.id,
        data: { decision, reason },
      });
      await invalidateOperations(
        getListOperationsApprovalsQueryKey(),
        getGetOperationsOverviewQueryKey(),
      );
      onFeedback(`Approval ${titleCase(decision).toLowerCase()} and recorded.`);
    } catch (error) {
      onFeedback(
        error instanceof Error
          ? error.message
          : "Approval decision could not be recorded.",
      );
    } finally {
      setMutationId("");
    }
  };
  const updateAlertStatus = async (
    id: string,
    status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED",
  ) => {
    setMutationId(id);
    try {
      await updateAlert.mutateAsync({ alertId: id, data: { status } });
      await invalidateOperations(
        getListOperationsAlertsQueryKey(),
        getGetOperationsOverviewQueryKey(),
      );
      onFeedback(`Alert ${titleCase(status).toLowerCase()}.`);
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "Alert could not be updated.",
      );
    } finally {
      setMutationId("");
    }
  };
  const run = async (automation: OperationsAutomation) => {
    setMutationId(automation.id);
    try {
      const result = await runAutomation.mutateAsync({
        automationId: automation.id,
      });
      setAutomationRun(result.result);
      await invalidateOperations(
        getListOperationsAutomationsQueryKey(),
        getGetOperationsOverviewQueryKey(),
        getListOperationsTasksQueryKey(),
        getListOperationsAlertsQueryKey(),
      );
      onFeedback("Automation ran inside its safe boundary.");
    } catch (error) {
      onFeedback(
        error instanceof Error ? error.message : "Automation could not run.",
      );
    } finally {
      setMutationId("");
    }
  };
  const savePreferences = async (
    data: Partial<OperationsNotificationPreferences>,
  ) => {
    try {
      await updatePreferences.mutateAsync({ data });
      await invalidateOperations(
        getGetOperationsNotificationPreferencesQueryKey(),
        getGetOperationsOverviewQueryKey(),
      );
    } catch (error) {
      onFeedback(
        error instanceof Error
          ? error.message
          : "Preferences could not be saved.",
      );
    }
  };
  const reprocess = async (job: OperationsJob) => {
    setRuntimeMutationId(job.id);
    try {
      await reprocessJob.mutateAsync({ jobId: job.id });
      await invalidateOperations(
        getListOperationsJobsQueryKey(),
        getGetOperationsJobMetricsQueryKey(),
        getGetOperationsOverviewQueryKey(),
      );
      onFeedback(
        "Dead-letter job requeued with its original failure history preserved.",
      );
    } catch (error) {
      onFeedback(
        error instanceof Error
          ? error.message
          : "Job could not be reprocessed.",
      );
    } finally {
      setRuntimeMutationId("");
    }
  };
  const acquireSchedulerLease = async () => {
    setRuntimeMutationId("scheduler");
    try {
      await acquireLeadership.mutateAsync();
      await invalidateOperations(
        getListOperationsWorkerHealthQueryKey(),
        getListOperationsSchedulersQueryKey(),
      );
      onFeedback("Scheduler leadership lease acquired.");
    } catch (error) {
      onFeedback(
        error instanceof Error
          ? error.message
          : "Scheduler lease could not be acquired.",
      );
    } finally {
      setRuntimeMutationId("");
    }
  };
  const recoverSchedulesNow = async () => {
    setRuntimeMutationId("schedules");
    try {
      const result = await recoverSchedules.mutateAsync();
      await invalidateOperations(
        getListOperationsJobsQueryKey(),
        getGetOperationsJobMetricsQueryKey(),
        getListOperationsSchedulersQueryKey(),
      );
      onFeedback(
        `${result.recovered} missed schedule${result.recovered === 1 ? "" : "s"} reviewed.`,
      );
    } catch (error) {
      onFeedback(
        error instanceof Error
          ? error.message
          : "Missed schedules could not be recovered.",
      );
    } finally {
      setRuntimeMutationId("");
    }
  };

  if (overview.isLoading && !overview.data)
    return (
      <main className="content operations-page">
        <OperationsSkeleton />
      </main>
    );
  if (overview.isError && !overview.data)
    return (
      <main className="content operations-page">
        <OperationsError onRetry={refreshAll} />
      </main>
    );
  const today = overview.data?.today;
  const health = overview.data?.health;
  const preferences = preferencesQuery.data || overview.data?.notifications;

  return (
    <main className="content operations-page">
      <div className="page-heading animate-in">
        <div>
          <div className="eyebrow">Operations / command center</div>
          <h1>
            Keep the house
            <br />
            <em>moving calmly.</em>
          </h1>
          <p>
            Every open loop has an owner, a deadline, and a safe next step.
            Start with what needs a human decision today.
          </p>
        </div>
        <div className="heading-actions">
          <span className="status">
            <ShieldCheck size={12} /> Human-governed
          </span>
          <button
            className="btn"
            type="button"
            onClick={refreshAll}
            disabled={overview.isFetching}
            data-testid="button-refresh-operations"
          >
            <RefreshCw size={14} />{" "}
            {overview.isFetching ? "Refreshing…" : "Refresh view"}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setShowTaskForm((current) => !current)}
            data-testid="button-add-operations-task"
          >
            <Plus size={14} /> Add task
          </button>
        </div>
      </div>
      {overview.isError && (
        <div
          className="operations-stale-note"
          role="status"
          data-testid="status-operations-stale"
        >
          <AlertCircle size={14} /> Showing the last saved command center view.
          Refresh when the household service is ready.
        </div>
      )}
      <section
        className="operations-brief animate-in delay-1"
        data-testid="card-operations-brief"
      >
        <div className="operations-brief-mark">
          <ClipboardCheck size={20} />
        </div>
        <div className="operations-brief-copy">
          <span className="operations-kicker">Today / operating brief</span>
          <h2>
            {overview.data?.noActionRequired
              ? "The house is clear for now."
              : overview.data?.nextBestAction ||
                "A few clear next steps are waiting."}
          </h2>
          <p>
            {overview.data?.noActionRequired
              ? "No critical action is asking for your attention. Keep the rhythm."
              : "Work from the queue below. Completing one well-owned item is enough progress for today."}
          </p>
        </div>
        <div className="operations-brief-score">
          <span>Operating health</span>
          <strong>
            {health?.score ?? "—"}
            <small>/100</small>
          </strong>
          <span className="status">
            {health ? titleCase(health.accounting) : "Review-ready"}
          </span>
        </div>
      </section>
      <section className="operations-metric-grid animate-in delay-2">
        <OperationsMetric
          label="Due today"
          value={today?.tasksDue ?? "—"}
          detail={`${today?.reviewsScheduled ?? 0} reviews scheduled`}
        />
        <OperationsMetric
          label="Approvals"
          value={today?.approvalsPending ?? "—"}
          detail={`${health?.pendingApprovals ?? 0} pending human decisions`}
          tone={today?.approvalsPending ? "attention" : ""}
        />
        <OperationsMetric
          label="Alerts"
          value={today?.criticalAlerts ?? "—"}
          detail={`${health?.criticalAlerts ?? 0} critical · ${health?.overdueTasks ?? 0} overdue`}
          tone={today?.criticalAlerts ? "attention" : ""}
        />
        <OperationsMetric
          label="Plan actions"
          value={
            (today?.billsDue ?? 0) +
            (today?.goalActions ?? 0) +
            (today?.propertyActions ?? 0)
          }
          detail={`${today?.billsDue ?? 0} bills · ${today?.goalActions ?? 0} goal · ${today?.propertyActions ?? 0} property`}
        />
      </section>
      <ObservabilityPanel onFeedback={onFeedback} refreshAll={refreshAll} />
      <DurableOperationsPanel
        jobs={jobsQuery.data || []}
        metrics={jobMetricsQuery.data}
        workers={workersQuery.data || []}
        schedulers={schedulersQuery.data || []}
        loading={
          jobsQuery.isLoading ||
          jobMetricsQuery.isLoading ||
          workersQuery.isLoading ||
          schedulersQuery.isLoading
        }
        onReprocess={(job) => {
          void reprocess(job);
        }}
        onLeadership={() => {
          void acquireSchedulerLease();
        }}
        onRecoverSchedules={() => {
          void recoverSchedulesNow();
        }}
        pendingJobId={runtimeMutationId}
        leadershipPending={runtimeMutationId === "scheduler"}
        recoveryPending={runtimeMutationId === "schedules"}
      />
      {showTaskForm && (
        <form
          className="card card-pad operations-task-form animate-in"
          onSubmit={(event) => {
            void submitTask(event);
          }}
          data-testid="form-create-operations-task"
        >
          <div className="operations-section-heading">
            <div>
              <span className="operations-kicker">New queue item</span>
              <h2>Give the next move a home.</h2>
            </div>
            <button
              className="icon-btn"
              type="button"
              aria-label="Close add task form"
              onClick={() => setShowTaskForm(false)}
              data-testid="button-close-task-form"
            >
              <X size={15} />
            </button>
          </div>
          <div className="operations-form-grid">
            <label>
              Task title
              <input
                required
                value={taskForm.title}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, title: event.target.value })
                }
                placeholder="e.g. Confirm insurance renewal"
                data-testid="input-operations-task-title"
              />
            </label>
            <label>
              Domain
              <input
                required
                value={taskForm.domain}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, domain: event.target.value })
                }
                placeholder="bills, property, accounting"
                data-testid="input-operations-task-domain"
              />
            </label>
            <label className="wide">
              Description
              <textarea
                required
                value={taskForm.description}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, description: event.target.value })
                }
                placeholder="What does done look like?"
                data-testid="input-operations-task-description"
              />
            </label>
            <label>
              Due date
              <input
                required
                type="date"
                value={taskForm.dueDate}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, dueDate: event.target.value })
                }
                data-testid="input-operations-task-due-date"
              />
            </label>
            <label>
              Owner
              <input
                value={taskForm.assignedTo}
                onChange={(event) =>
                  setTaskForm({ ...taskForm, assignedTo: event.target.value })
                }
                placeholder="Household"
                data-testid="input-operations-task-owner"
              />
            </label>
            <label>
              Priority
              <select
                value={taskForm.priority}
                onChange={(event) =>
                  setTaskForm({
                    ...taskForm,
                    priority: event.target.value as typeof taskForm.priority,
                  })
                }
                data-testid="select-operations-task-priority"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </label>
          </div>
          <div className="operations-form-footer">
            <span>Tasks are persisted to the household queue.</span>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={createTask.isPending}
              data-testid="button-submit-operations-task"
            >
              {createTask.isPending ? "Adding…" : "Add to queue"}
            </button>
          </div>
        </form>
      )}
      <div className="operations-main-grid page-section">
        <section
          className="card card-pad animate-in delay-2"
          data-testid="card-operations-task-queue"
        >
          <div className="operations-section-heading">
            <div>
              <span className="operations-kicker">Owned work</span>
              <h2>The household queue.</h2>
              <p>
                Keep the next action small enough to finish, and visible enough
                to trust.
              </p>
            </div>
            <ListChecks size={18} />
          </div>
          <div className="operations-filter-bar">
            {["ALL", ...taskStatuses].map((status) => (
              <button
                className={`filter-chip ${taskFilter === status ? "active" : ""}`}
                type="button"
                key={status}
                onClick={() => setTaskFilter(status as "ALL" | TaskStatus)}
                data-testid={`button-filter-tasks-${status.toLowerCase()}`}
              >
                {status === "ALL" ? "All tasks" : titleCase(status)}
              </button>
            ))}
          </div>
          {tasksQuery.isLoading && (
            <div className="operations-loading-line">
              Loading the household queue…
            </div>
          )}
          {tasksQuery.isError && (
            <div className="operations-empty-line">
              <AlertCircle size={15} /> Tasks could not be loaded separately.
              Showing the command center snapshot.
            </div>
          )}
          {filteredTasks.length === 0 && (
            <div className="operations-empty-state">
              <ListChecks size={22} />
              <strong>No tasks in this view.</strong>
              <span>Add a task when a next step needs an owner.</span>
              <button
                className="btn"
                type="button"
                onClick={() => setShowTaskForm(true)}
                data-testid="button-empty-add-task"
              >
                <Plus size={14} /> Add task
              </button>
            </div>
          )}
          {filteredTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onUpdate={updateTaskStatus}
              pending={mutationId === task.id}
            />
          ))}
        </section>
        <section
          className="card card-pad animate-in delay-3 operations-alerts-card"
          data-testid="card-operations-alerts"
        >
          <div className="operations-section-heading">
            <div>
              <span className="operations-kicker">Signal, not noise</span>
              <h2>Alerts to settle.</h2>
              <p>Close the loop with an explicit acknowledgement.</p>
            </div>
            <AlertCircle size={18} />
          </div>
          {alertsQuery.isLoading && (
            <div className="operations-loading-line">
              Checking active signals…
            </div>
          )}
          {alerts.length === 0 && !alertsQuery.isLoading && (
            <div className="operations-empty-state compact">
              <ShieldCheck size={21} />
              <strong>No active alerts.</strong>
              <span>The control room is quiet.</span>
            </div>
          )}
          {alerts.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onUpdate={updateAlertStatus}
              pending={mutationId === alert.id}
            />
          ))}
        </section>
      </div>
      <div className="operations-main-grid page-section">
        <section
          className="card card-pad"
          data-testid="card-operations-approvals"
        >
          <div className="operations-section-heading">
            <div>
              <span className="operations-kicker">Human gate</span>
              <h2>Decisions waiting on you.</h2>
              <p>
                Capital-changing work stays paused until the right person
                records the next step.
              </p>
            </div>
            <LockKeyhole size={18} />
          </div>
          {approvalsQuery.isLoading && (
            <div className="operations-loading-line">
              Loading approval requests…
            </div>
          )}
          {approvals.length === 0 && !approvalsQuery.isLoading && (
            <div className="operations-empty-state compact">
              <CheckCircle2 size={21} />
              <strong>No decisions waiting.</strong>
              <span>
                Approved, deferred, and settled requests remain recorded in the
                ledger.
              </span>
            </div>
          )}
          {approvals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onDecide={decide}
              pending={mutationId === approval.id}
            />
          ))}
        </section>
        <section
          className="card card-pad"
          data-testid="card-operations-automations"
        >
          <div className="operations-section-heading">
            <div>
              <span className="operations-kicker">Safe routines</span>
              <h2>Quietly repeatable.</h2>
              <p>
                Prepare-only automations can create work, never move capital on
                their own.
              </p>
            </div>
            <Workflow size={18} />
          </div>
          {automationsQuery.isLoading && (
            <div className="operations-loading-line">
              Loading safe routines…
            </div>
          )}
          {automations.length === 0 && !automationsQuery.isLoading && (
            <div className="operations-empty-state compact">
              <Workflow size={21} />
              <strong>No automations configured.</strong>
              <span>Safe routines will appear here when enabled.</span>
            </div>
          )}
          {automations.map((automation) => (
            <article
              className="operations-automation-row"
              key={automation.id}
              data-testid={`row-operations-automation-${automation.id}`}
            >
              <div className="operations-automation-icon">
                {automation.protected ? (
                  <LockKeyhole size={15} />
                ) : (
                  <Workflow size={15} />
                )}
              </div>
              <div>
                <strong>{automation.name}</strong>
                <span>{automation.trigger}</span>
                <small>{automation.action}</small>
              </div>
              <div className="operations-automation-side">
                <span
                  className={`status ${automation.enabled ? "" : "review"}`}
                >
                  {automation.enabled ? "Enabled" : "Paused"}
                </span>
                <button
                  className="btn"
                  type="button"
                  disabled={!automation.enabled || mutationId === automation.id}
                  onClick={() => {
                    void run(automation);
                  }}
                  data-testid={`button-run-automation-${automation.id}`}
                >
                  <Play size={13} />{" "}
                  {mutationId === automation.id ? "Running…" : "Run"}
                </button>
              </div>
            </article>
          ))}
          {automationRun && (
            <div
              className="operations-run-result"
              role="status"
              data-testid="status-automation-run"
            >
              <CheckCircle2 size={14} /> {automationRun}
            </div>
          )}
        </section>
      </div>
      {preferences && (
        <NotificationPreferences
          preferences={preferences}
          onSaved={savePreferences}
          onFeedback={onFeedback}
        />
      )}
    </main>
  );
}
