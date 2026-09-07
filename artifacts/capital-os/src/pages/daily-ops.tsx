import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  Gauge,
  History,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  XCircle,
} from "lucide-react";
import {
  getGetAccountingOverviewQueryKey,
  getGetFamilyOfficeQueryKey,
  getGetOperationsOverviewQueryKey,
  getGetTreasuryQueryKey,
  getListDailyOpsHistoryQueryKey,
  getListOperationsTasksQueryKey,
  useCreateDailyOpsJournalEntry,
  useCreateFamilyOfficeResearch,
  useGetAccountingOverview,
  useGetFamilyOffice,
  useGetOperationsOverview,
  useGetTreasury,
  useListDailyOpsHistory,
  useListOperationsTasks,
  useRecordGuidedRunAction,
  useUpdateOperationsTask,
  type OperationsTask,
  type OperationsTaskStatus,
} from "@workspace/api-client-react";
import { Link } from "wouter";

type Feedback = (message: string) => void;
type Cadence = "TODAY" | "WEEK" | "MONTH";

const HOUR = 60 * 60 * 1000;

function titleCase(value: string | null | undefined) {
  return (value || "Unknown")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(value: string | number | null | undefined, fallback = "Unavailable") {
  if (value === null || value === undefined || value === "" || value === "NOT_AVAILABLE" || value === "UNKNOWN") return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : fallback;
}

function dateLabel(value: string | Date | null | undefined, fallback = "Date unavailable") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateTimeLabel(value: string | Date | null | undefined, fallback = "Not recorded") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function priorityTone(priority: string) {
  if (priority === "CRITICAL" || priority === "HIGH") return "review";
  if (priority === "MEDIUM") return "pending";
  return "";
}

function cadenceEnd(cadence: Cadence) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  if (cadence === "TODAY") return end;
  end.setDate(end.getDate() + (cadence === "WEEK" ? 7 : 31));
  return end;
}

