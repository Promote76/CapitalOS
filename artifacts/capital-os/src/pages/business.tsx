import { FormEvent, useState } from "react";
import { AlertCircle, ArrowUpRight, BriefcaseBusiness, Building2, CircleDollarSign, ClipboardCheck, FileCheck2, Landmark, LockKeyhole, Plus, RefreshCw, ShieldCheck, TrendingUp, TriangleAlert } from "lucide-react";
import { createBusinessDistribution, getGetBusinessIncomeIntelligenceQueryKey, getGetBusinessOverviewQueryKey, useCreateBusinessCashPosition, useCreateBusinessExpense, useCreateBusinessOwnerDraw, useCreateBusinessRevenue, useCreateBusinessSettlement, useApproveBusinessOwnerDraw, useGetBusinessIncomeIntelligence, useGetBusinessOverview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const money = (value?: string) => Number(value ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function BusinessPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const queryClient = useQueryClient();
  const overview = useGetBusinessOverview();
  const addRevenue = useCreateBusinessRevenue();
  const addExpense = useCreateBusinessExpense();
  const [form, setForm] = useState<"revenue" | "expense" | "distribution" | null>(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const data = overview.data;
  const businessId = data?.businesses[0]?.id;

  const refresh = async () => queryClient.invalidateQueries({ queryKey: getGetBusinessOverviewQueryKey() });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !form || !amount || !description.trim()) return;
    try {
      if (form === "revenue") await addRevenue.mutateAsync({ data: { businessId, revenueDate: new Date().toISOString().slice(0, 10), category: "services", amount, description: description.trim() } });
      if (form === "expense") await addExpense.mutateAsync({ data: { businessId, expenseDate: new Date().toISOString().slice(0, 10), category: "operating", amount, description: description.trim(), classification: "business", expenseType: "operating" } });
      if (form === "distribution") await createBusinessDistribution({ businessId, distributionDate: new Date().toISOString().slice(0, 10), amount, notes: description.trim() }, {
        headers: { "Idempotency-Key": crypto.randomUUID() },
      });
      await refresh();
      onFeedback(form === "distribution" ? "Distribution prepared for owner review." : `${title(form)} recorded.`);
      setForm(null); setAmount(""); setDescription("");
    } catch (error) { onFeedback(error instanceof Error ? error.message : "The business record could not be saved."); }
  };

  if (overview.isLoading && !data) return <main className="content business-page"><div className="business-loading"><div className="skeleton" /><div className="business-metric-grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div></div></main>;
  if (overview.isError || !data) return <main className="content business-page"><section className="card card-pad operations-inline-error"><AlertCircle /><div><strong>Business Engine is temporarily unavailable.</strong><span>No records were changed.</span></div><button className="btn" onClick={() => overview.refetch()}><RefreshCw size={14} /> Retry</button></section></main>;

  const metrics = [
    ["Revenue", money(data.totals.totalRevenue), `${money(data.totals.revenueThisMonth)} this month`, CircleDollarSign],
    ["Operating profit", money(data.totals.businessProfit), `${data.totals.profitMargin}% margin`, TrendingUp],
    ["Business cash", money(data.totals.businessCash), "Separate from household cash", Landmark],
    ["Safe to distribute", money(data.totals.safeToDistribute), `${data.totals.reserveCoverageMonths} months reserve coverage`, ShieldCheck],
    ["Owner pay", money(data.totals.ownerPay), "Completed distributions only", ArrowUpRight],
    ["Owned equity", money(data.totals.estimatedBusinessEquity), "Ownership-adjusted; not added twice", Building2],
  ] as const;

  return <main className="content business-page">
    <section className="business-hero">
      <div><span className="eyebrow"><BriefcaseBusiness size={14} /> Business & Income Engine</span><h1>Run the company without blurring the household.</h1><p>Business performance, reserves, and owner pay stay on their own books. Only completed distributions become household income.</p></div>
      <div className="business-hero-health"><span>Business health</span><strong>{data.health}</strong><small>of 100</small></div>
    </section>
    <div className="business-boundary"><LockKeyhole size={15} /><span><strong>Capital boundary active.</strong> Business cash is excluded from household Safe-to-Deploy. Distributions require human review and reserve coverage.</span></div>
    <section className="business-metric-grid">{metrics.map(([label, value, detail, Icon]) => <article className="business-metric" key={label}><div><span>{label}</span><Icon size={16} /></div><strong>{value}</strong><small>{detail}</small></article>)}</section>
    <section className="business-actions">
      <button className="btn btn-primary" onClick={() => setForm("revenue")}><Plus size={14} /> Record revenue</button>
      <button className="btn" onClick={() => setForm("expense")}><Plus size={14} /> Record expense</button>
      <button className="btn" onClick={() => setForm("distribution")}><ShieldCheck size={14} /> Review distribution</button>
    </section>
    {form && <form className="card card-pad business-entry-form" onSubmit={submit}><div><span className="eyebrow">{title(form)}</span><h2>{form === "distribution" ? "Prepare an owner distribution" : `Record ${form}`}</h2><p>{form === "distribution" ? `Current governor limit: ${money(data.totals.safeToDistribute)}.` : "This entry stays on the business books."}</p></div><label>Amount<input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" /></label><label>Description<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={form === "distribution" ? "Reason for owner review" : "What was this for?"} /></label><div><button className="btn btn-primary" disabled={!amount || !description.trim()}>{form === "distribution" ? "Prepare review" : "Save record"}</button><button className="btn" type="button" onClick={() => setForm(null)}>Cancel</button></div></form>}
    <section className="business-company card card-pad">
      <div className="business-section-head"><div><span className="eyebrow">Operating companies</span><h2>{data.businesses.length} business{data.businesses.length === 1 ? "" : "es"} under management</h2></div><span className="status">{data.totals.activeBusinesses} active</span></div>
      {data.businesses.map((business) => <article className="business-company-row" key={business.id}><div className="business-company-icon"><Building2 size={18} /></div><div><strong>{business.displayName}</strong><span>{business.legalName} · {title(business.entityType)}</span></div><div><span>Ownership</span><strong>{Number(business.ownershipPercentage).toFixed(0)}%</strong></div><div><span>Industry</span><strong>{business.industry || "Not set"}</strong></div><span className="status">{title(business.status)}</span></article>)}
    </section>
    <section className="business-ledgers">
      <div className="card card-pad"><div className="business-section-head"><div><span className="eyebrow">Income ledger</span><h2>Recent revenue</h2></div></div>{data.recentRevenue.map((row) => <div className="business-ledger-row" key={row.id}><div><strong>{row.description}</strong><span>{row.customer || title(row.category)} · {row.revenueDate}</span></div><b className="positive">+{money(row.amount)}</b></div>)}</div>
      <div className="card card-pad"><div className="business-section-head"><div><span className="eyebrow">Operating ledger</span><h2>Recent expenses</h2></div></div>{data.recentExpenses.map((row) => <div className="business-ledger-row" key={row.id}><div><strong>{row.description}</strong><span>{title(row.category)} · {row.expenseDate}</span></div><b>−{money(row.amount)}</b></div>)}</div>
    </section>
    <section className="card card-pad business-distributions"><div className="business-section-head"><div><span className="eyebrow">Treasury bridge</span><h2>Owner distributions</h2><p>Proposals reserve capacity but do not move money.</p></div></div>{data.distributions.map((row) => <div className="business-ledger-row" key={row.id}><div><strong>{money(row.amount)} to {title(row.householdDestination)}</strong><span>{row.notes || "No note"} · {row.distributionDate}</span></div><span className={`status ${row.status === "proposed" ? "pending" : ""}`}>{title(row.status)}</span></div>)}</section>
    <BusinessIncomeIntelligencePanel businessId={businessId} onFeedback={onFeedback} />
  </main>;
}

function BusinessIncomeIntelligencePanel({ businessId, onFeedback }: { businessId?: string; onFeedback: (message: string) => void }) {
  const queryClient = useQueryClient();
  const intelligence = useGetBusinessIncomeIntelligence();
  const addSettlement = useCreateBusinessSettlement();
  const refreshCash = useCreateBusinessCashPosition();
  const proposeDraw = useCreateBusinessOwnerDraw();
  const approveDraw = useApproveBusinessOwnerDraw();
  const today = new Date().toISOString().slice(0, 10);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlement, setSettlement] = useState({ start: today, end: today, gross: "", deductions: "0.00", net: "" });
  const [drawAmount, setDrawAmount] = useState("");

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetBusinessIncomeIntelligenceQueryKey() });
  };

  const submitSettlement = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !settlement.gross || !settlement.net) return;
    try {
      await addSettlement.mutateAsync({
        data: {
          businessId,
          statementPeriodStart: settlement.start,
          statementPeriodEnd: settlement.end,
          paidDate: settlement.end,
          reportedGross: settlement.gross,
          reportedDeductions: settlement.deductions || "0.00",
          reportedNet: settlement.net,
          revenueLines: [{ description: "Settlement revenue", amount: settlement.gross }],
          deductionLines: settlement.deductions && settlement.deductions !== "0.00" ? [{ description: "Settlement deductions", amount: settlement.deductions }] : [],
        },
      });
      await refresh();
      setSettlementOpen(false);
      setSettlement({ start: today, end: today, gross: "", deductions: "0.00", net: "" });
      onFeedback("Settlement recorded and held to its reconciliation status.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "The settlement could not be recorded.");
    }
  };

  const snapshotCash = async () => {
    if (!businessId) return;
    try {
      await refreshCash.mutateAsync({ data: { businessId, asOf: today } });
      await refresh();
      onFeedback("Read-only business cash evidence refreshed.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "Cash evidence could not be refreshed.");
    }
  };

  const submitDraw = async (event: FormEvent) => {
    event.preventDefault();
    if (!businessId || !drawAmount) return;
    try {
      await proposeDraw.mutateAsync({ data: { businessId, proposalDate: today, amount: drawAmount, notes: "Prepared from Business Income Intelligence." } });
      await refresh();
      setDrawAmount("");
      onFeedback("Owner draw prepared for human review; no money moved.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "The owner draw could not be prepared.");
    }
  };

  const approve = async (proposalId: string, amount: string) => {
    try {
      await approveDraw.mutateAsync({ proposalId, data: { approvedAmount: amount, notes: "Approved from Business Income Intelligence." } });
      await refresh();
      onFeedback("Owner draw approved and recorded as verified household income.");
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : "The owner draw could not be approved.");
    }
  };

  if (intelligence.isLoading && !intelligence.data) {
    return <section className="card card-pad business-intelligence"><div className="business-loading-row" /><div className="business-loading-row" /></section>;
  }
  if (intelligence.isError || !intelligence.data) {
    return <section className="card card-pad operations-inline-error"><AlertCircle /><div><strong>Income intelligence is temporarily unavailable.</strong><span>Existing business records were not changed.</span></div><button className="btn" onClick={() => intelligence.refetch()}><RefreshCw size={14} /> Retry</button></section>;
  }

  const data = intelligence.data;
  const latestCash = data.cashPositions[0];
  return <section className="business-intelligence">
    <div className="business-intelligence-header">
      <div><span className="eyebrow"><ClipboardCheck size={14} /> Business Income Intelligence</span><h2>Reconcile the money before it becomes a household story.</h2><p>Settlement math, bank evidence, reserves, and owner draws stay reviewable and separate. Bank evidence is read-only.</p></div>
      <span className="status"><Landmark size={13} /> {data.summary.bankSyncMode.replaceAll("_", " ")}</span>
    </div>
    <div className="business-intelligence-metrics">
      <div><span>Settlements</span><strong>{data.summary.reconciledSettlementCount}/{data.summary.settlementCount}</strong><small>math reconciled</small></div>
      <div><span>Open anomalies</span><strong className={data.summary.openAnomalyCount ? "business-alert-value" : ""}>{data.summary.openAnomalyCount}</strong><small>must be resolved before approval</small></div>
      <div><span>Verified household income</span><strong>{money(data.summary.verifiedHouseholdIncome)}</strong><small>approved draws only</small></div>
      <div><span>Safe to distribute</span><strong>{latestCash ? money(latestCash.safeToDistribute) : "Not calculated"}</strong><small>{latestCash ? `as of ${latestCash.asOf}` : "refresh read-only cash evidence"}</small></div>
    </div>
    <div className="business-intelligence-actions">
      <button className="btn btn-primary" onClick={() => setSettlementOpen((open) => !open)}><FileCheck2 size={14} /> Record settlement</button>
      <button className="btn" onClick={() => void snapshotCash()} disabled={!businessId || refreshCash.isPending}><Landmark size={14} /> {refreshCash.isPending ? "Refreshing…" : "Refresh cash evidence"}</button>
    </div>
    {settlementOpen && <form className="card card-pad business-intelligence-form" onSubmit={submitSettlement}>
      <div><span className="eyebrow">Immutable source record</span><h3>Record a settlement</h3><p>Enter the reported totals and the engine will keep any variance in review.</p></div>
      <label>Period start<input type="date" value={settlement.start} onChange={(event) => setSettlement({ ...settlement, start: event.target.value })} /></label>
      <label>Period end<input type="date" value={settlement.end} onChange={(event) => setSettlement({ ...settlement, end: event.target.value })} /></label>
      <label>Gross<input required inputMode="decimal" value={settlement.gross} onChange={(event) => setSettlement({ ...settlement, gross: event.target.value })} placeholder="0.00" /></label>
      <label>Deductions<input inputMode="decimal" value={settlement.deductions} onChange={(event) => setSettlement({ ...settlement, deductions: event.target.value })} placeholder="0.00" /></label>
      <label>Net paid<input required inputMode="decimal" value={settlement.net} onChange={(event) => setSettlement({ ...settlement, net: event.target.value })} placeholder="0.00" /></label>
      <div><button className="btn btn-primary" disabled={addSettlement.isPending}>Save settlement</button><button className="btn" type="button" onClick={() => setSettlementOpen(false)}>Cancel</button></div>
    </form>}
    <div className="business-intelligence-columns">
      <div className="card card-pad"><div className="business-section-head"><div><span className="eyebrow">Settlement review</span><h3>Recent source documents</h3></div></div>{data.settlements.length === 0 ? <p className="business-empty">No settlement evidence recorded yet.</p> : data.settlements.slice(0, 5).map((row) => <div className="business-intelligence-row" key={row.id}><div><strong>{money(row.reportedNet)} net · {row.statementPeriodStart} to {row.statementPeriodEnd}</strong><span>{row.sourceKind.replaceAll("_", " ")} · {row.mathReason}</span></div><span className={`status ${row.mathStatus === "reconciled" ? "" : "pending"}`}>{title(row.mathStatus)}</span></div>)}</div>
      <div className="card card-pad"><div className="business-section-head"><div><span className="eyebrow">Owner draw bridge</span><h3>Human approval required</h3></div></div><form className="business-draw-form" onSubmit={submitDraw}><input required inputMode="decimal" value={drawAmount} onChange={(event) => setDrawAmount(event.target.value)} placeholder="Amount to review" /><button className="btn" disabled={proposeDraw.isPending}><ShieldCheck size={14} /> Prepare review</button></form>{data.ownerDraws.length === 0 ? <p className="business-empty">No owner draw proposals yet.</p> : data.ownerDraws.slice(0, 5).map((draw) => <div className="business-intelligence-row" key={draw.id}><div><strong>{money(draw.amount)} · {title(draw.status)}</strong><span>{draw.blockedReasons[0] || "Eligible after review"} · {draw.proposalDate}</span></div>{draw.status === "eligible" && <button className="text-link" onClick={() => void approve(draw.id, draw.eligibleAmount)} disabled={approveDraw.isPending}>Approve</button>}</div>)}</div>
    </div>
    {data.anomalies.length > 0 && <div className="business-anomaly-list"><div><TriangleAlert size={15} /><strong>Review blockers</strong></div>{data.anomalies.slice(0, 4).map((anomaly) => <span key={anomaly.id}>{anomaly.message}</span>)}</div>}
  </section>;
}