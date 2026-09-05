import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  FileText,
  Gauge,
  Landmark,
  Link2,
  LockKeyhole,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  useGetAccountingOverview,
  type AccountingOverview,
} from "@workspace/api-client-react";
import { Link } from "wouter";

function money(value: string | null | undefined, fallback = "$0") {
  if (value === null || value === undefined || value === "") return fallback;
  if (value === "NOT_AVAILABLE" || value === "UNKNOWN") return "Not available";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : fallback;
}

function signedMoney(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return "$0";
  if (value === "NOT_AVAILABLE" || value === "UNKNOWN") return "Not available";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "$0";
  return `${amount >= 0 ? "+" : "−"}${money(Math.abs(amount).toString())}`;
}

function percent(value: number | null | undefined, digits = 1) {
  return Number.isFinite(value) ? `${Number(value).toFixed(digits)}%` : "—";
}

function dateLabel(value: string | null | undefined, fallback = "Not available") {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? fallback
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function titleCase(value: string | null | undefined) {
  return (value || "Unclassified")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toneFor(value: string | null | undefined) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("protected") || normalized.includes("cash")) return "protected";
  if (normalized.includes("invest") || normalized.includes("growth")) return "growth";
  if (normalized.includes("debt") || normalized.includes("liab")) return "debt";
  return "neutral";
}

function AccountingMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className={`accounting-metric ${tone}`}>
      <span className="accounting-kicker">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  detail,
  action,
}: {
  eyebrow?: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="accounting-section-heading">
      <div>
        {eyebrow && <div className="accounting-kicker">{eyebrow}</div>}
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function AttributionRow({ label, value, tone }: { label: string; value: string; tone: string }) {
  const amount = Number(value);
  const positive = Number.isFinite(amount) && amount >= 0;
  return (
    <div className="attribution-row">
      <span className={`attribution-mark ${tone}`} />
      <span>{label}</span>
      <strong className={positive ? "positive" : "negative"}>{signedMoney(value)}</strong>
    </div>
  );
}

function StatementRow({
  label,
  value,
  emphasis = false,
  muted = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`statement-row ${emphasis ? "emphasis" : ""} ${muted ? "muted" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AccountingSkeleton() {
  return (
    <div className="accounting-skeleton" aria-label="Loading accounting overview">
      <div className="skeleton accounting-skeleton-hero" />
      <div className="accounting-skeleton-grid">
        <div className="skeleton" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
      <div className="skeleton accounting-skeleton-block" />
      <div className="accounting-skeleton-columns">
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    </div>
  );
}

function AccountingOverviewContent({
  overview,
  onFeedback,
}: {
  overview: AccountingOverview;
  onFeedback: (message: string) => void;
}) {
  const { netWorth, change, balanceSheet, capitalStatement, incomeStatement, cashFlow, metrics, reconciliation, confidence, taxYear } = overview;
  const comparison = balanceSheet.comparison;
  const confidenceRows = [
    ["Bank sync freshness", confidence.bankSyncFreshness],
    ["Ledger reconciliation", confidence.ledgerReconciliation],
    ["Categorization", confidence.categorization],
    ["Valuation freshness", confidence.valuationFreshness],
  ];

  return (
    <>
      <section className="accounting-hero animate-in delay-1">
        <div className="accounting-hero-copy">
          <div className="accounting-kicker">Authoritative household view</div>
          <h2>Net worth, with the story left in.</h2>
          <p>
            A monthly accounting review that keeps protected capital distinct from money available to spend, deploy, or move.
          </p>
          <div className="accounting-formula">
            <span>Total assets</span>
            <b>−</b>
            <span>Total liabilities</span>
            <b>=</b>
            <strong>Net worth</strong>
          </div>
        </div>
        <div className="accounting-hero-value">
          <span className="accounting-kicker">Net worth</span>
          <strong data-testid="text-accounting-net-worth">{money(netWorth.netWorth)}</strong>
          <span>as of {dateLabel(overview.asOf)}</span>
          <div className="accounting-hero-change">
            <TrendingUp size={14} />
            <strong>{signedMoney(change.month)}</strong>
            <span>this month</span>
          </div>
        </div>
      </section>

      <section className="accounting-period-bar card animate-in delay-2">
        <div>
          <span className="accounting-kicker">Review period</span>
          <strong>{overview.period.label || "Current period"}</strong>
          <span>{dateLabel(overview.period.start, "Period start")} — {dateLabel(overview.period.end, "Period end")}</span>
        </div>
        <div className="accounting-period-note">
          <Scale size={16} />
          <span>Net worth is the balance-sheet view. Liquidity is the operating view.</span>
        </div>
        <button className="btn" type="button" onClick={() => onFeedback("Accounting view is prepared for review.")}>
          <FileText size={14} /> Prepare review
        </button>
      </section>

      <section className="accounting-metric-grid animate-in delay-2">
        <AccountingMetric label="Liquid net worth" value={money(netWorth.liquidNetWorth)} detail="Assets available without valuation" tone="liquid" />
        <AccountingMetric label="Protected capital" value={money(netWorth.protectedCapital)} detail={`${percent((Number(netWorth.protectedCapital) / Math.max(Number(netWorth.netWorth), 1)) * 100)} of net worth`} tone="protected" />
        <AccountingMetric label="Invested capital" value={money(netWorth.investedCapital)} detail="Capital working toward growth" tone="growth" />
        <AccountingMetric label="Debt to assets" value={percent(metrics.debtToAssetRatio)} detail={`${money(netWorth.totalLiabilities)} total liabilities`} tone="debt" />
      </section>

      <section className="accounting-review-grid page-section animate-in delay-3">
        <article className="card card-pad">
          <SectionHeading
            eyebrow="Attribution"
            title="What changed"
            detail="Monthly and year-to-date movement reconciles back to the balance sheet."
            action={<span className={`status ${change.reconciles ? "" : "review"}`}>{change.reconciles ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {change.reconciles ? "Reconciled" : "Review"}</span>}
          />
          <div className="attribution-summary">
            <div><span>This month</span><strong>{signedMoney(change.month)}</strong></div>
            <div><span>Year to date</span><strong>{signedMoney(change.yearToDate)}</strong></div>
          </div>
          <div className="attribution-list">
            <AttributionRow label="Capital contributed" value={change.capitalContributed} tone="contributed" />
            <AttributionRow label="Investment growth" value={change.investmentGrowth} tone="growth" />
            <AttributionRow label="Debt reduction" value={change.debtReduction} tone="debt" />
            <AttributionRow label="Other movement" value={change.other} tone="other" />
          </div>
          <div className="accounting-callout"><CircleHelp size={14} /><span>Attribution explains movement; it does not represent spendable cash.</span></div>
        </article>

        <article className="card card-pad">
          <SectionHeading eyebrow="Operating view" title="Liquidity & debt" detail="The amounts that shape near-term decisions, separate from total net worth." />
          <div className="liquidity-hero"><div><span className="accounting-kicker">Liquid assets</span><strong>{money(metrics.liquidAssets)}</strong></div><span className="status">{metrics.essentialMonths.toFixed(1)} months essential</span></div>
          <div className="liquidity-split">
            <div><span>Protected liquidity</span><strong>{money(metrics.protectedLiquidity)}</strong><small>Ring-fenced</small></div>
            <div><span>Unrestricted liquidity</span><strong>{money(metrics.unrestrictedLiquidity)}</strong><small>Available for plan</small></div>
          </div>
          <div className="debt-meter">
            <div><span>Debt / net worth</span><strong>{percent(metrics.debtToNetWorth)}</strong></div>
            <div className="progress-track"><div className="progress-fill debt" style={{ width: `${Math.min(Math.max(metrics.debtToNetWorth, 0), 100)}%` }} /></div>
          </div>
          <Link href="/treasury" className="text-link accounting-inline-link">Open Treasury <ArrowUpRight size={12} /></Link>
        </article>
      </section>

      <section className="card card-pad page-section animate-in delay-3">
        <SectionHeading
          eyebrow="Balance sheet"
          title="Assets minus liabilities"
          detail="The accounting foundation underneath every plan, goal, and capital decision."
          action={<span className="accounting-date-note">Compared with {dateLabel(comparison.previousPeriod, "prior period")}</span>}
        />
        <div className="balance-sheet-grid">
          <div className="statement-column">
            <div className="statement-column-title"><span>Assets</span><strong>{money(balanceSheet.totalAssets)}</strong></div>
            {balanceSheet.assets.length === 0 && <div className="accounting-empty-line">No asset positions returned.</div>}
            {balanceSheet.assets.map((asset) => (
              <div className="balance-row" key={`${asset.name}-${asset.institution}`}>
                <div><span className={`accounting-dot ${toneFor(asset.category)}`} /><div><strong>{asset.name}</strong><small>{titleCase(asset.category)} · {asset.institution}</small></div></div>
                <div><strong>{money(asset.amount)}</strong><small>{asset.protected ? "Protected" : titleCase(asset.valueStatus)}</small></div>
              </div>
            ))}
          </div>
          <div className="statement-column liabilities">
            <div className="statement-column-title"><span>Liabilities</span><strong>{money(balanceSheet.totalLiabilities)}</strong></div>
            {balanceSheet.liabilities.length === 0 && <div className="accounting-empty-line">No liabilities returned.</div>}
            {balanceSheet.liabilities.map((liability) => (
              <div className="balance-row" key={`${liability.name}-${liability.institution}`}>
                <div><span className="accounting-dot debt" /><div><strong>{liability.name}</strong><small>{titleCase(liability.category)} · {liability.institution}</small></div></div>
                <div><strong>{money(liability.amount)}</strong><small>{liability.interestRate ? `${liability.interestRate}% interest` : "Rate not supplied"}</small></div>
              </div>
            ))}
          </div>
        </div>
        <div className="balance-sheet-total"><span>Net worth</span><strong>{money(balanceSheet.netWorth)}</strong><span>Quarter end {dateLabel(comparison.quarterEnd)}</span></div>
      </section>

      <section className="accounting-review-grid page-section animate-in delay-3">
        <article className="card card-pad">
          <SectionHeading eyebrow="Capital statement" title="Capital, not just cash" detail="Separate household funding from market growth so performance stays explainable." />
          <div className="capital-statement-list">
            <StatementRow label="Beginning capital" value={money(capitalStatement.beginningCapital)} />
            <StatementRow label="Household contributions" value={signedMoney(capitalStatement.householdContributions)} />
            <StatementRow label="Withdrawals" value={signedMoney(capitalStatement.withdrawals)} />
            <StatementRow label="Realized gains / losses" value={signedMoney(capitalStatement.realizedGainsLosses)} />
            <StatementRow label="Unrealized gains / losses" value={signedMoney(capitalStatement.unrealizedGainsLosses)} />
            <StatementRow label="Income" value={signedMoney(capitalStatement.income)} />
            <StatementRow label="Fees" value={signedMoney(capitalStatement.fees)} muted />
            <StatementRow label="Ending capital" value={money(capitalStatement.endingCapital)} emphasis />
          </div>
        </article>
        <article className="card card-pad">
          <SectionHeading eyebrow="Cash flow" title="Where cash moved" detail="Operating, investing, financing, and transfers are shown without collapsing them into net worth." />
          <div className="cash-flow-visual">
            <div className="cash-flow-total"><span>Net cash flow</span><strong>{signedMoney(cashFlow.netCashFlow)}</strong></div>
            <div className="cash-flow-bars">
              {[["Operating", cashFlow.operating, "operating"], ["Investing", cashFlow.investing, "investing"], ["Financing", cashFlow.financing, "financing"], ["Transfers", cashFlow.transfers, "transfers"]].map(([label, value, tone]) => {
                const numeric = Math.abs(Number(value));
                const max = Math.max(...[cashFlow.operating, cashFlow.investing, cashFlow.financing, cashFlow.transfers].map((item) => Math.abs(Number(item)) || 0), 1);
                return <div className="cash-flow-row" key={label}><div><span>{label}</span><strong>{signedMoney(value)}</strong></div><div className="cash-flow-track"><i className={tone} style={{ width: `${Math.max(5, (numeric / max) * 100)}%` }} /></div></div>;
              })}
            </div>
          </div>
          <Link href="/cash-flow" className="text-link accounting-inline-link">Open Cash Flow <ArrowUpRight size={12} /></Link>
        </article>
      </section>

      <section className="card card-pad page-section animate-in delay-3">
        <SectionHeading eyebrow="Income statement" title="Income, expenses, and tax context" detail="A clear operating result, with a reminder that taxable income requires its own review." action={<Link href="/income" className="text-link">Open Income <ArrowUpRight size={12} /></Link>} />
        <div className="income-statement-grid">
          <div className="income-list"><div className="statement-column-title"><span>Income</span><strong>{money(incomeStatement.totalIncome)}</strong></div>{(incomeStatement.income || []).map((item) => <StatementRow key={item.category} label={item.category} value={money(item.amount)} />)}</div>
          <div className="income-list expenses"><div className="statement-column-title"><span>Expenses</span><strong>{money(incomeStatement.totalExpenses)}</strong></div>{(incomeStatement.expenses || []).map((item) => <StatementRow key={item.category} label={item.category} value={money(item.amount)} />)}</div>
          <div className="income-result"><span>Net cash income</span><strong>{money(incomeStatement.netCashIncome)}</strong><small>{incomeStatement.taxableIncomeDisclaimer || "Taxable income is not determined by this view."}</small></div>
        </div>
      </section>

      <section className="accounting-lower-grid page-section animate-in delay-3">
        <article className="card card-pad">
          <SectionHeading eyebrow="Data confidence" title={`${confidence.score}/100 · ${confidence.label}`} detail="Confidence tells you how much review weight to give this snapshot." action={<Gauge size={17} color="var(--ink)" />} />
          <div className="confidence-list">{confidenceRows.map(([label, value]) => <div key={label as string}><div><span>{label}</span><strong>{percent(value as number, 0)}</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(Math.max(value as number, 0), 100)}%` }} /></div></div>)}</div>
          <div className="accounting-callout"><ShieldCheck size={14} /><span>Review confidence before making a capital decision. This view is advisory, not a guarantee.</span></div>
        </article>
        <article className="card card-pad">
          <SectionHeading eyebrow="Reconciliation" title={reconciliation.ledgerBalanced ? "Ledger is balanced" : "Review needed"} detail="A balanced ledger connects account activity to the reported view." action={<span className={`status ${reconciliation.ledgerBalanced ? "" : "review"}`}>{reconciliation.ledgerBalanced ? <Check size={12} /> : <AlertTriangle size={12} />} {titleCase(reconciliation.status)}</span>} />
          <div className="reconciliation-facts"><div><strong>{reconciliation.accountsIncluded}</strong><span>accounts included</span></div><div><strong>{reconciliation.uncategorizedTransactions}</strong><span>uncategorized</span></div><div><strong>{reconciliation.staleAccounts}</strong><span>stale accounts</span></div></div>
          <div className="accounting-callout"><Scale size={14} /><span>{reconciliation.crossView.note}</span></div>
          <div className="reconciliation-facts">{reconciliation.crossView.separateScopes.map((scope) => <div key={scope.scope}><strong>{scope.status === "separate_scope" ? "Separate" : money(scope.amount)}</strong><span>{titleCase(scope.scope)} scope</span></div>)}</div>
          <Link href="/transactions" className="text-link accounting-inline-link">Review transactions <ArrowUpRight size={12} /></Link>
        </article>
      </section>

      <section className="accounting-tax-panel page-section animate-in delay-3">
        <div className="accounting-tax-icon"><FileCheck2 size={18} /></div>
        <div className="accounting-tax-copy"><div className="accounting-kicker">Tax preparation · {taxYear.year}</div><h2>A useful starting point, not a filing.</h2><p>{taxYear.disclaimer || "This workspace is for planning and review. Confirm tax treatment with your tax professional."}</p><div className="tax-facts"><span><strong>{taxYear.documentsCollected}</strong> documents collected</span><span><strong>{taxYear.missingDocuments.length}</strong> items to locate</span><span><strong>{money(taxYear.realizedGainsLosses)}</strong> realized gains / losses</span></div></div>
        <Link href="/documents" className="btn btn-primary">Open documents <ChevronRight size={14} /></Link>
      </section>

      <section className="card card-pad page-section animate-in delay-3">
        <SectionHeading eyebrow="Account coverage" title="Included in this view" detail="Protected and restricted accounts stay visible as context while their controls remain distinct." action={<Link href="/accounts" className="btn">Manage accounts <ArrowUpRight size={13} /></Link>} />
        <div className="accounting-account-table">
          <div className="accounting-account-header"><span>Account</span><span>Classification</span><span>Last sync</span><span>Balance</span></div>
          {overview.accounts.length === 0 && <div className="accounting-empty-state"><Landmark size={18} /><strong>No accounts returned</strong><span>Connect or review an account to build the household view.</span></div>}
          {overview.accounts.map((account) => (
            <div className="accounting-account-row" key={account.id}>
              <div className="accounting-account-name"><span className={`accounting-account-icon ${account.protected ? "protected" : ""}`}><WalletCards size={14} /></span><div><strong>{account.name}</strong><span>{account.institution} · {titleCase(account.accountType)}</span></div></div>
              <div className="accounting-account-tags"><span className={`status ${account.protected ? "" : "review"}`}>{account.protected ? <LockKeyhole size={11} /> : <Link2 size={11} />} {account.protected ? "Protected" : account.restricted ? "Restricted" : "Spendable"}</span>{account.includedInNetWorth && <span className="accounting-included"><Check size={11} /> Net worth</span>}</div>
              <span className="accounting-sync">{dateLabel(account.lastSync, "Not synced")}</span>
              <strong className="accounting-account-balance">{money(account.balance)}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="accounting-disclaimer"><AlertTriangle size={14} /><span>{overview.disclaimer || "Accounting data is for household planning and review. Confirm tax and investment treatment with qualified professionals."}</span></div>
    </>
  );
}

export default function AccountingPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useGetAccountingOverview();
  const overview = query.data;

  return (
    <main className="content accounting-page">
      <div className="page-heading animate-in">
        <div>
          <div className="eyebrow">Accounting / overview</div>
          <h1>See the whole balance.</h1>
          <p>A precise household accounting view for the monthly review: what you own, what you owe, and why the number moved.</p>
        </div>
        <div className="heading-actions">
          <span className="status"><ShieldCheck size={12} /> Review-ready</span>
          <button className="btn" type="button" onClick={() => { void query.refetch(); }} disabled={query.isFetching} data-testid="button-refresh-accounting"><RefreshCw size={14} className={query.isFetching ? "accounting-spin" : ""} /> {query.isFetching ? "Refreshing…" : "Refresh view"}</button>
        </div>
      </div>
      {query.isLoading && <AccountingSkeleton />}
      {query.isError && (
        <section className="card card-pad accounting-inline-error" role="alert">
          <AlertTriangle size={18} />
          <div><strong>Accounting view is temporarily unavailable.</strong><span>No numbers were changed. Try again when the household service is ready.</span></div>
          <button className="btn" type="button" onClick={() => { void query.refetch(); }}>Try again</button>
        </section>
      )}
      {!query.isLoading && !query.isError && !overview && (
        <section className="card card-pad accounting-empty-state accounting-page-empty">
          <Scale size={21} />
          <strong>No accounting snapshot yet.</strong>
          <span>Once account activity is available, this page will explain the household balance from assets through cash flow.</span>
          <Link href="/accounts" className="btn btn-primary">Review accounts <ArrowUpRight size={13} /></Link>
        </section>
      )}
      {overview && <AccountingOverviewContent overview={overview} onFeedback={onFeedback} />}
    </main>
  );
}