function inCadence(task: OperationsTask, cadence: Cadence) {
  const due = new Date(task.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return due >= start && due <= cadenceEnd(cadence);
}

function SectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="daily-ops-section-heading">
      <div>
        <span className="daily-ops-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

function DataUnavailable({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="daily-ops-unavailable" role="alert">
      <AlertTriangle size={16} />
      <span>{label} is unavailable. No zero or current recommendation is being inferred.</span>
      <button className="btn" type="button" onClick={onRetry}>Retry</button>
    </div>
  );
}

function FreshnessBadge({ label, state }: { label: string; state: "fresh" | "stale" | "unknown" | "unavailable" }) {
  const tone = state === "fresh" ? "" : state === "stale" ? "pending" : "review";
  return <span className={`status ${tone}`}><span className="daily-ops-fresh-dot" /> {label}: {titleCase(state)}</span>;
}

function TaskCard({
  task,
  onUpdate,
  pending,
}: {
  task: OperationsTask;
  onUpdate: (task: OperationsTask, status: OperationsTaskStatus) => void;
  pending: boolean;
}) {
  const nextStatus: OperationsTaskStatus = task.status === "COMPLETED"
    ? "OPEN"
    : task.status === "IN_PROGRESS"
      ? "COMPLETED"
      : "IN_PROGRESS";
  return (
    <article className={`daily-ops-task ${task.status === "COMPLETED" ? "is-complete" : ""}`}>
      <div className="daily-ops-task-icon">
        {task.status === "COMPLETED" ? <Check size={15} /> : task.status === "BLOCKED" ? <LockKeyhole size={14} /> : <Clock3 size={14} />}
      </div>
      <div className="daily-ops-task-copy">
        <div className="daily-ops-task-title">
          <strong>{task.title}</strong>
          <span className={`status ${priorityTone(task.priority)}`}>{titleCase(task.priority)}</span>
        </div>
        <p>{task.description}</p>
        <div className="daily-ops-task-meta">
          <span><CalendarClock size={12} /> {dateLabel(task.dueDate)}</span>
          <span>{titleCase(task.domain)}</span>
          {task.requiresApproval && <span><ShieldCheck size={12} /> Human gate</span>}
        </div>
      </div>
      <button className="btn daily-ops-task-button" type="button" disabled={pending} onClick={() => onUpdate(task, nextStatus)}>
        {pending ? "Saving…" : task.status === "COMPLETED" ? "Reopen" : task.status === "IN_PROGRESS" ? "Complete" : "Start"}
      </button>
    </article>
  );
}

export default function DailyOpsPage({ onFeedback }: { onFeedback: Feedback }) {
  const familyOffice = useGetFamilyOffice({ query: { queryKey: getGetFamilyOfficeQueryKey(), refetchInterval: HOUR } });
  const treasury = useGetTreasury({ query: { queryKey: getGetTreasuryQueryKey(), refetchInterval: HOUR } });
  const accounting = useGetAccountingOverview({ query: { queryKey: getGetAccountingOverviewQueryKey(), refetchInterval: HOUR } });
  const operations = useGetOperationsOverview({ query: { queryKey: getGetOperationsOverviewQueryKey(), refetchInterval: HOUR } });
  const tasksQuery = useListOperationsTasks({ query: { queryKey: getListOperationsTasksQueryKey(), refetchInterval: HOUR } });
  const research = useCreateFamilyOfficeResearch();
  const updateTask = useUpdateOperationsTask();
  const createJournal = useCreateDailyOpsJournalEntry();
  const recordGuidedRunAction = useRecordGuidedRunAction();
  const [cadence, setCadence] = useState<Cadence>("TODAY");
  const [refreshing, setRefreshing] = useState(false);
  const [runReason, setRunReason] = useState("");
  const [snoozeUntil, setSnoozeUntil] = useState("");
  const [journalType, setJournalType] = useState<"DECISION" | "HANDOFF" | "CLOSEOUT">("HANDOFF");
  const [journalTitle, setJournalTitle] = useState("");
  const [journalContext, setJournalContext] = useState("");
  const [journalOutcome, setJournalOutcome] = useState("");
  const [journalEvidence, setJournalEvidence] = useState("");
  const [journalBlockers, setJournalBlockers] = useState("");

  const snapshot = familyOffice.data;
  const treasurySnapshot = treasury.data;
  const accountingSnapshot = accounting.data;
  const dailyOps = useListDailyOpsHistory({ query: { queryKey: getListDailyOpsHistoryQueryKey(), refetchInterval: HOUR } });
  const tasks = tasksQuery.data ?? operations.data?.tasks ?? [];
  const visibleTasks = useMemo(() => tasks.filter((task) => inCadence(task, cadence)), [tasks, cadence]);
  const openTasks = tasks.filter((task) => task.status !== "COMPLETED" && task.status !== "DISMISSED" && task.status !== "EXPIRED");
  const priorityTasks = [...openTasks].sort((a, b) => {
    const priority = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return priority[a.priority] - priority[b.priority] || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });
  const activeProposal = snapshot?.proposals.find((proposal) => proposal.status === "pending" || proposal.status === "PENDING");
  const latestRun = snapshot?.runs[0];
  const providerState = snapshot?.provider.state ?? "unavailable";
  const providerFreshness: "fresh" | "stale" | "unknown" | "unavailable" =
    providerState === "verified" ? "fresh" : providerState === "unavailable" ? "unavailable" : "unknown";
  const treasuryFreshness: "fresh" | "stale" | "unknown" | "unavailable" = treasurySnapshot ? "fresh" : treasury.isError ? "unavailable" : "unknown";
  const accountingFreshness: "fresh" | "stale" | "unknown" | "unavailable" = accountingSnapshot ? "fresh" : accounting.isError ? "unavailable" : "unknown";
  const completedCount = visibleTasks.filter((task) => task.status === "COMPLETED").length;
  const guidedRun = dailyOps.data?.guidedRuns.find((run) => run.cadence === cadence);
  const guidedRunStatus = guidedRun?.status ?? "NOT_STARTED";
  const posture = treasurySnapshot?.health.state ?? "Unavailable";
  const riskItems = treasurySnapshot
    ? [
        { label: "Treasury posture", value: titleCase(treasurySnapshot.health.state), detail: treasurySnapshot.alerts[0] ?? "No active Treasury alert recorded.", tone: treasurySnapshot.health.state === "NORMAL" ? "" : "pending" },
        { label: "Liquidity coverage", value: `${treasurySnapshot.health.liquidityCoverage.toFixed(1)} mo`, detail: "Essential coverage from Treasury.", tone: treasurySnapshot.health.liquidityCoverage >= 3 ? "" : "review" },
        { label: "Provider confidence", value: titleCase(providerState), detail: snapshot?.provider.lastErrorCode ? titleCase(snapshot.provider.lastErrorCode) : "Evidence status from the latest Grok run.", tone: providerState === "verified" ? "" : "pending" },
      ]
    : [];

  useEffect(() => {
    if (cadence === "TODAY" && visibleTasks.length === 0 && tasks.some((task) => inCadence(task, "WEEK"))) setCadence("WEEK");
  }, [cadence, tasks, visibleTasks.length]);

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all([familyOffice.refetch(), treasury.refetch(), accounting.refetch(), operations.refetch(), tasksQuery.refetch(), dailyOps.refetch()]);
      onFeedback("The operating cockpit was refreshed. Stale or unavailable sources remain visible.");
    } finally {
      setRefreshing(false);
    }
  };

  const refreshGrok = async () => {
    try {
      await research.mutateAsync({
        data: {
          scope: "adaptive family office morning brief",
          prompt: "Review current household conditions and return only evidence-backed advisory priorities, watch items, concentration or risk reviews, and Shadow-only research suggestions. Do not recommend execution or money movement.",
          analyst: "CIO analyst",
        },
      });
      await familyOffice.refetch();
      onFeedback("Grok returned a fresh advisory brief. No financial action was created.");
    } catch (error) {
      await familyOffice.refetch();
      onFeedback(error instanceof Error ? error.message : "Grok is unavailable. The failed run was retained for review.");
    }
  };

  const handleTaskUpdate = async (task: OperationsTask, status: OperationsTaskStatus) => {
    try {
      await updateTask.mutateAsync({ taskId: task.id, data: { status } });
      await Promise.all([tasksQuery.refetch(), operations.refetch()]);
      onFeedback(status === "COMPLETED" ? "Task completed. The linked financial workspace remains authoritative." : "Task status updated.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "The task status could not be updated.");
    }
  };

  const handleGuidedRunAction = async (action: "START" | "COMPLETE" | "REOPEN" | "SNOOZE" | "BLOCK") => {
    if (!runReason.trim()) {
      onFeedback("Add a reason before recording a Guided Run action.");
      return;
    }
    if (action === "SNOOZE" && !snoozeUntil) {
      onFeedback("Choose when the Guided Run should resume.");
      return;
    }
    try {
      await recordGuidedRunAction.mutateAsync({
        data: {
          action,
          cadence,
          runId: guidedRun?.id,
          reason: runReason.trim(),
          snoozedUntil: action === "SNOOZE" ? new Date(snoozeUntil).toISOString() : null,
        },
      });
      await dailyOps.refetch();
      setRunReason("");
      onFeedback(`Guided Run ${titleCase(action)} recorded. This remains a review handoff, not financial authority.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "The Guided Run action could not be saved.");
    }
  };

  const handleJournalSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!journalTitle.trim() || !journalContext.trim()) {
      onFeedback("Add a title and decision context before saving the journal entry.");
      return;
    }
    try {
      await createJournal.mutateAsync({
        data: {
          entryType: journalType,
          title: journalTitle.trim(),
          decisionContext: journalContext.trim(),
          outcome: journalOutcome.trim() || null,
          evidenceLinks: journalEvidence.split(",").map((item) => item.trim()).filter(Boolean),
          unresolvedBlockers: journalBlockers.split(",").map((item) => item.trim()).filter(Boolean),
        },
      });
      await dailyOps.refetch();
      setJournalTitle("");
      setJournalContext("");
      setJournalOutcome("");
      setJournalEvidence("");
      setJournalBlockers("");
      onFeedback("Daily Ops journal entry saved for the household handoff history.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "The journal entry could not be saved.");
    }
  };

  const dataLoading = familyOffice.isLoading || treasury.isLoading || accounting.isLoading || tasksQuery.isLoading || dailyOps.isLoading;
  const dataUnavailable = familyOffice.isError && treasury.isError && accounting.isError && tasksQuery.isError && dailyOps.isError;

  return (
    <main className="content daily-ops-page">
      <div className="page-heading daily-ops-heading animate-in">
        <div>
          <div className="eyebrow">Family Office / adaptive cockpit</div>
          <h1>Run the house with <em>context.</em></h1>
          <p>Grok surfaces what changed, what deserves attention, and where to review it. Capital OS remains the authority for facts, policy, risk, and any financial decision.</p>
        </div>
        <div className="heading-actions">
          <span className="status"><ShieldCheck size={12} /> Advisory only</span>
          <button className="btn" type="button" onClick={() => { void refreshAll(); }} disabled={refreshing || dataLoading}><RefreshCw size={14} className={refreshing ? "daily-ops-spin" : ""} /> {refreshing ? "Refreshing…" : "Refresh cockpit"}</button>
        </div>
      </div>

      {dataUnavailable && <DataUnavailable label="The operating cockpit" onRetry={() => { void refreshAll(); }} />}

      <section className="daily-ops-agent animate-in delay-1">
        <div className="daily-ops-agent-mark"><Sparkles size={23} /></div>
        <div className="daily-ops-agent-copy">
          <div className="daily-ops-eyebrow">Grok Office Agent · bounded intelligence</div>
          <h2>{providerState === "verified" ? "Here is where the house needs you first." : "The office agent is waiting on verified evidence."}</h2>
          <p>
            {latestRun?.outputSummary ?? "Refresh the brief when you are ready. If the provider is unavailable, Capital OS will not invent a priority or turn a stale result into a current recommendation."}
          </p>
          <div className="daily-ops-agent-meta">
            <FreshnessBadge label="Grok" state={providerFreshness} />
            <span><History size={12} /> Last checked {dateTimeLabel(snapshot?.provider.lastCheckedAt)}</span>
            <span><LockKeyhole size={12} /> No broker credentials or execution authority</span>
          </div>
        </div>
        <button className="btn btn-primary" type="button" onClick={() => { void refreshGrok(); }} disabled={research.isPending || familyOffice.isFetching}>
          <Sparkles size={14} /> {research.isPending ? "Reviewing…" : "Refresh brief"}
        </button>
      </section>

      {snapshot?.provider.state === "unavailable" && (
        <div className="daily-ops-provider-warning"><ShieldAlert size={16} /><span><strong>Grok is unavailable.</strong> {titleCase(snapshot.provider.lastErrorCode ?? "Provider failure")}. No synthetic brief is shown; use the linked authoritative workspaces below.</span></div>
      )}

      <section className="daily-ops-posture-grid page-section animate-in delay-2">
        <article className="card card-pad daily-ops-posture-card">
          <SectionHeading eyebrow="Capital posture" title={treasurySnapshot ? titleCase(posture) : "Unavailable"} detail="Treasury posture is read from the governed household snapshot, not inferred from Grok." action={<Gauge size={18} color="var(--color-primary)" />} />
          <div className="daily-ops-posture-score"><strong>{treasurySnapshot ? treasurySnapshot.health.score : "—"}</strong><span>/ 100 health</span></div>
          <div className="daily-ops-progress"><span style={{ width: treasurySnapshot ? `${treasurySnapshot.health.score}%` : "0%" }} /></div>
          <div className="daily-ops-fact-row"><span>Safe to deploy</span><strong>{treasurySnapshot ? money(treasurySnapshot.totals.safeToDeploy) : "Unavailable"}</strong></div>
          <div className="daily-ops-fact-row"><span>Protected capital</span><strong>{treasurySnapshot ? money(treasurySnapshot.totals.protectedCapital) : "Unavailable"}</strong></div>
          <Link className="text-link" href="/treasury">Open Treasury <ArrowUpRight size={12} /></Link>
        </article>
        <article className="card card-pad daily-ops-condition-card">
          <SectionHeading eyebrow="Household condition" title="Current financial picture" detail="Accounting provides the balance-sheet context; Treasury provides operating liquidity." action={<WalletCards size={18} color="var(--color-protected)" />} />
          <div className="daily-ops-condition-grid">
            <div><span>Net worth</span><strong>{accountingSnapshot ? money(accountingSnapshot.netWorth.netWorth) : "Unavailable"}</strong><small>{accountingSnapshot ? `as of ${dateLabel(accountingSnapshot.asOf)}` : "Accounting unavailable"}</small></div>
            <div><span>Liquid net worth</span><strong>{accountingSnapshot ? money(accountingSnapshot.netWorth.liquidNetWorth) : "Unavailable"}</strong><small>{accountingSnapshot ? `${accountingSnapshot.confidence.label} confidence` : "No current reading"}</small></div>
            <div><span>Liquidity coverage</span><strong>{treasurySnapshot ? `${treasurySnapshot.health.liquidityCoverage.toFixed(1)} mo` : "Unavailable"}</strong><small>Essential coverage</small></div>
          </div>
          <div className="daily-ops-link-row"><Link className="text-link" href="/accounting">Open Accounting <ArrowUpRight size={12} /></Link><FreshnessBadge label="Accounting" state={accountingFreshness} /><FreshnessBadge label="Treasury" state={treasuryFreshness} /></div>
        </article>
      </section>

      <section className="daily-ops-work-grid page-section animate-in delay-2">
        <article className="card card-pad">
          <SectionHeading eyebrow="What changed" title="The next useful review" detail="Signals are kept separate from decisions. Open the source workspace before relying on a financial fact." action={<Lightbulb size={18} color="var(--color-opportunity)" />} />
          <div className="daily-ops-change-list">
            <div><span className="daily-ops-change-marker blue" /><div><strong>{accountingSnapshot ? "Accounting snapshot available" : "Accounting snapshot unavailable"}</strong><p>{accountingSnapshot ? `Net worth ${money(accountingSnapshot.netWorth.netWorth)} · ${accountingSnapshot.reconciliation.ledgerBalanced ? "ledger balanced" : "reconciliation needs review"}.` : "No current balance-sheet change is shown."}</p></div><Link href="/accounting" aria-label="Open accounting"><ArrowUpRight size={14} /></Link></div>
            <div><span className="daily-ops-change-marker green" /><div><strong>{treasurySnapshot ? "Treasury posture is visible" : "Treasury posture unavailable"}</strong><p>{treasurySnapshot ? treasurySnapshot.nextAction : "No capital posture is inferred while Treasury is unavailable."}</p></div><Link href="/treasury" aria-label="Open Treasury"><ArrowUpRight size={14} /></Link></div>
            <div><span className="daily-ops-change-marker lavender" /><div><strong>{activeProposal ? activeProposal.title : "No pending Shadow proposal"}</strong><p>{activeProposal ? `${titleCase(activeProposal.label)} · ${activeProposal.confidence.toFixed(0)}% confidence · human review required.` : "Research remains quiet until evidence-backed advisory output exists."}</p></div><Link href="/family-office" aria-label="Open Family Office"><ArrowUpRight size={14} /></Link></div>
          </div>
        </article>
        <article className="card card-pad">
          <SectionHeading eyebrow="Risk radar" title="Keep the guardrails in view." detail="A warning is a prompt to review, not permission to act." action={<ShieldAlert size={18} color="var(--color-warning)" />} />
          <div className="daily-ops-risk-list">
            {riskItems.length === 0 && <div className="daily-ops-empty"><CircleHelp size={16} /> Risk state unavailable until Treasury responds.</div>}
            {riskItems.map((item) => <div className="daily-ops-risk-row" key={item.label}><div><strong>{item.label}</strong><span>{item.detail}</span></div><span className={`status ${item.tone}`}>{item.value}</span></div>)}
          </div>
          <Link className="text-link" href="/risk">Open risk & readiness <ArrowUpRight size={12} /></Link>
        </article>
      </section>

      <section className="card card-pad daily-ops-cadence page-section animate-in delay-3">
        <div className="daily-ops-cadence-top">
          <SectionHeading eyebrow="Adaptive workboard" title="Run the day without losing the month." detail="Operations tasks are the durable checklist. Completing one never proves that a financial review succeeded." action={<ListChecks size={18} color="var(--color-primary)" />} />
          <div className="daily-ops-tabs" role="tablist" aria-label="Operations cadence">
            {(["TODAY", "WEEK", "MONTH"] as Cadence[]).map((item) => <button key={item} type="button" role="tab" aria-selected={cadence === item} className={cadence === item ? "active" : ""} onClick={() => setCadence(item)}>{item === "TODAY" ? "Today" : item === "WEEK" ? "This week" : "This month"}</button>)}
          </div>
        </div>
        <div className="daily-ops-runbar">
          <div><span className="daily-ops-eyebrow">Guided Run the Day · {titleCase(guidedRunStatus)}</span><strong>{completedCount} of {visibleTasks.length || "—"} visible tasks complete</strong><p>{guidedRun?.latestReason ?? "A guided sequence for review work, not a substitute for the authoritative destination."}</p></div>
          <div className="daily-ops-run-actions">
            <input aria-label="Reason for Guided Run action" placeholder="Reason for this handoff or status" value={runReason} onChange={(event) => setRunReason(event.target.value)} />
            <button className="btn btn-primary" type="button" disabled={recordGuidedRunAction.isPending} onClick={() => { void handleGuidedRunAction("START"); }}><Target size={14} /> Start</button>
            <button className="btn" type="button" disabled={recordGuidedRunAction.isPending || !guidedRun} onClick={() => { void handleGuidedRunAction("COMPLETE"); }}><Check size={14} /> Complete</button>
            <button className="btn" type="button" disabled={recordGuidedRunAction.isPending || !guidedRun} onClick={() => { void handleGuidedRunAction("REOPEN"); }}>Reopen</button>
            <button className="btn" type="button" disabled={recordGuidedRunAction.isPending || !guidedRun} onClick={() => { void handleGuidedRunAction("BLOCK"); }}><LockKeyhole size={13} /> Block</button>
            <input aria-label="Guided Run snooze until" type="datetime-local" value={snoozeUntil} onChange={(event) => setSnoozeUntil(event.target.value)} />
            <button className="btn" type="button" disabled={recordGuidedRunAction.isPending || !guidedRun} onClick={() => { void handleGuidedRunAction("SNOOZE"); }}>Snooze</button>
          </div>
          {guidedRun?.events.length ? <div className="daily-ops-run-history" aria-label="Guided Run history">{guidedRun.events.slice(0, 4).map((event) => <span key={event.id}><b>{titleCase(event.action)}</b> · {event.reason} · {dateTimeLabel(event.occurredAt)}</span>)}</div> : null}
        </div>
        {tasksQuery.isError && <DataUnavailable label="Operations tasks" onRetry={() => { void tasksQuery.refetch(); }} />}
        {!tasksQuery.isError && visibleTasks.length === 0 && <div className="daily-ops-empty"><CheckCircle2 size={17} /> No tasks are due in this cadence. Open the technical Operations workspace for the full household queue.</div>}
        <div className="daily-ops-task-list">{visibleTasks.map((task) => <TaskCard key={task.id} task={task} onUpdate={(item, status) => { void handleTaskUpdate(item, status); }} pending={updateTask.isPending && updateTask.variables?.taskId === task.id} />)}</div>
        <Link className="text-link" href="/operations">Open Operations command center <ArrowUpRight size={12} /></Link>
      </section>

      <section className="daily-ops-two-col page-section animate-in delay-3">
        <article className="card card-pad">
          <SectionHeading eyebrow="Decision queue" title="Review, then decide." detail="Grok can prioritize evidence, but only a human can approve a governed financial decision." action={<CheckCircle2 size={18} color="var(--color-warning)" />} />
          {activeProposal ? <div className="daily-ops-decision-card"><div className="daily-ops-decision-head"><span className="status review">{titleCase(activeProposal.label)}</span><span>{activeProposal.confidence.toFixed(0)}% confidence</span></div><h3>{activeProposal.title}</h3><p>{activeProposal.thesis}</p><div className="daily-ops-evidence"><span><CheckCircle2 size={12} /> {activeProposal.facts.length} facts</span><span><AlertTriangle size={12} /> {activeProposal.risks.length} risks</span><span><ShieldCheck size={12} /> Shadow-only</span></div><Link className="btn" href="/family-office">Review proposal <ArrowUpRight size={13} /></Link></div> : <div className="daily-ops-empty"><CheckCircle2 size={17} /> No pending advisory proposal is available for review.</div>}
          {priorityTasks.filter((task) => task.requiresApproval).slice(0, 2).map((task) => <div className="daily-ops-queue-row" key={task.id}><div><strong>{task.title}</strong><span>{titleCase(task.priority)} · due {dateLabel(task.dueDate)}</span></div><Link className="text-link" href="/operations">Open <ArrowUpRight size={12} /></Link></div>)}
        </article>
        <article className="card card-pad">
          <SectionHeading eyebrow="Allocation & investment view" title="See the jobs of capital." detail="Current Treasury buckets and Shadow research stay separate from any target allocation or order." action={<TrendingUp size={18} color="var(--color-opportunity)" />} />
          {treasurySnapshot ? <div className="daily-ops-allocation-list">{treasurySnapshot.buckets.slice(0, 5).map((bucket) => <div key={bucket.id}><div className="daily-ops-allocation-label"><span>{bucket.name}</span><strong>{money(bucket.currentBalance)}</strong></div><div className="daily-ops-progress"><span className={bucket.protected ? "green" : "blue"} style={{ width: `${bucket.targetAmount && Number(bucket.targetAmount) > 0 ? Math.min(100, (Number(bucket.currentBalance) / Number(bucket.targetAmount)) * 100) : 100}%` }} /></div><small>{bucket.protected ? "Protected" : titleCase(bucket.liquidityClass)} · {bucket.targetAmount ? `target ${money(bucket.targetAmount)}` : "no target recorded"}</small></div>)}</div> : <div className="daily-ops-empty"><WalletCards size={17} /> Allocation is unavailable while Treasury is unavailable.</div>}
          <Link className="text-link" href="/portfolio">Open Portfolio <ArrowUpRight size={12} /></Link>
        </article>
      </section>

      <section className="daily-ops-three-col page-section animate-in delay-3">
        <article className="card card-pad daily-ops-journal-card">
          <SectionHeading eyebrow="Decision journal" title="Keep the why." detail="Handoffs and closeouts are household review history; authoritative decisions remain in their source systems." action={<History size={17} color="var(--color-primary)" />} />
          <div className="daily-ops-journal-list">
            {dailyOps.data?.journalEntries.slice(0, 5).map((entry) => <div key={entry.id}><span className={`status ${entry.entryType === "CLOSEOUT" ? "" : "pending"}`}>{titleCase(entry.entryType)}</span><div><strong>{entry.title}</strong><span>{dateTimeLabel(entry.createdAt)} · actor {entry.actorId.slice(0, 8)}</span><small>{entry.decisionContext}</small>{entry.unresolvedBlockers.length > 0 && <small className="daily-ops-blocker">Blockers: {entry.unresolvedBlockers.join(" · ")}</small>}</div></div>)}
            {!dailyOps.data?.journalEntries.length && <div className="daily-ops-empty">No Daily Ops handoff or closeout entries recorded.</div>}
          </div>
          <form className="daily-ops-journal-form" onSubmit={(event) => { void handleJournalSubmit(event); }}>
            <div className="daily-ops-form-row"><select aria-label="Journal entry type" value={journalType} onChange={(event) => setJournalType(event.target.value as typeof journalType)}><option value="HANDOFF">Handoff</option><option value="CLOSEOUT">Closeout</option><option value="DECISION">Decision context</option></select><input aria-label="Journal entry title" placeholder="What should the next operator know?" value={journalTitle} onChange={(event) => setJournalTitle(event.target.value)} /></div>
            <textarea aria-label="Decision context" placeholder="Context, decision boundary, and what remains unresolved" value={journalContext} onChange={(event) => setJournalContext(event.target.value)} rows={3} />
            <div className="daily-ops-form-row"><input aria-label="Outcome" placeholder="Outcome (optional)" value={journalOutcome} onChange={(event) => setJournalOutcome(event.target.value)} /><input aria-label="Evidence links" placeholder="Evidence links, comma separated (optional)" value={journalEvidence} onChange={(event) => setJournalEvidence(event.target.value)} /></div>
            <input aria-label="Unresolved blockers" placeholder="Unresolved blockers, comma separated (optional)" value={journalBlockers} onChange={(event) => setJournalBlockers(event.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={createJournal.isPending}><History size={13} /> {createJournal.isPending ? "Saving…" : "Save handoff note"}</button>
          </form>
          <Link className="text-link" href="/family-office">Open Family Office history <ArrowUpRight size={12} /></Link>
        </article>
        <article className="card card-pad"><SectionHeading eyebrow="Scenario desk" title="Stress, don’t execute." detail="Scenario framing can inform a review; it cannot write allocations or reach an order system." action={<Activity size={17} color="var(--color-warning)" />} /><div className="daily-ops-scenario"><div><strong>Liquidity stress tests</strong><span>{treasurySnapshot ? `${treasurySnapshot.stressTests.length} governed scenarios available` : "Unavailable"}</span></div><div><strong>Protected capital</strong><span>{treasurySnapshot ? `${money(treasurySnapshot.totals.protectedCapital)} remains distinct` : "Unavailable"}</span></div><div><XCircle size={14} /><span>Execution disabled</span></div></div><Link className="text-link" href="/treasury">Open Treasury scenarios <ArrowUpRight size={12} /></Link></article>
        <article className="card card-pad"><SectionHeading eyebrow="Advisor value" title="Measure the help." detail="Workforce telemetry is advisory and cannot grant an analyst authority." action={<Gauge size={17} color="var(--color-protected)" />} />{snapshot?.workforce?.analysts.slice(0, 3).map((analyst) => <div className="daily-ops-advisor-row" key={analyst.id}><div><strong>{analyst.analyst}</strong><span>{analyst.specialty} · {analyst.completedCount} completed</span></div><span className="status">{analyst.qualityScore ? `${analyst.qualityScore.toFixed(0)}% quality` : "Unrated"}</span></div>)}{!snapshot?.workforce?.analysts.length && <div className="daily-ops-empty"><CircleHelp size={16} /> Advisor scorecards are unavailable.</div>}<Link className="text-link" href="/family-office">Open scorecards <ArrowUpRight size={12} /></Link></article>
      </section>

      <div className="daily-ops-disclaimer"><ShieldCheck size={15} /><span>Safe boundary: Grok is advisory, Shadow-only, evidence-backed, and timestamped. It cannot buy, sell, transfer, withdraw, override policy, use broker credentials, or move household capital.</span></div>
      <div className="daily-ops-freshness"><span>Bounded refresh: on demand + at most hourly while this page is open.</span><span>Operations: {tasksQuery.isFetching ? "refreshing" : "ready"} · latest task read {dateTimeLabel(tasks[0]?.createdAt)}</span><span><ExternalLink size={11} /> Source links open authoritative workspaces.</span></div>
    </main>
  );
}