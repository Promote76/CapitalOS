import { FormEvent, useState } from "react";
import { AlertCircle, ArrowUpRight, BriefcaseBusiness, Building2, CircleDollarSign, Landmark, LockKeyhole, Plus, RefreshCw, ShieldCheck, TrendingUp } from "lucide-react";
import { getGetBusinessOverviewQueryKey, useCreateBusinessDistribution, useCreateBusinessExpense, useCreateBusinessRevenue, useGetBusinessOverview } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const money = (value?: string) => Number(value ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const title = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function BusinessPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const queryClient = useQueryClient();
  const overview = useGetBusinessOverview();
  const addRevenue = useCreateBusinessRevenue();
  const addExpense = useCreateBusinessExpense();
  const proposeDistribution = useCreateBusinessDistribution();
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
      if (form === "distribution") await proposeDistribution.mutateAsync({ data: { businessId, distributionDate: new Date().toISOString().slice(0, 10), amount, notes: description.trim() } });
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
  </main>;
}