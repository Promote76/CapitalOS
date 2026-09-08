import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  CheckCircle2,
  ChevronRight,
  Droplets,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
} from "lucide-react";
import {
  createCapitalRequest,
  useGetCapitalGovernorV2,
  useGetTreasury,
  type CapitalRequestInput,
  type CapitalGovernorV2,
  type TreasurySnapshot,
} from "@workspace/api-client-react";

function money(value: string | null) {
  if (value === null || value === "NOT_CALCULATED") return "NOT CALCULATED";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : "NOT AVAILABLE";
}

function percent(value: number) {
  return `${Math.round(value)}%`;
}

function label(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bucketTone(type: string) {
  if (type === "PROTECTED_GOAL" || type === "EMERGENCY" || type === "PROPERTY") return "green";
  if (type === "STRATEGY") return "blue";
  if (type === "OPPORTUNITY") return "lavender";
  if (type === "TREASURY") return "amber";
  return "neutral";
}

function TreasuryMetric({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <article className={`metric-card treasury-metric ${tone}`}>
      <span className="mono-label">{title}</span>
      <div className="metric-value">{value}</div>
      <div className="metric-detail">{detail}</div>
    </article>
  );
}

function BucketRow({ bucket }: { bucket: TreasurySnapshot["buckets"][number] }) {
  const current = Number(bucket.currentBalance);
  const target = Number(bucket.targetAmount);
  const progress = target > 0 ? Math.min(100, (current / target) * 100) : current > 0 ? 100 : 0;
  return (
    <div className="treasury-bucket-row">
      <div className="treasury-bucket-name">
        <span className={`treasury-dot ${bucketTone(bucket.bucketType)}`} />
        <div>
          <strong>{bucket.name}</strong>
          <span>{label(bucket.bucketType)} · priority {bucket.priority}</span>
        </div>
      </div>
      <div className="treasury-bucket-funding">
        <div>
          <strong>{money(bucket.currentBalance)}</strong>
          <span>{target > 0 ? `of ${money(bucket.targetAmount)}` : "no target"}</span>
        </div>
        <div className="progress-track"><div className={`progress-fill ${bucketTone(bucket.bucketType)}`} style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="treasury-bucket-tags">
        {bucket.protected && <span className="status"><LockKeyhole size={11} /> protected</span>}
        <span className="status review">{label(bucket.liquidityClass)}</span>
      </div>
    </div>
  );
}

function TreasuryOverview({ snapshot }: { snapshot: TreasurySnapshot }) {
  const governorQuery = useGetCapitalGovernorV2();
  const governor = governorQuery.data as CapitalGovernorV2 | undefined;
  return (
    <>
      <section className="treasury-metric-grid animate-in delay-1">
        <TreasuryMetric title="Total household capital" value={money(snapshot.totals.totalCapital)} detail={`${money(snapshot.totals.protectedCapital)} protected`} tone="green" />
        <TreasuryMetric title="Liquid reserve" value={money(snapshot.totals.liquidReserve)} detail={`${snapshot.health.liquidityCoverage.toFixed(1)} months essential coverage`} tone="blue" />
        <TreasuryMetric title="Duplex capital" value={money(snapshot.totals.duplexCapital)} detail={`${percent(snapshot.health.duplexProgressPercent)} of reserve target`} tone="green" />
        <TreasuryMetric title="Safe to deploy" value={money(snapshot.totals.safeToDeploy)} detail={`${snapshot.health.deployability}/100 deployability`} tone="lavender" />
      </section>

      <section className="card card-pad page-section" data-testid="capital-governor-v2-panel">
        <div className="card-title-row">
          <div><div className="card-title">Safe-to-Deploy 2.0</div><div className="card-subtitle">The Capital Governor separates physical cash, protected designations, reserve gaps, and household capital surplus.</div></div>
          <span className={`status ${governor?.status === "READY" ? "" : "pending"}`}><ShieldCheck size={12} /> {governor?.status ?? (governorQuery.isLoading ? "Loading" : "Unavailable")}</span>
        </div>
        {governorQuery.isError && <div className="treasury-inline-error"><AlertTriangle size={14} /> V2 evidence is unavailable. The legacy Safe-to-Deploy authority remains unchanged. <button className="text-link" onClick={() => { void governorQuery.refetch(); }}>Retry</button></div>}
        {governor && <div className="treasury-v2-grid">
          <div><span className="mono-label">V2 safe to deploy</span><strong>{money(governor.safeToDeploy)}</strong><small>{governor.dataReadiness.status} · {governor.reasons[0] ?? "All current controls are satisfied."}</small></div>
          <div><span className="mono-label">Household capital surplus</span><strong>{money(governor.householdCapitalSurplus.base)}</strong><small>Floor {money(governor.householdCapitalSurplus.floor)} · strong {money(governor.householdCapitalSurplus.strong)}</small></div>
          <div><span className="mono-label">Recommended waterfall</span><strong>{money(governor.waterfall.availableForWaterfall)}</strong><small>{governor.waterfall.allocations.length} advisory allocation(s) · no movement authorized</small></div>
        </div>}
        {governor && <div className="treasury-v2-reasons">{governor.components.filter((component) => Number(component.amount) > 0).slice(0, 5).map((component) => <span key={component.key}>{component.sign === "subtract" ? "−" : "+"} {component.label}: {money(component.amount ?? "0")}</span>)}</div>}
      </section>

      <section className="treasury-hero-grid page-section">
        <article className="card card-pad treasury-flow-card">
          <div className="card-title-row">
            <div><div className="card-title">Capital flow</div><div className="card-subtitle">The next dollar follows the hierarchy, not the highest projected return.</div></div>
            <ShieldCheck size={18} color="var(--color-protected)" />
          </div>
          <div className="treasury-flow">
            {snapshot.buckets.slice(0, 8).map((bucket, index) => (
              <div className="treasury-flow-step" key={bucket.id}>
                <div className={`treasury-flow-icon ${bucketTone(bucket.bucketType)}`}>{index === 0 ? <WalletCards size={15} /> : bucket.protected ? <LockKeyhole size={15} /> : <ArrowDown size={15} />}</div>
                <div><strong>{bucket.name}</strong><span>{money(bucket.currentBalance)}</span></div>
                {index < Math.min(snapshot.buckets.length, 8) - 1 && <ChevronRight className="treasury-flow-chevron" size={14} />}
              </div>
            ))}
          </div>
          <div className="treasury-next-action"><Sparkles size={15} /><div><span className="mono-label">Next best capital action</span><strong>{snapshot.nextAction}</strong></div></div>
        </article>

        <article className="card card-pad treasury-health-card">
          <div className="card-title-row">
            <div><div className="card-title">Treasury health</div><div className="card-subtitle">A composite view of protection, liquidity, goals, and policy.</div></div>
            <span className={`status ${snapshot.health.state === "NORMAL" ? "" : "pending"}`}>{label(snapshot.health.state)}</span>
          </div>
          <div className="treasury-health-score"><strong>{snapshot.health.score}</strong><span>/ 100</span></div>
          <div className="treasury-health-bar"><div style={{ width: `${snapshot.health.score}%` }} /></div>
          <div className="treasury-health-stats">
            <div><span>Emergency coverage</span><strong>{snapshot.health.emergencyCoverage.toFixed(1)} mo</strong></div>
            <div><span>Active capital</span><strong>{snapshot.health.activeCapitalPercent.toFixed(1)}%</strong></div>
            <div><span>Capital utilization</span><strong>{snapshot.health.utilization.toFixed(1)}%</strong></div>
            <div><span>Cash drag</span><strong>{money(snapshot.health.cashDrag)}</strong></div>
          </div>
          {snapshot.alerts.length > 0 && <div className="treasury-alert"><AlertTriangle size={14} /><span>{snapshot.alerts[0]}</span></div>}
        </article>
      </section>

      <section className="card card-pad page-section">
        <div className="card-title-row">
          <div><div className="card-title">Capital buckets</div><div className="card-subtitle">Protected capital is visible, liquid capital is distinct, and every destination has a purpose.</div></div>
          <span className="status"><CheckCircle2 size={12} /> Ledger view</span>
        </div>
        <div className="treasury-bucket-header"><span>Destination</span><span>Current balance</span><span>Classification</span></div>
        <div>{snapshot.buckets.map((bucket) => <BucketRow bucket={bucket} key={bucket.id} />)}</div>
      </section>

      <section className="treasury-columns page-section">
        <article className="card card-pad">
          <div className="card-title-row"><div><div className="card-title">Liquidity ladder</div><div className="card-subtitle">Available liquidity is not the same as net worth.</div></div><Droplets size={17} color="var(--color-primary)" /></div>
          <div className="treasury-ladder">
            {snapshot.liquidityLadder.map((item) => <div key={item.liquidityClass}><div><span>{label(item.liquidityClass)}</span><strong>{money(item.amount)}</strong></div><div className="progress-track"><div className="progress-fill blue" style={{ width: `${Math.min(100, item.percent)}%` }} /></div><small>{item.percent.toFixed(1)}% of capital</small></div>)}
          </div>
        </article>
        <article className="card card-pad">
          <div className="card-title-row"><div><div className="card-title">Policy hierarchy</div><div className="card-subtitle">Version {snapshot.policy.version} · auto scale disabled</div></div><Target size={17} color="var(--color-protected)" /></div>
          <ol className="treasury-policy-list">{snapshot.policy.hierarchy.slice(0, 8).map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span>{item}</li>)}</ol>
        </article>
      </section>

      <section className="card card-pad page-section">
        <div className="card-title-row"><div><div className="card-title">Liquidity stress tests</div><div className="card-subtitle">Scenario analysis only. No scenario changes household data.</div></div><span className="status review">Advisory</span></div>
        <div className="treasury-stress-table">
          <div className="treasury-stress-header"><span>Scenario</span><span>Liquid remaining</span><span>Reserve coverage</span><span>Safe to deploy</span><span>Status</span></div>
          {snapshot.stressTests.map((scenario) => <div className="treasury-stress-row" key={scenario.name}><strong>{scenario.name}</strong><span>{money(scenario.remainingLiquid)}</span><span>{scenario.liquidityMonths.toFixed(1)} mo</span><span>{money(scenario.safeToDeploy)}</span><span className={`status ${scenario.status === "Critical" ? "critical" : scenario.status === "Review" ? "pending" : ""}`}>{scenario.status}</span></div>)}
        </div>
      </section>
    </>
  );
}

function CapitalRequestPanel({ snapshot, onFeedback }: { snapshot: TreasurySnapshot; onFeedback: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("50.00");
  const [purpose, setPurpose] = useState("Review additional allocation for a validated strategy.");
  const [riskClass, setRiskClass] = useState<CapitalRequestInput["riskClass"]>("conservative");
  const [liquidity, setLiquidity] = useState("Immediate");
  const [submitting, setSubmitting] = useState(false);
  const submit = async () => {
    try {
      setSubmitting(true);
      await createCapitalRequest({
          requestingModule: "Strategy Lab",
          requestedAmount: amount,
          purpose,
          expectedDuration: "30 days",
          riskClass,
          expectedReturnAssumption: "Documented strategy evidence required before approval.",
          liquidityRequirement: liquidity,
          currentAllocation: "0.00",
          requestedNewAllocation: amount,
          evidence: ["Human review requested from Treasury", "Protected capital remains excluded"],
        }, {
          headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      setOpen(false);
      onFeedback("Capital request submitted for Treasury review.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Capital request could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section className="card card-pad page-section">
      <div className="card-title-row"><div><div className="card-title">Capital requests</div><div className="card-subtitle">Modules request capital; they never pull it directly. Approval remains human and Governor-bound.</div></div><button className="btn btn-primary" onClick={() => setOpen((value) => !value)}><Plus size={14} /> New request</button></div>
      {open && <div className="treasury-request-form">
        <div className="field"><label htmlFor="treasury-request-amount">Requested amount</label><input id="treasury-request-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></div>
        <div className="field"><label htmlFor="treasury-request-risk">Risk class</label><select id="treasury-request-risk" value={riskClass} onChange={(event) => setRiskClass(event.target.value as CapitalRequestInput["riskClass"])}><option value="conservative">Conservative</option><option value="moderate">Moderate</option><option value="experimental">Experimental</option></select></div>
        <div className="field"><label htmlFor="treasury-request-liquidity">Liquidity requirement</label><input id="treasury-request-liquidity" value={liquidity} onChange={(event) => setLiquidity(event.target.value)} /></div>
        <div className="field treasury-request-purpose"><label htmlFor="treasury-request-purpose">Purpose</label><textarea id="treasury-request-purpose" value={purpose} onChange={(event) => setPurpose(event.target.value)} /></div>
        <div className="treasury-request-actions"><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-primary" onClick={() => { void submit(); }} disabled={submitting || !amount || Number(amount) <= 0}>{submitting ? "Submitting…" : "Submit for review"}</button></div>
      </div>}
      {snapshot.requests.length === 0 && !open && <div className="empty-state treasury-empty"><Sparkles size={20} /><h3>No capital requests</h3><p>When a strategy needs funding, it will appear here for a governed review.</p></div>}
      {snapshot.requests.length > 0 && <div className="treasury-request-list">{snapshot.requests.map((request) => <div className="treasury-request-row" key={request.id}><div><strong>{request.requestingModule}</strong><span>{request.purpose}</span></div><strong>{money(request.requestedAmount)}</strong><span className={`status ${request.status === "REJECTED" ? "critical" : "pending"}`}>{label(request.status)}</span></div>)}</div>}
    </section>
  );
}

export default function TreasuryPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useGetTreasury();
  const snapshot = query.data as TreasurySnapshot | undefined;
  const sortedAlerts = useMemo(() => snapshot?.alerts ?? [], [snapshot?.alerts]);
  return (
    <main className="main-content">
      <div className="page-heading animate-in">
        <div><div className="eyebrow">Treasury / overview</div><h1>Every dollar with a job.</h1><p>A disciplined center for liquidity, protected goals, and controlled deployment.</p></div>
        <div className="heading-actions"><span className="status"><ShieldCheck size={12} /> Advisory only</span><span className="status review">Policy v{snapshot?.policy.version ?? "…"}</span></div>
      </div>
      {query.isLoading && <section className="card card-pad treasury-inline-state">Loading the household Treasury…</section>}
      {query.isError && <section className="card card-pad treasury-inline-state treasury-inline-error"><AlertTriangle size={16} /> Treasury data is temporarily unavailable. No allocation action was taken. <button className="text-link" onClick={() => { void query.refetch(); }}>Try again</button></section>}
      {snapshot && <TreasuryOverview snapshot={snapshot} />}
      {snapshot && sortedAlerts.length > 1 && <section className="treasury-alert-list page-section">{sortedAlerts.slice(1).map((alert) => <span key={alert}><AlertTriangle size={13} />{alert}</span>)}</section>}
      {snapshot && <CapitalRequestPanel snapshot={snapshot} onFeedback={onFeedback} />}
    </main>
  );
}