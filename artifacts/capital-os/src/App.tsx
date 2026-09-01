import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createContribution,
  useGetCashFlow,
  useGetFinanceInsights,
  useGetSafeToDeploy,
  useListFinancialAccounts,
  useCreateManualFinancialAccount,
  useGetBudget,
  useGetHousehold,
  useUpdatePrivacySettings,
  useGetDashboard,
  useListContributions,
  useListBills,
  useListUpcomingExpenses,
  useListIncomeSources,
  getGetSafeToDeployQueryKey,
  getListBillsQueryKey,
  getListUpcomingExpensesQueryKey,
  getListIncomeSourcesQueryKey,
  type UpcomingExpense,
  type IncomeSource,
  type DashboardSnapshot,
} from '@workspace/api-client-react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  ClipboardList,
  Compass,
  FilePlus2,
  FileText,
  Gauge,
  Home,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  WalletCards,
  TrendingUp,
  PiggyBank,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();

type ModalKind = 'contribution' | 'transfer' | 'strategy' | 'property' | null;
type Transaction = { id: number; date: string; name: string; category: string; amount: number; status: string };

function displayMoney(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : fallback;
}

function displayDate(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const primaryNav = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/budget', label: 'Budget', icon: ClipboardList },
  { href: '/cash-flow', label: 'Cash Flow', icon: TrendingUp },
  { href: '/accounts', label: 'Accounts', icon: Landmark },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/strategies', label: 'Strategies', icon: Compass },
  { href: '/portfolio', label: 'Portfolio', icon: BarChart3 },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/risk', label: 'Risk & readiness', icon: ShieldCheck },
];
const planningNav = [
  { href: '/bills', label: 'Bills', icon: ReceiptText },
  { href: '/upcoming-expenses', label: 'Upcoming expenses', icon: CalendarDays },
  { href: '/income', label: 'Income', icon: CircleDollarSign },
];
const secondaryNav = [
  { href: '/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/contributions', label: 'Contributions', icon: WalletCards },
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/documents', label: 'Documents', icon: ClipboardList },
  { href: '/insights', label: 'Insights', icon: Lightbulb },
];

function AppShell({
  children,
  onAction,
  onFeedback,
  menuOpen,
  setMenuOpen,
}: {
  children: ReactNode;
  onAction: (kind: Exclude<ModalKind, null>) => void;
  onFeedback: (message: string) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;
}) {
  const [location] = useLocation();
  const isActive = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} data-testid="sidebar-navigation">
        <div className="brand-mark">
          <div className="brand-glyph" aria-hidden="true" />
          <div><div className="brand-name">capital os</div><div className="brand-sub">family capital / 01</div></div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Plan</div>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? 'active' : ''}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMenuOpen(false)}><Icon /><span>{item.label}</span></Link>;
          })}
          <div className="nav-label nav-label-sub">Plan ahead</div>
          {planningNav.map((item) => {
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? 'active' : ''}`} data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`} onClick={() => setMenuOpen(false)}><Icon /><span>{item.label}</span></Link>;
          })}
        </div>
        <div className="nav-group">
          <div className="nav-label">Keep track</div>
          {secondaryNav.map((item) => {
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} className={`nav-link ${isActive(item.href) ? 'active' : ''}`} data-testid={`link-nav-${item.label.toLowerCase()}`} onClick={() => setMenuOpen(false)}><Icon /><span>{item.label}</span></Link>;
          })}
        </div>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <strong>THE NORTH STAR</strong>
          <p>A first duplex, funded with patience and a plan that holds.</p>
        </div>
        <Link href="/settings" className={`nav-link ${isActive('/settings') ? 'active' : ''}`} data-testid="link-nav-settings" onClick={() => setMenuOpen(false)}><SettingsIcon /><span>Settings</span></Link>
      </aside>
      {menuOpen && <button className="modal-backdrop" style={{ zIndex: 20, background: 'rgba(35,70,62,.16)' }} aria-label="Close navigation" data-testid="button-close-mobile-nav" onClick={() => setMenuOpen(false)} />}
      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="mobile-menu" aria-label="Open navigation" data-testid="button-open-mobile-nav" onClick={() => setMenuOpen(true)}><Menu size={17} /></button>
            <span>Capital OS</span><ChevronRight size={13} /><strong>{location === '/' ? 'Overview' : (primaryNav.concat(planningNav, secondaryNav).find((item) => item.href === location)?.label || 'Workspace')}</strong>
          </div>
          <nav className="topnav" aria-label="Primary navigation">
            {[...primaryNav, { href: '/settings', label: 'Settings', icon: SettingsIcon }].map((item) => (
              <Link key={item.href} href={item.href} className={`topnav-link ${isActive(item.href) ? 'active' : ''}`} data-testid={`link-topnav-${item.label.toLowerCase().replaceAll(' ', '-')}`}>
                {item.label === 'Overview' ? 'Dashboard' : item.label.replace('Risk & readiness', 'Risk')}
              </Link>
            ))}
          </nav>
          <div className="top-actions">
            <button className="icon-btn" aria-label="Search" data-testid="button-search" onClick={() => onFeedback('Search is ready when your workspace grows.') }><Search size={16} /></button>
            <button className="icon-btn" aria-label="Notifications" data-testid="button-notifications" onClick={() => onFeedback('No new plan reminders. You are clear for this week.')}><Bell size={16} /></button>
            <div className="avatar" data-testid="avatar-account">AM</div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: ReactNode; description?: string; actions?: ReactNode }) {
  return <div className="page-heading animate-in">
    <div><div className="eyebrow">{eyebrow}</div><h1 data-testid="text-page-title">{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="heading-actions">{actions}</div>}
  </div>;
}

function CardTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="card-title-row"><div><div className="card-title">{title}</div>{subtitle && <div className="card-subtitle">{subtitle}</div>}</div>{action}</div>;
}

function Progress({ value, className = '' }: { value: number; className?: string }) {
  return <div className={`progress-track ${className}`}><div className="progress-fill" style={{ width: `${Math.min(value, 100)}%` }} /></div>;
}

function QuickActions({ onAction }: { onAction: (kind: Exclude<ModalKind, null>) => void }) {
  return <div className="card card-pad page-section animate-in delay-2">
    <CardTitle title="Small moves, held together" subtitle="Your weekly rhythm keeps the bigger plan moving." />
    <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
      <button className="btn btn-gold" data-testid="button-quick-contribution" onClick={() => onAction('contribution')}><Plus size={15} /> Add contribution</button>
      <button className="btn" data-testid="button-quick-transfer" onClick={() => onAction('transfer')}><ArrowRightLeft size={15} /> Transfer</button>
      <button className="btn" data-testid="button-quick-strategy" onClick={() => onAction('strategy')}><Compass size={15} /> Explore a strategy</button>
      <button className="btn" data-testid="button-quick-property-note" onClick={() => onAction('property')}><NotebookPen size={15} /> Property note</button>
    </div>
  </div>;
}

function Dashboard({ onAction, onFeedback, transactions, dashboard, backendIssue }: { onAction: (kind: Exclude<ModalKind, null>) => void; onFeedback: (message: string) => void; transactions: Transaction[]; dashboard?: DashboardSnapshot; backendIssue?: boolean }) {
  const monthTotal = transactions.reduce((sum, item) => sum + item.amount, 0);
  const goal = dashboard?.goal;
  const allocation = dashboard?.allocation;
  const portfolio = dashboard?.portfolio;
  const confidence = dashboard?.strategies[0]?.confidenceScore ?? 78;
  return <main className="content">
    {backendIssue && <div className="card card-pad" role="status" style={{ marginBottom: 22, borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}><strong>Showing the last saved view.</strong><p style={{ margin: '5px 0 0', color: 'var(--ink-soft)', fontSize: 12 }}>The household service is temporarily unavailable. Your local plan view is safe to review, and it will refresh automatically.</p></div>}
    <PageHeading eyebrow="Monday, 14 October 2024" title={<>Make room for the<br /><em>long view.</em></>} description="A clear week starts here. Your duplex plan is healthy, and the next small move is already in view." actions={<><button className="btn" data-testid="button-dashboard-export" onClick={() => onFeedback('Snapshot prepared for your next review.')}><ArrowDownLeft size={15} /> Export view</button><button className="btn btn-primary" data-testid="button-dashboard-contribution" onClick={() => onAction('contribution')}><Plus size={15} /> Record contribution</button></>} />
    <div className="dashboard-grid">
      <section className="hero-card card animate-in delay-1">
        <div className="eyebrow" style={{ color: '#58766a' }}>Primary goal / 01</div>
        <h2>A first duplex<br />of your own.</h2>
        <p>Steady capital, thoughtful leverage, and a home with room for the people you love.</p>
        <div className="hero-stat"><div className="hero-stat-value" data-testid="text-goal-total">{displayMoney(goal?.currentAmount, '$48,260')}</div><div className="hero-stat-label">of {displayMoney(goal?.targetAmount, '$120,000')} reserve</div></div>
        <div className="hero-progress"><div className="hero-progress-meta"><span>{goal?.progressPercent.toFixed(1) ?? '40.2'}% funded</span><span>Target: {displayDate(goal?.targetDate, 'Jun 2027')}</span></div><Progress value={goal?.progressPercent ?? 40.2} /></div>
      </section>
      <section className="card card-pad weekly-card animate-in delay-1">
        <CardTitle title="This week’s allocation" subtitle="Automatic on Friday, 18 October" action={<button className="icon-btn" data-testid="button-allocation-menu" onClick={() => onFeedback('Allocation is already set for Friday.')}><MoreHorizontal size={16} /></button>} />
        <div className="weekly-amount" data-testid="text-weekly-total">{displayMoney(allocation?.totalWeekly, '$250')} <span>/ week</span></div>
        <div className="allocation-list">
        {[['Duplex Reserve', displayMoney(allocation?.duplexReserve, '$200'), 'var(--color-protected)'], ['Capital OS', displayMoney(allocation?.capitalOs, '$25'), 'var(--color-primary)'], ['Opportunity Reserve', displayMoney(allocation?.opportunityReserve, '$25'), 'var(--color-opportunity)']].map(([name, value, color]) => <div className="allocation-row" key={name}><i className="allocation-dot" style={{ background: color }} /><span className="allocation-name">{name}</span><span className="allocation-value">{value}</span></div>)}
        </div>
        <button className="btn" style={{ width: '100%', marginTop: 22 }} data-testid="button-edit-allocation" onClick={() => onAction('contribution')}><Pencil size={14} /> Edit allocation</button>
      </section>
    </div>
    <QuickActions onAction={onAction} />
     <FinancePulse />
    <div className="capital-state-grid animate-in delay-3">
      <section className="capital-state-card protected" data-testid="card-protected-capital">
        <div className="state-icon"><ShieldCheck size={17} /></div>
        <div className="state-label">Protected Capital <span className="status" style={{ marginLeft: 6 }}>Locked</span></div>
        <div className="state-value" data-testid="text-protected-capital">{displayMoney(portfolio?.protectedCapital, '$48,260')}</div>
        <div className="state-caption">Protected capital is ring-fenced and unavailable to experimental strategies.</div>
      </section>
      <section className="capital-state-card active" data-testid="card-active-capital">
        <div className="state-icon"><CircleDollarSign size={17} /></div>
        <div className="state-label">Active Capital <span className="status" style={{ marginLeft: 6, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>Working</span></div>
        <div className="state-value" data-testid="text-active-capital">{displayMoney(portfolio?.activeCapital, '$1,180')}</div>
        <div className="state-caption">Authorized for productive deployment while the duplex reserve stays protected.</div>
      </section>
      <section className="capital-state-card confidence" data-testid="card-confidence-score">
        <div className="state-icon"><Gauge size={17} /></div>
        <div className="state-label">Capital Confidence <span className="info-note" title="Confidence reflects historical evidence, execution quality, system health, and risk controls. It is not a guarantee of future returns.">i</span></div>
        <div className="confidence-score"><strong>{confidence.toFixed(0)} / 100</strong><span>Limited Capital</span></div>
        <div className="state-caption">Confidence reflects evidence, execution quality, system health, and risk controls. Not a guarantee of future returns.</div>
      </section>
    </div>
    <div className="section-grid">
      <section className="card card-pad animate-in delay-3">
        <CardTitle title="Capital trajectory" subtitle="Total capital across your reserves" action={<div className="legend"><span><i style={{ background: 'var(--color-primary)' }} />Actual</span><span><i style={{ background: 'var(--color-protected)' }} />Plan</span></div>} />
        <div className="chart-area" data-testid="chart-capital-trajectory"><div className="chart-grid-lines"><span /><span /><span /><span /><span /></div><svg className="chart-svg" viewBox="0 0 600 145" preserveAspectRatio="none" aria-label="Capital trajectory chart"><path d="M0 132 C55 128 73 117 105 121 S170 110 205 101 S268 108 302 86 S370 81 401 72 S470 45 510 50 S560 23 600 12" fill="none" stroke="#23463e" strokeWidth="3" strokeLinecap="round" /><path d="M0 132 C55 128 73 124 105 119 S170 111 205 101 S268 92 302 80 S370 70 401 61 S470 47 510 35 S560 21 600 10 L600 145 L0 145Z" fill="#d9e7df" opacity=".46" /><path d="M0 138 C60 130 108 128 150 116 S224 105 278 94 S354 80 405 65 S486 55 540 37 S574 29 600 19" fill="none" stroke="#e2bd67" strokeWidth="2" strokeDasharray="5 6" /></svg><div className="chart-labels"><span>Jan ’24</span><span>Apr</span><span>Jul</span><span>Oct ’24</span><span>Jan ’25</span><span>Apr ’25</span></div></div>
      </section>
      <section className="card card-pad animate-in delay-3">
        <CardTitle title="Recent movement" subtitle={`${monthTotal.toLocaleString()} moved this month`} action={<Link href="/transactions" className="mono-label" data-testid="link-view-transactions">View all <ArrowUpRight size={12} style={{ verticalAlign: 'middle' }} /></Link>} />
        <div className="activity-list">{transactions.slice(0, 3).map((item) => <div className="activity-item" key={item.id}><div className="activity-icon"><ArrowDownLeft /></div><div className="activity-copy"><strong>{item.name}</strong><span>{item.date} · {item.category}</span></div><div className="activity-amount">+${item.amount}</div></div>)}</div>
      </section>
    </div>
    <section className="card card-pad page-section">
      <CardTitle title="Funding checkpoints" subtitle="Three accounts, one patient plan." action={<Link href="/goals" className="btn" data-testid="link-view-goals">Open goals <ChevronRight size={14} /></Link>} />
      <div>{[['Duplex Reserve', '$48,260 of $120,000', 40.2], ['Opportunity Reserve', '$6,840 of $15,000', 45.6], ['Capital OS', '$1,180 of $2,400', 49.2]].map(([name, amount, pct], index) => <div className="goal-row" key={name}><div><div className="goal-label"><i style={{ background: index === 0 ? 'var(--color-protected)' : index === 1 ? 'var(--color-opportunity)' : 'var(--color-primary)' }} />{name}</div><div className="goal-meta">{amount}</div></div><div className="goal-progress"><b style={{ width: `${pct}%`, background: index === 0 ? 'var(--color-protected)' : index === 1 ? 'var(--color-opportunity)' : 'var(--color-primary)' }} /></div><div className="goal-pct">{pct}%</div></div>)}</div>
    </section>
  </main>;
}

function GoalsPage({ onAction }: { onAction: (kind: Exclude<ModalKind, null>) => void }) {
  return <main className="content">
    <PageHeading eyebrow="Plan / goals" title={<>Give the future<br /><em>a landing place.</em></>} description="Goals turn a good intention into a sequence of calm, visible choices." actions={<button className="btn btn-primary" data-testid="button-add-goal" onClick={() => onAction('contribution')}><Plus size={15} /> Add a goal</button>} />
    <section className="card card-pad stat-strip animate-in delay-1">{[['$56,280', 'across all goals', '↑ $1,000 this month'], ['40.2%', 'duplex reserve funded', 'On its planned pace'], ['Jun 2027', 'target acquisition', '32 months to go'], ['$250', 'weekly rhythm', 'Next transfer Friday']].map(([value, label, detail], index) => <div className="stat-cell" key={label}><div className="mono-label">{label}</div><div className="stat-value" data-testid={`text-goal-stat-${index}`}>{value}</div><div className="stat-detail">{detail}</div></div>)}</section>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Your capital map" subtitle="The order matters. Protect the foundation, then create room to move." />
      {[['Duplex Reserve', 'The down payment and closing costs for a two-unit home.', '$48,260', '$120,000', 40.2, 'Jun 2027', 'Primary'], ['Opportunity Reserve', 'A flexible buffer for inspection, repairs, or the right moment.', '$6,840', '$15,000', 45.6, 'Dec 2025', 'Flexible'], ['Capital OS', 'The operating reserve that keeps this plan self-sustaining.', '$1,180', '$2,400', 49.2, 'Mar 2025', 'Foundation']].map(([name, desc, current, target, pct, date, tag], index) => <div className="goal-row" style={{ gridTemplateColumns: 'minmax(230px, 1.2fr) minmax(180px, 1fr) 90px 76px' }} key={name}><div><div className="goal-label"><i style={{ background: index === 0 ? 'var(--color-protected)' : index === 1 ? 'var(--color-opportunity)' : 'var(--color-primary)' }} />{name}<span className="status" style={{ marginLeft: 4, background: index === 0 ? 'var(--color-protected-soft)' : index === 1 ? 'var(--color-opportunity-soft)' : 'var(--color-primary-soft)' }}>{tag}</span></div><div className="goal-meta">{desc}</div></div><div className="goal-progress"><b style={{ width: `${pct}%`, background: index === 0 ? 'var(--color-protected)' : index === 1 ? 'var(--color-opportunity)' : 'var(--color-primary)' }} /></div><div className="goal-pct"><strong>{current}</strong><br /><span style={{ color: 'var(--ink-soft)', fontSize: 9 }}>of {target}</span></div><div className="goal-pct" style={{ color: 'var(--ink-soft)' }}>{date}</div></div>)}
    </section>
    <QuickActions onAction={onAction} />
  </main>;
}

function StrategiesPage({ onAction }: { onAction: (kind: Exclude<ModalKind, null>) => void }) {
  const [filter, setFilter] = useState('All strategies');
  const [recommendation, setRecommendation] = useState('pending');
  const cards = [
    { title: 'Duplex first', type: 'Core plan', icon: Home, copy: 'Keep the reserve liquid, visible, and pointed at one acquisition window.', featured: true },
    { title: 'The steady climb', type: 'Contribution rhythm', icon: Gauge, copy: 'A $250 weekly rhythm with room to increase after each annual review.', featured: false },
    { title: 'Room to move', type: 'Optionality', icon: Compass, copy: 'A separate reserve keeps a great inspection report from becoming a scramble.', featured: false },
    { title: 'Tax-aware timing', type: 'Planning note', icon: Landmark, copy: 'A simple view of account location and timing before a future closing.', featured: false },
  ];
  return <main className="content">
    <PageHeading eyebrow="Plan / strategies" title={<>Quiet conviction<br /><em>beats busy money.</em></>} description="A handful of strategies, each with a job. Keep the set small enough to remember." actions={<button className="btn btn-primary" data-testid="button-start-strategy" onClick={() => onAction('strategy')}><Sparkles size={15} /> Start a strategy</button>} />
    <div className="filter-bar"><SlidersHorizontal size={14} color="var(--ink-soft)" />{['All strategies', 'Core plan', 'Optionality', 'Planning note'].map((label) => <button className={`filter-chip ${filter === label ? 'active' : ''}`} key={label} onClick={() => setFilter(label)} data-testid={`button-strategy-filter-${label.toLowerCase().replaceAll(' ', '-')}`}>{label}</button>)}</div>
    <div className="strategy-grid">{cards.filter((card) => filter === 'All strategies' || card.type === filter).map((card, index) => { const Icon = card.icon; return <section className={`card strategy-card ${card.featured ? 'featured' : ''} animate-in delay-${Math.min(index + 1, 3)}`} key={card.title}><div className="strategy-icon"><Icon size={18} /></div><div className="mono-label">{card.type}</div><h3>{card.title}</h3><p>{card.copy}</p><button className={`btn ${card.featured ? 'btn-gold' : ''}`} data-testid={`button-open-strategy-${index}`} onClick={() => onAction('strategy')}>{card.featured ? 'Review plan' : 'View details'} <ArrowUpRight size={14} /></button></section>; })}</div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Strategy graduation" subtitle="Capital earns its way forward. No strategy skips a stage." />
      <div className="stage-stepper" data-testid="strategy-stage-stepper">{['Research', 'Backtest', 'Shadow', 'Paper', 'Micro-Live', 'Approved', 'Production'].map((stage, index) => <div className={`stage-step ${index < 3 ? 'complete' : index === 3 ? 'current' : ''}`} key={stage} data-testid={`stage-${stage.toLowerCase().replaceAll('-', '-')}`}>{stage}</div>)}</div>
      <div className="ai-card" style={{ marginTop: 22 }} data-testid="card-ai-recommendation">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:14 }}><div style={{ display:'flex', gap:11 }}><div className="state-icon" style={{ background:'var(--color-opportunity-soft)', color:'var(--color-opportunity)', marginBottom:0 }}><Sparkles size={17} /></div><div><div className="state-label">AI CIO recommendation <span className="status" style={{ marginLeft:6 }}>Advisory Only</span></div><strong style={{ display:'block', fontSize:15, marginTop:7 }}>Keep the duplex reserve untouched</strong></div></div><span className={`status ${recommendation === 'pending' ? 'pending' : ''}`}>{recommendation === 'pending' ? 'Recommendation pending approval' : recommendation === 'accepted' ? 'Accepted for review' : 'Rejected'}</span></div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, margin:'18px 0', color:'var(--text-secondary)', fontSize:11, lineHeight:1.5 }}><div><strong style={{ display:'block', color:'var(--text-primary)', marginBottom:4 }}>Reason</strong>Reserve pace is already aligned with the June 2027 window.</div><div><strong style={{ display:'block', color:'var(--text-primary)', marginBottom:4 }}>Risk impact</strong>Lower exposure to accidental strategy allocation.</div><div><strong style={{ display:'block', color:'var(--text-primary)', marginBottom:4 }}>Expected benefit</strong>More confidence when the right property appears.</div></div>
        <div style={{ color:'var(--text-muted)', fontSize:10, marginBottom:12 }}>Evidence: contribution consistency, liquidity review, and protected-capital threshold. You remain in control.</div>
        <div style={{ display:'flex', gap:8 }}><button className="btn btn-primary" data-testid="button-accept-ai-recommendation" onClick={() => setRecommendation('accepted')}><Check size={14} /> Accept for review</button><button className="btn" data-testid="button-reject-ai-recommendation" onClick={() => setRecommendation('rejected')}>Reject</button></div>
      </div>
    </section>
    <section className="card card-pad page-section"><CardTitle title="A note from your plan" subtitle="Last reviewed 07 October 2024" /><div style={{ display:'flex', gap:15, alignItems:'flex-start' }}><div className="activity-icon" style={{ background:'var(--marigold)', flex:'0 0 auto' }}><Lightbulb size={15} /></div><p style={{ margin:0, color:'var(--ink-soft)', fontSize:13, lineHeight:1.65, maxWidth:720 }}>“The best next move is not always the fastest one. Your current reserve pace keeps a June 2027 window realistic without asking the rest of life to wait.”</p></div></section>
  </main>;
}

function PortfolioPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  return <main className="content">
    <PageHeading eyebrow="Plan / portfolio" title={<>Know what is<br /><em>carrying the load.</em></>} description="A composed view of where your family capital sits today—not a screen that asks you to react." actions={<button className="btn" data-testid="button-portfolio-export" onClick={() => onFeedback('Portfolio snapshot prepared.')}><ArrowDownLeft size={15} /> Export snapshot</button>} />
    <div className="portfolio-split">
      <section className="card card-pad animate-in delay-1"><CardTitle title="Capital composition" subtitle="Total tracked capital · $56,280" /><div className="donut-wrap"><div className="donut"><div className="donut-center"><strong>$56.3k</strong><span>total capital</span></div></div><div className="holding-list">{[['Duplex Reserve','63%','var(--color-primary)'],['Opportunity Reserve','20%','var(--color-opportunity)'],['Capital OS','11%','var(--color-protected)'],['Other cash','6%','var(--color-warning)']].map(([name, pct, color]) => <div className="holding-row" key={name}><i style={{ background:color }} /><span>{name}</span><b>{pct}</b></div>)}</div></div></section>
      <section className="card card-pad animate-in delay-1"><CardTitle title="Resilience check" subtitle="How the plan behaves in three ordinary scenarios." /><div className="activity-list">{[['Emergency buffer', '8.4 months of core expenses', 'Strong', 'var(--ink)'], ['Acquisition liquidity', '100% available within 5 days', 'Ready', 'var(--marigold)'], ['Single-account exposure', 'Largest account is 63% of total', 'Watch', 'var(--clay)']].map(([label, desc, status, color]) => <div className="activity-item" key={label}><div className="activity-icon" style={{ background: 'var(--secondary)', color }}><ShieldCheck size={14} /></div><div className="activity-copy"><strong>{label}</strong><span>{desc}</span></div><span className="status" style={{ color, background: 'var(--secondary)' }}>{status}</span></div>)}</div></section>
    </div>
      <section className="card card-pad page-section"><CardTitle title="Accounts & sleeves" subtitle="Last synced 14 October 2024 at 08:42" action={<button className="btn" data-testid="button-sync-portfolio" onClick={() => onFeedback('Account balances are already current.')}><RotateCcw size={14} /> Sync now</button>} /><div className="table-wrap"><table className="table"><thead><tr><th>Account</th><th>Purpose</th><th>Balance</th><th>Access</th><th /></tr></thead><tbody>{[['Vanguard brokerage · 4821','Duplex Reserve','$48,260','Liquid'],['Ally High Yield · 1094','Opportunity Reserve','$6,840','Liquid'],['Capital OS checking · 0037','Operating reserve','$1,180','Everyday'],['Series I bonds · 7410','Long horizon','$4,920','12-mo hold']].map((row, index) => <tr key={row[0]}><td><strong>{row[0]}</strong></td><td>{row[1]}</td><td className="font-mono">{row[2]}</td><td><span className={`status ${index === 3 ? 'pending' : ''}`}>{row[3]}</span></td><td><button className="icon-btn" data-testid={`button-account-menu-${index}`} onClick={() => onFeedback(`${row[0]} is connected to your plan.`)}><MoreHorizontal size={15} /></button></td></tr>)}</tbody></table></div></section>
  </main>;
}

function PropertiesPage({ onAction }: { onAction: (kind: Exclude<ModalKind, null>) => void }) {
  return <main className="content">
    <PageHeading eyebrow="Plan / properties" title={<>Make the future<br /><em>specific enough to visit.</em></>} description="A small, thoughtful watchlist for the first duplex—and the standards it needs to meet." actions={<button className="btn btn-primary" data-testid="button-add-property" onClick={() => onAction('property')}><Plus size={15} /> Add property note</button>} />
    <div className="section-grid-wide">
      <section className="card property-card animate-in delay-1"><div className="property-banner" /><div className="property-body"><div className="mono-label">Watchlist / preferred profile</div><h3>Two-family, close to home</h3><p style={{ color:'var(--ink-soft)', fontSize:12, lineHeight:1.55, maxWidth:500 }}>A duplex with a sound structure, an independent entrance, and enough margin to make being a good neighbor feel easy.</p><div className="property-facts"><span>Target range<b>$420–560k</b></span><span>Preferred area<b>Northside / transit</b></span><span>Units<b>2 · 2–3 bed</b></span></div><button className="btn btn-primary" data-testid="button-add-property-note" onClick={() => onAction('property')}><NotebookPen size={14} /> Add a research note</button></div></section>
      <section className="card card-pad animate-in delay-2"><CardTitle title="Acquisition readiness" subtitle="The things within your control." /><div style={{ display:'grid', gap:18 }}>{[['Reserve pace', 82, 'On plan'], ['Financing picture', 67, 'In progress'], ['Property criteria', 91, 'Clear']].map(([name, value, status]) => <div key={name}><div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:11 }}><strong>{name}</strong><span className="font-mono" style={{ color:'var(--ink-soft)', fontSize:10 }}>{status}</span></div><Progress value={Number(value)} /></div>)}</div><div style={{ borderTop:'1px solid var(--line)', marginTop:26, paddingTop:18, display:'flex', gap:10 }}><ShieldCheck size={18} color="var(--ink)" /><p style={{ margin:0, color:'var(--ink-soft)', fontSize:11, lineHeight:1.5 }}>No need to rush the search. Your cash position is building the right to say no.</p></div></section>
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Property readiness milestones" subtitle="Each checkpoint has a target, a status, and one useful next action." />
      <div className="milestone-grid" data-testid="property-readiness-milestones">{[
        ['01', 'Down Payment Fund', 'On track · $48,260 / $120k', 'Review contribution pace', 'complete'],
        ['02', 'Closing Cost Reserve', 'Building · $6,840 / $15k', 'Keep $25 weekly split', 'complete'],
        ['03', 'Credit Readiness', 'Healthy · 762 score', 'Confirm annual report', 'complete'],
        ['04', 'Market Selection', 'In progress · Northside', 'Compare 3 neighborhoods', 'current'],
        ['05', 'Financing Readiness', 'Next · lender conversation', 'Collect income docs', ''],
        ['06', 'Property Search', 'Future · criteria set', 'Wait for right listing', ''],
        ['07', 'Offer Readiness', 'Future · not started', 'Draft offer checklist', ''],
        ['08', 'Acquisition', 'Future · target Jun 2027', 'Protect closing reserve', ''],
      ].map(([number, title, detail, next, status]) => <div className={`milestone-card ${status}`} key={number}><div className="milestone-number">{number} {status === 'complete' ? '· Complete' : status === 'current' ? '· Current' : '· Future'}</div><strong>{title}</strong><p>{detail}</p><p style={{ marginTop:7, color: status === 'complete' ? '#15803D' : status === 'current' ? 'var(--color-primary)' : 'var(--text-muted)' }}><b>Next:</b> {next}</p></div>)}</div>
    </section>
    <section className="card card-pad page-section"><CardTitle title="Property notes" subtitle="Private notes for the day the right listing appears." /><div className="activity-list">{[['Look for separate utilities', 'Criterion · updated 08 Oct', 'High priority'], ['Ask about roof age before touring', 'Due diligence · updated 01 Oct', 'Open'], ['Map commute from Northside stations', 'Research · updated 26 Sep', 'Open']].map(([title, meta, status], index) => <div className="activity-item" key={title}><div className="activity-icon"><NotebookPen size={14} /></div><div className="activity-copy"><strong>{title}</strong><span>{meta}</span></div><span className={`status ${index === 0 ? 'review' : ''}`}>{status}</span><button className="icon-btn" data-testid={`button-edit-property-note-${index}`} onClick={() => onAction('property')}><Pencil size={14} /></button></div>)}</div></section>
  </main>;
}

function RiskPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const [comfortable, setComfortable] = useState(true);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  return <main className="content">
    <PageHeading eyebrow="Plan / risk & readiness" title={<>Protect the plan<br /><em>you can explain.</em></>} description="Risk is a set of understandable safeguards. Review them before they need to do any work." actions={<><button className="btn" data-testid="button-risk-review" onClick={() => setComfortable(!comfortable)}><RotateCcw size={15} /> Re-run review</button><button className="btn emergency-btn" data-testid="button-emergency-stop" onClick={() => setEmergencyOpen(true)}><ShieldAlert size={15} /> Emergency stop</button></>} />
    <section className="card card-pad animate-in delay-1"><CardTitle title="Readiness posture" subtitle={comfortable ? 'Your plan has a comfortable margin today.' : 'Review in progress — compare this with your household budget.'} action={<span className={`status ${comfortable ? '' : 'pending'}`} data-testid="status-risk-posture">{comfortable ? 'Comfortable' : 'Reviewing'}</span>} /><div style={{ maxWidth:780 }}><div className="risk-meter"><span className="risk-marker" style={{ left: comfortable ? '37%' : '57%' }} /></div><div className="risk-scale"><span>Protected</span><span>Balanced</span><span>Stretched</span></div></div><div className="stat-strip" style={{ marginTop:28, marginLeft:-22, marginRight:-22, borderTop:'1px solid var(--line)' }}>{[['8.4 mo', 'cash runway', 'Above your 6 mo floor'], ['63%', 'largest sleeve', 'Concentration to watch'], ['0', 'high flags', 'No action needed now']].map(([value, label, detail]) => <div className="stat-cell" key={label}><div className="mono-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>)}</div></section>
    <section className="card card-pad page-section animate-in delay-2"><CardTitle title="Risk Governor safeguards" subtitle="Capital OS watches these boundaries so you do not have to watch a market screen." /><div className="safeguard-grid" data-testid="risk-safeguards">{[['Protected Capital Lock', 'Ring-fenced reserve cannot be allocated to experimental strategies.', LockKeyhole], ['Max Active Capital', 'Active capital stays within the approved household ceiling.', ShieldCheck], ['Reconciliation Health', 'All recent movements match the planned allocation.', Check], ['Strategy Exposure', 'No single strategy can quietly become the whole plan.', SlidersHorizontal], ['Venue Health', 'Connected accounts are reporting normally.', Landmark], ['Market Data Health', 'Reference data is current for the next review.', Gauge]].map(([title, desc, Icon]) => <div className="safeguard" key={title as string}><Icon size={16} /><div><strong>{title as string}</strong><span>{desc as string}</span></div><span className="status" style={{ marginLeft:'auto', flex:'0 0 auto' }}>Healthy</span></div>)}</div></section>
    <div className="section-grid">
      <section className="card card-pad page-section"><CardTitle title="The three questions" subtitle="A practical review, not a prediction." />{[['Could the household keep contributing?', 'Yes · the weekly plan is 4.8% of take-home income.', ShieldCheck], ['Could we pause without losing the thread?', 'Yes · the reserve is already separated by purpose.', LockKeyhole], ['Could we say no to the wrong property?', 'Yes · your opportunity reserve protects that choice.', Home]].map(([title, desc, Icon]) => <div className="activity-item" key={title as string}><div className="activity-icon"><Icon size={14} /></div><div className="activity-copy"><strong>{title as string}</strong><span>{desc as string}</span></div><Check size={16} color="var(--ink)" /></div>)}</section>
      <section className="card card-pad page-section"><CardTitle title="Watch next" subtitle="Low drama, high usefulness." />{['Confirm insurance estimate in Q4', 'Review beneficiaries before year end', 'Revisit purchase window in January'].map((item, index) => <div className="setting-row" key={item}><div><strong>{item}</strong><p>{['Due 15 Nov', 'Due 31 Dec', 'Due 06 Jan'][index]}</p></div><ChevronRight size={15} color="var(--ink-soft)" /></div>)}</section>
     </div>
     {emergencyOpen && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="emergency-title"><div className="modal-header"><div><div className="eyebrow" style={{ color:'var(--color-critical)' }}>Critical action / confirmation required</div><h2 id="emergency-title">Stop new activity?</h2><p>This action stops new automated orders and begins the configured capital-protection procedure. Existing protected capital remains ring-fenced.</p></div><button className="icon-btn" aria-label="Close emergency confirmation" data-testid="button-close-emergency-modal" onClick={() => setEmergencyOpen(false)}><X size={17} /></button></div><div className="modal-actions"><button className="btn" data-testid="button-cancel-emergency-stop" onClick={() => setEmergencyOpen(false)}>Keep system running</button><button className="btn emergency-btn" data-testid="button-confirm-emergency-stop" onClick={() => { setEmergencyOpen(false); setComfortable(false); onFeedback('Emergency stop confirmed. New automated activity is paused.'); }}><ShieldAlert size={14} /> Confirm emergency stop</button></div></div></div>}
  </main>;
}

function SettingsPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const [settings, setSettings] = useState({ weekly: true, reminders: true, insights: false });
  const household = useGetHousehold();
  const updatePrivacy = useUpdatePrivacySettings();
  const [privacy, setPrivacy] = useState({ financeDataPrivate: true, shareHealthSummary: false });
  const toggle = (key: keyof typeof settings) => setSettings((current) => ({ ...current, [key]: !current[key] }));
  useEffect(() => {
    if (household.data?.privacy) {
      setPrivacy({
        financeDataPrivate: household.data.privacy.financeDataPrivate,
        shareHealthSummary: household.data.privacy.shareHealthSummary,
      });
    }
  }, [household.data?.privacy]);
  const togglePrivacy = async (key: keyof typeof privacy) => {
    const next = { ...privacy, [key]: !privacy[key] };
    setPrivacy(next);
    try {
      await updatePrivacy.mutateAsync({ data: next });
      onFeedback('Privacy controls saved to this household.');
    } catch (error) {
      setPrivacy(privacy);
      onFeedback(error instanceof Error ? error.message : 'Privacy controls could not be saved.');
    }
  };
  return <main className="content">
    <PageHeading eyebrow="Workspace / settings" title={<>Set the room<br /><em>to support the habit.</em></>} description="Capital OS stays quiet by default. Choose the signals that help you keep your promise to the plan." />
    <div className="section-grid-wide">
      <section className="card card-pad animate-in delay-1"><CardTitle title="Preferences" subtitle="Your private workspace defaults." />{[['weekly', 'Weekly contribution rhythm', 'Keep the $250 Friday allocation active.', 'weekly'], ['reminders', 'Gentle reminders', 'A short note before an upcoming contribution.', 'reminders'], ['insights', 'Monthly insights', 'Receive a monthly reflection on your pace.', 'insights']].map(([key, title, desc, test]) => <div className="setting-row" key={key}><div><strong>{title}</strong><p>{desc}</p></div><button className={`toggle ${settings[key as keyof typeof settings] ? 'on' : ''}`} role="switch" aria-checked={settings[key as keyof typeof settings]} data-testid={`toggle-${test}`} onClick={() => toggle(key as keyof typeof settings)}><span /></button></div>)}</section>
      <section className="card card-pad animate-in delay-2"><CardTitle title="Account details" subtitle="A few useful anchors." /><div className="field" style={{ marginBottom:15 }}><label>Household</label><input data-testid="input-household" defaultValue="The Morgan household" /></div><div className="field" style={{ marginBottom:15 }}><label>Plan name</label><input data-testid="input-plan-name" defaultValue="First duplex" /></div><div className="field"><label>Review cadence</label><select data-testid="select-review-cadence" defaultValue="quarterly"><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="twice-yearly">Twice yearly</option></select></div><button className="btn btn-primary" style={{ marginTop:20 }} data-testid="button-save-settings" onClick={() => onFeedback('Workspace preferences saved locally.')}><Check size={14} /> Save changes</button></section>
    </div>
     <section className="card card-pad page-section"><CardTitle title="Privacy & access" subtitle={`${household.data?.role ?? 'household'} permissions · credentials stored: never`} /><div className="setting-row"><div style={{ display:'flex', gap:12, alignItems:'center' }}><div className="activity-icon"><LockKeyhole size={14} /></div><div><strong>Keep finance data private</strong><p>Account and household-finance details stay inside this household workspace.</p></div></div><button className={`toggle ${privacy.financeDataPrivate ? 'on' : ''}`} role="switch" aria-checked={privacy.financeDataPrivate} onClick={() => togglePrivacy('financeDataPrivate')}><span /></button></div><div className="setting-row"><div style={{ display:'flex', gap:12, alignItems:'center' }}><div className="activity-icon"><CircleHelp size={14} /></div><div><strong>Share health summary</strong><p>Allow a high-level financial health summary to be shared with household advisors.</p></div></div><button className={`toggle ${privacy.shareHealthSummary ? 'on' : ''}`} role="switch" aria-checked={privacy.shareHealthSummary} onClick={() => togglePrivacy('shareHealthSummary')}><span /></button></div><div className="setting-row"><div style={{ display:'flex', gap:12, alignItems:'center' }}><div className="activity-icon"><CircleHelp size={14} /></div><div><strong>Need a hand?</strong><p>Read the short guide to using Capital OS every week.</p></div></div><button className="btn" data-testid="button-open-guide" onClick={() => onFeedback('The weekly review guide is ready in your workspace.')} >Open guide <ArrowUpRight size={14} /></button></div></section>
  </main>;
}

function FinanceMetric({ label, value, detail, tone = '' }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className={`metric-card ${tone}`}><div className="mono-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div></div>;
}

function FinancePulse() {
  const cashFlow = useGetCashFlow();
  const safe = useGetSafeToDeploy();
  if (cashFlow.isLoading || safe.isLoading) return null;
  return <section className="finance-pulse animate-in delay-3">
    <FinanceMetric label="Financial health" value={`${cashFlow.data?.financialHealth.score ?? 0} / 100`} detail={cashFlow.data?.financialHealth.label ?? 'Building'} tone="blue" />
    <FinanceMetric label="Savings rate" value={`${cashFlow.data?.metrics.savingsRate ?? 0}%`} detail="of household inflow" tone="green" />
    <FinanceMetric label="Safe to deploy" value={displayMoney(safe.data?.safeToDeploy, '$0')} detail={`${safe.data?.confidence ?? 'low'} Governor confidence`} tone="lavender" />
    <FinanceMetric label="Cash runway" value={`${cashFlow.data?.reserve.monthsCovered ?? 0} mo`} detail={`of ${cashFlow.data?.reserve.targetMonths ?? 0}-month target`} tone="amber" />
  </section>;
}

function BudgetPage() {
  const query = useGetBudget();
  const safe = useGetSafeToDeploy();
  const data = query.data;
  return <main className="content">
    <PageHeading eyebrow="Household finance / budget" title={<>Give every dollar<br /><em>a clear job.</em></>} description="A calm view of what came in, what went out, and what remains available for the plan." actions={<Link className="btn btn-primary" href="/cash-flow"><TrendingUp size={15} /> View cash flow</Link>} />
    {query.isError && <div className="card card-pad" role="alert">Budget data is temporarily unavailable.</div>}
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Month planned" value={displayMoney(data?.totals.budgeted, '$0')} detail="household categories" tone="blue" />
      <FinanceMetric label="Spent so far" value={displayMoney(data?.totals.actual, '$0')} detail={`${data?.totals.percentageUsed ?? 0}% of planned`} tone="amber" />
      <FinanceMetric label="Remaining" value={displayMoney(data?.totals.remaining, '$0')} detail="before the month closes" tone="green" />
      <FinanceMetric label="Safe to deploy" value={displayMoney(safe.data?.safeToDeploy, '$0')} detail="Capital Governor limit" tone="lavender" />
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Budget performance" subtitle="Projected pace helps surface pressure before it becomes a surprise." />
      <div className="finance-table">
        {(data?.categories ?? []).map((category) => <div className="finance-row" key={category.id}>
          <div><strong>{category.name}</strong><span>{category.essentialStatus === 'essential' ? 'Essential' : category.essentialStatus === 'discretionary' ? 'Flexible' : 'Mixed'}</span></div>
          <div className="finance-bar"><b style={{ width: `${Math.min(category.percentageUsed, 100)}%` }} /></div>
          <div className="finance-amount"><strong>{displayMoney(category.actual, '$0')}</strong><span>of {displayMoney(category.budgeted, '$0')}</span></div>
          <span className={`status ${category.status === 'above_pace' ? 'review' : category.status === 'on_pace' ? 'pending' : ''}`}>{category.status.replace('_', ' ')}</span>
        </div>)}
      </div>
      <div className="finance-note"><ShieldCheck size={16} /><span>{data?.notes[0]}</span></div>
    </section>
  </main>;
}

function formatPlanningDate(value: string | undefined, fallback = 'Not scheduled') {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function humanize(value: string | undefined, fallback = 'Not set') {
  if (!value) return fallback;
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function planningStatusClass(value: string | undefined) {
  const normalized = value?.toLowerCase() ?? '';
  if (normalized.includes('overdue') || normalized.includes('blocked') || normalized.includes('inactive')) return 'critical';
  if (normalized.includes('review') || normalized.includes('optional') || normalized.includes('high') || normalized.includes('urgent')) return 'review';
  if (normalized.includes('upcoming') || normalized.includes('estimated') || normalized.includes('pending')) return 'pending';
  return '';
}

function PlanningDataState({
  label,
  isLoading,
  isError,
  isFetching,
  isStale,
  dataUpdatedAt,
  hasData,
  onRetry,
}: {
  label: string;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isStale: boolean;
  dataUpdatedAt: number;
  hasData: boolean;
  onRetry: () => void;
}) {
  if (isLoading) {
    return <div className="planning-state" role="status" data-testid={`status-${label}-loading`}><RotateCcw size={15} className="spin" /><span>Loading {label}…</span></div>;
  }
  if (isError) {
    return <div className="planning-state planning-state-error" role="alert" data-testid={`status-${label}-error`}><ShieldAlert size={16} /><div><strong>{label} data is temporarily unavailable.</strong><span>{hasData ? 'Showing the last saved view while we try to reconnect.' : 'Retry to load the household plan.'}</span></div><button className="btn" onClick={onRetry} data-testid={`button-retry-${label}`}>Try again</button></div>;
  }
  if (isFetching) {
    return <div className="data-freshness refreshing" role="status" data-testid={`status-${label}-refreshing`}><RotateCcw size={13} className="spin" /> Refreshing {label}…</div>;
  }
  if (isStale) {
    return <div className="data-freshness stale" role="status" data-testid={`status-${label}-stale`}><ShieldAlert size={13} /> This view may be out of date. <button onClick={onRetry} data-testid={`button-refresh-${label}`}>Refresh now</button></div>;
  }
  return <div className="data-freshness" data-testid={`status-${label}-updated`}>Updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'not yet'}</div>;
}

function SafeToDeployContext({ focus }: { focus: 'bills' | 'upcoming' | 'income' }) {
  const query = useGetSafeToDeploy({ query: { queryKey: getGetSafeToDeployQueryKey(), staleTime: 5 * 60 * 1000 } });
  const data = query.data;
  const focusCopy = {
    bills: 'Bill commitments are deducted before Capital Governor names room to deploy.',
    upcoming: 'Required, unfunded upcoming expenses are deducted before Capital Governor names room to deploy.',
    income: 'Current income sources keep the forward-looking plan grounded; safe-to-deploy remains a conservative limit.',
  }[focus];
  return <section className="card card-pad planning-safe-card animate-in delay-2" data-testid={`card-safe-to-deploy-${focus}`}>
    <div className="planning-safe-heading"><div><div className="mono-label">Capital Governor / live context</div><h2>Safe to deploy</h2></div><span className="status">{data?.confidence ? `${data.confidence} confidence` : 'Calculating'}</span></div>
    {query.isLoading && <div className="planning-inline-state" role="status">Calculating from the current household plan…</div>}
    {query.isError && <div className="planning-inline-state planning-inline-error" role="alert">Safe-to-deploy context could not be refreshed. Review the list above and <button className="text-link" onClick={() => { void query.refetch(); }} data-testid={`button-refresh-safe-to-deploy-${focus}`}>try again</button>.</div>}
    {data && <><div className="planning-safe-amount">{displayMoney(data.safeToDeploy, 'Not available')}</div><p>{data.reason}</p><div className="safe-breakdown"><div><span>Bill commitments</span><strong>{displayMoney(data.breakdown.billsDueBeforeNextIncome, 'Not available')}</strong></div><div><span>Required upcoming</span><strong>{displayMoney(data.breakdown.knownUpcomingExpenses, 'Not available')}</strong></div><div><span>Reserve shortfall</span><strong>{displayMoney(data.breakdown.emergencyReserveShortfall, 'Not available')}</strong></div><div><span>Safety buffer</span><strong>{displayMoney(data.breakdown.requiredSafetyBuffer, 'Not available')}</strong></div></div></>}
    <div className="finance-note"><ShieldCheck size={16} /><span>{focusCopy}</span></div>
  </section>;
}

function BillsPage() {
  const query = useListBills({ query: { queryKey: getListBillsQueryKey(), staleTime: 5 * 60 * 1000 } });
  const bills = query.data ?? [];
  const orderedBills = [...bills].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const total = bills.reduce((sum, bill) => sum + Number(bill.expectedAmount), 0);
  const attentionCount = bills.filter((bill) => ['overdue', 'review', 'attention'].some((term) => bill.status.toLowerCase().includes(term))).length;
  return <main className="content">
    <PageHeading eyebrow="Household finance / bills" title={<>Keep the<br /><em>must-pay list clear.</em></>} description="Known household bills stay visible here so timing and essential commitments are accounted for before new capital decisions." actions={<><Link className="btn" href="/upcoming-expenses" data-testid="link-bills-upcoming-expenses"><CalendarDays size={15} /> Upcoming expenses</Link><Link className="btn btn-primary" href="/income" data-testid="link-bills-income"><CircleDollarSign size={15} /> View income</Link></>} />
    <PlanningDataState label="bills" isLoading={query.isLoading} isError={query.isError} isFetching={query.isFetching} isStale={query.isStale} dataUpdatedAt={query.dataUpdatedAt} hasData={bills.length > 0} onRetry={() => { void query.refetch(); }} />
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Planned bill total" value={query.data ? displayMoney(total.toFixed(2), 'Not available') : 'Not available'} detail="known commitments" tone="amber" />
      <FinanceMetric label="Next due" value={query.data ? formatPlanningDate(orderedBills[0]?.dueDate, 'No bills') : 'Not available'} detail={orderedBills[0]?.billName ?? 'waiting for data'} tone="blue" />
      <FinanceMetric label="Essential bills" value={query.data ? `${bills.filter((bill) => bill.essential).length}` : 'Not available'} detail="priority commitments" tone="green" />
      <FinanceMetric label="Needs attention" value={query.data ? `${attentionCount}` : 'Not available'} detail="review before deploying" tone="lavender" />
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Upcoming bills" subtitle="Due date, priority, and payment status at a glance." action={<Link className="text-link" href="/cash-flow" data-testid="link-bills-cash-flow">See cash flow <ArrowUpRight size={13} /></Link>} />
      {!query.isLoading && !query.isError && bills.length === 0 && <div className="empty-state" data-testid="empty-bills"><CalendarDays size={25} /><h3>No bills recorded</h3><p>Add known recurring obligations when the household is ready. They will be included in the Governor’s conservative planning context.</p></div>}
      {bills.length > 0 && <div className="planning-table bills-table" role="table" aria-label="Household bills"><div className="planning-table-header" role="row"><span>Bill</span><span>Timing</span><span>Priority</span><span>Amount</span><span>Status</span></div>{orderedBills.map((bill) => <div className="planning-table-row" role="row" key={bill.id} data-testid={`row-bill-${bill.id}`}><div><strong>{bill.billName}</strong><span>{bill.autoPay ? 'Autopay enabled' : 'Manual payment'}</span></div><span>{formatPlanningDate(bill.dueDate)}</span><span className={`status ${bill.essential ? '' : 'review'}`}>{bill.essential ? 'Essential' : 'Flexible'}</span><strong className="planning-amount">{displayMoney(bill.expectedAmount, 'Not available')}</strong><span className={`status ${planningStatusClass(bill.status)}`}>{humanize(bill.status)}</span></div>)}</div>}
      <div className="finance-note"><ShieldCheck size={16} /><span>Bills are treated as known commitments in Safe-to-Deploy, so a new or changed obligation reduces available room automatically after the next refresh.</span></div>
    </section>
    <SafeToDeployContext focus="bills" />
  </main>;
}

function UpcomingExpensesPage() {
  const query = useListUpcomingExpenses({ query: { queryKey: getListUpcomingExpensesQueryKey(), staleTime: 5 * 60 * 1000 } });
  const expenses = query.data ?? [];
  const orderedExpenses = [...expenses].sort((a, b) => new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime());
  const remaining = (expense: UpcomingExpense) => Math.max(0, Number(expense.estimatedAmount) - Number(expense.fundedAmount));
  const requiredRemaining = expenses.reduce((sum, expense) => sum + (expense.required ? remaining(expense) : 0), 0);
  return <main className="content">
    <PageHeading eyebrow="Household finance / upcoming expenses" title={<>Make room for<br /><em>what is next.</em></>} description="One-time and known future expenses have a place of their own, separate from recurring bills and everyday transactions." actions={<><Link className="btn" href="/bills" data-testid="link-upcoming-bills"><ReceiptText size={15} /> View bills</Link><Link className="btn btn-primary" href="/income" data-testid="link-upcoming-income"><CircleDollarSign size={15} /> View income</Link></>} />
    <PlanningDataState label="upcoming expenses" isLoading={query.isLoading} isError={query.isError} isFetching={query.isFetching} isStale={query.isStale} dataUpdatedAt={query.dataUpdatedAt} hasData={expenses.length > 0} onRetry={() => { void query.refetch(); }} />
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Required still to fund" value={query.data ? displayMoney(requiredRemaining.toFixed(2), 'Not available') : 'Not available'} detail="reduces safe-to-deploy room" tone="amber" />
      <FinanceMetric label="Next expected" value={query.data ? formatPlanningDate(orderedExpenses[0]?.expectedDate, 'No expenses') : 'Not available'} detail={orderedExpenses[0]?.name ?? 'waiting for data'} tone="blue" />
      <FinanceMetric label="Required items" value={query.data ? `${expenses.filter((expense) => expense.required).length}` : 'Not available'} detail="must be planned" tone="green" />
      <FinanceMetric label="High priority" value={query.data ? `${expenses.filter((expense) => ['high', 'urgent'].includes(expense.priority.toLowerCase())).length}` : 'Not available'} detail="reviewed first" tone="lavender" />
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Known upcoming expenses" subtitle="Funding progress keeps future choices visible without mixing them into recurring bills." action={<Link className="text-link" href="/cash-flow" data-testid="link-upcoming-cash-flow">See forecast <ArrowUpRight size={13} /></Link>} />
      {!query.isLoading && !query.isError && expenses.length === 0 && <div className="empty-state" data-testid="empty-upcoming-expenses"><CalendarDays size={25} /><h3>No upcoming expenses recorded</h3><p>Known future choices and one-time costs will appear here when they are added to the household plan.</p></div>}
      {expenses.length > 0 && <div className="planning-table expenses-table" role="table" aria-label="Known upcoming expenses"><div className="planning-table-header" role="row"><span>Expense</span><span>Timing</span><span>Priority</span><span>Funding</span><span>Status</span></div>{orderedExpenses.map((expense) => { const percent = Number(expense.estimatedAmount) > 0 ? (Number(expense.fundedAmount) / Number(expense.estimatedAmount)) * 100 : 0; return <div className="planning-table-row" role="row" key={expense.id} data-testid={`row-upcoming-expense-${expense.id}`}><div><strong>{expense.name}</strong><span>{expense.required ? 'Required commitment' : 'Optional choice'}</span></div><span>{formatPlanningDate(expense.expectedDate)}</span><span className={`status ${planningStatusClass(expense.priority)}`}>{humanize(expense.priority)}</span><div className="planning-funding"><div><strong>{displayMoney(expense.estimatedAmount, 'Not available')}</strong><span>{displayMoney(expense.fundedAmount, 'Not available')} funded · {displayMoney(remaining(expense).toFixed(2), 'Not available')} left</span></div><Progress value={percent} /></div><span className={`status ${expense.required ? 'pending' : 'review'}`}>{expense.required ? 'Required' : 'Optional'}</span></div>; })}</div>}
      <div className="finance-note"><ShieldCheck size={16} /><span>Only the unfunded remainder of required expenses is deducted from Safe-to-Deploy. Optional choices stay visible without being treated as obligations.</span></div>
    </section>
    <SafeToDeployContext focus="upcoming" />
  </main>;
}

function IncomePage() {
  const query = useListIncomeSources({ query: { queryKey: getListIncomeSourcesQueryKey(), staleTime: 5 * 60 * 1000 } });
  const sources = query.data ?? [];
  const activeSources = sources.filter((source) => source.active);
  const monthlyInflow = activeSources.reduce((sum, source) => sum + Number(source.expectedMonthly), 0);
  const cadenceSummary = [...new Set(activeSources.map((source) => humanize(source.cadence)))].join(' · ') || 'Not scheduled';
  const nextPayDate = [...activeSources].map((source) => source.nextPayDate).filter(Boolean).sort()[0];
  return <main className="content">
    <PageHeading eyebrow="Household finance / income" title={<>Know what keeps<br /><em>the plan moving.</em></>} description="Expected income sources anchor the forward-looking forecast. Keep active and paused sources clear so commitments are not mistaken for spendable cash." actions={<><Link className="btn" href="/cash-flow" data-testid="link-income-cash-flow"><TrendingUp size={15} /> View cash flow</Link><Link className="btn btn-primary" href="/bills" data-testid="link-income-bills"><ReceiptText size={15} /> View bills</Link></>} />
    <PlanningDataState label="income" isLoading={query.isLoading} isError={query.isError} isFetching={query.isFetching} isStale={query.isStale} dataUpdatedAt={query.dataUpdatedAt} hasData={sources.length > 0} onRetry={() => { void query.refetch(); }} />
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Expected monthly inflow" value={query.data ? displayMoney(monthlyInflow.toFixed(2), 'Not available') : 'Not available'} detail="active sources only" tone="green" />
      <FinanceMetric label="Active sources" value={query.data ? `${activeSources.length}` : 'Not available'} detail="included in forecast" tone="blue" />
      <FinanceMetric label="Paused sources" value={query.data ? `${sources.length - activeSources.length}` : 'Not available'} detail="not counted forward" tone="lavender" />
      <FinanceMetric label="Timing" value={query.data ? cadenceSummary : 'Not available'} detail={nextPayDate ? `next pay ${formatPlanningDate(nextPayDate)}` : 'expected cadence'} tone="amber" />
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Income sources" subtitle="Status, cadence, priority, and expected amount for each source." action={<Link className="text-link" href="/upcoming-expenses" data-testid="link-income-upcoming-expenses">Plan upcoming expenses <ArrowUpRight size={13} /></Link>} />
      {!query.isLoading && !query.isError && sources.length === 0 && <div className="empty-state" data-testid="empty-income"><CircleDollarSign size={25} /><h3>No income sources recorded</h3><p>Add expected sources so the monthly forecast can show how household commitments are covered.</p></div>}
      {sources.length > 0 && <div className="planning-table income-table" role="table" aria-label="Household income sources"><div className="planning-table-header" role="row"><span>Source</span><span>Timing</span><span>Priority</span><span>Amount</span><span>Status</span></div>{sources.map((source: IncomeSource) => <div className="planning-table-row" role="row" key={source.id} data-testid={`row-income-${source.id}`}><div><strong>{source.name}</strong><span>{humanize(source.sourceType)} income</span></div><div style={{ display: 'grid', gap: 3 }}><strong>{humanize(source.cadence)}</strong><span>Next pay {formatPlanningDate(source.nextPayDate)}</span></div><span className={`status ${source.active ? '' : 'review'}`}>{source.active ? 'In forecast' : 'Paused'}</span><strong className="planning-amount">{displayMoney(source.expectedMonthly, 'Not available')}</strong><span className={`status ${source.active ? '' : 'critical'}`}>{source.active ? 'Active' : 'Inactive'}</span></div>)}</div>}
      <div className="finance-note"><CircleDollarSign size={16} /><span>Income supports the next-month forecast and bill coverage view. It does not turn every dollar into deployable cash—the Governor still preserves commitments, reserves, and a safety buffer.</span></div>
    </section>
    <SafeToDeployContext focus="income" />
  </main>;
}

function CashFlowPage() {
  const query = useGetCashFlow();
  const safe = useGetSafeToDeploy();
  const data = query.data;
  return <main className="content">
    <PageHeading eyebrow="Household finance / cash flow" title={<>See the current<br /><em>room to breathe.</em></>} description="Cash flow connects everyday household choices to the protected capital plan—without asking you to predict markets." actions={<Link className="btn" href="/budget"><ClipboardList size={15} /> Open budget</Link>} />
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Net cash flow" value={displayMoney(data?.metrics.netCashFlow, '$0')} detail="current month" tone="green" />
      <FinanceMetric label="Free cash flow" value={displayMoney(data?.metrics.freeCashFlow, '$0')} detail="after planned savings" tone="blue" />
      <FinanceMetric label="Savings rate" value={`${data?.metrics.savingsRate ?? 0}%`} detail="steady is the goal" tone="lavender" />
      <FinanceMetric label="Safe to deploy" value={displayMoney(safe.data?.safeToDeploy, '$0')} detail={`${safe.data?.confidence ?? 'low'} confidence`} tone="amber" />
    </div>
    <div className="section-grid page-section">
      <section className="card card-pad animate-in delay-2"><CardTitle title="Where the month went" subtitle="Outflows are grouped by job, not by noise." /><div className="flow-list">{[['Essential costs', data?.metrics.essentialOutflow, 'var(--color-primary)'], ['Flexible costs', data?.metrics.discretionaryOutflow, 'var(--color-opportunity)'], ['Debt service', data?.metrics.debtService, 'var(--color-critical)'], ['Protected savings', data?.metrics.savingsContributions, 'var(--color-protected)']].map(([label, value, color]) => <div className="flow-row" key={label as string}><span><i style={{ background: color as string }} />{label as string}</span><strong>{displayMoney(value as string, '$0')}</strong></div>)}</div><div className="finance-note"><PiggyBank size={16} /><span>Protected savings are counted as an intentional outflow so the household plan stays honest.</span></div></section>
      <section className="card card-pad animate-in delay-2"><CardTitle title="Reserve health" subtitle="Your emergency reserve is a household boundary, not idle cash." /><div className="reserve-figure"><strong>{data?.reserve.monthsCovered ?? 0}</strong><span>months covered</span></div><Progress value={data ? (data.reserve.monthsCovered / data.reserve.targetMonths) * 100 : 0} /><div className="reserve-meta"><span>{displayMoney(data?.reserve.current, '$0')} current</span><span>{displayMoney(data?.reserve.target, '$0')} target</span></div><div className="finance-note"><ShieldCheck size={16} /><span>{data?.reserve.gap === '0.00' ? 'Your target reserve is funded.' : `${displayMoney(data?.reserve.gap, '$0')} still to target.`}</span></div></section>
    </div>
     <section className="card card-pad page-section"><CardTitle title="Next month forecast" subtitle={`Confidence ${data?.forecast.confidence ?? 0} · next income ${formatPlanningDate(data?.forecast.nextIncomeDate ?? undefined, 'not scheduled')}`} /><div className="forecast-grid"><FinanceMetric label="Expected inflow" value={displayMoney(data?.forecast.nextMonthInflow, '$0')} detail="dated active income" tone="green" /><FinanceMetric label="Essential outflow" value={displayMoney(data?.forecast.nextMonthEssentialOutflow, '$0')} detail="expected commitments" tone="amber" /><FinanceMetric label="Expected net" value={displayMoney(data?.forecast.nextMonthNet, '$0')} detail="before new choices" tone="blue" /></div></section>
  </main>;
}

function AccountsPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useListFinancialAccounts();
  const create = useCreateManualFinancialAccount();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ institution: '', nickname: '', accountType: 'checking', currentBalance: '' });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ data: form });
      await queryClient.invalidateQueries({ queryKey: ['/api/financial-accounts'] });
      setForm({ institution: '', nickname: '', accountType: 'checking', currentBalance: '' });
      setAdding(false);
      onFeedback('Manual account added. Capital OS will only read and organize it.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Account could not be added.');
    }
  };
  return <main className="content">
    <PageHeading eyebrow="Household finance / accounts" title={<>Know where the money<br /><em>is held.</em></>} description="Manual and imported accounts give the Capital Governor enough context to protect the household—without storing bank credentials or moving money." actions={<button className="btn btn-primary" onClick={() => setAdding(!adding)} data-testid="button-add-financial-account"><Plus size={15} /> Add manual account</button>} />
    {adding && <section className="card card-pad page-section"><CardTitle title="Add a manual account" subtitle="Balances stay read-only after they are entered." /><form className="account-form" onSubmit={submit}><div className="field"><label>Institution</label><input required value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} /></div><div className="field"><label>Nickname</label><input required value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></div><div className="field"><label>Account type</label><select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })}><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit_card">Credit card</option><option value="loan">Loan</option></select></div><div className="field"><label>Current balance</label><input inputMode="decimal" value={form.currentBalance} onChange={(event) => setForm({ ...form, currentBalance: event.target.value })} placeholder="0.00" /></div><div className="modal-actions"><button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={create.isPending}><Check size={14} /> Save account</button></div></form></section>}
    <section className="card card-pad animate-in delay-1"><CardTitle title="Connected financial accounts" subtitle={`${query.data?.totals.accountCount ?? 0} accounts · read-only by design`} /><div className="table-wrap"><table className="table"><thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Source</th><th>Status</th></tr></thead><tbody>{(query.data?.accounts ?? []).map((account) => <tr key={account.id}><td><strong>{account.nickname}</strong><br /><span className="table-secondary">{account.institution}</span></td><td>{account.accountType.replace('_', ' ')}</td><td className="font-mono">{account.restricted ? 'Restricted' : displayMoney(account.currentBalance ?? undefined, '$0')}</td><td>{account.dataSource.replace('_', ' ')}</td><td><span className="status">{account.protected ? 'Protected' : 'Read only'}</span></td></tr>)}</tbody></table></div><div className="finance-note"><LockKeyhole size={16} /><span>Capital OS never stores bank credentials. Plaid is disabled; manual entry and CSV import are the active provider-neutral paths.</span></div></section>
  </main>;
}

function FinanceInsightsPage() {
  const query = useGetFinanceInsights();
  return <main className="content">
    <PageHeading eyebrow="Household finance / insights" title={<>Small signals,<br /><em>useful decisions.</em></>} description="Advisory observations from your cash flow, recurring expenses, and reserve posture. Nothing here can move money." />
    <section className="card card-pad animate-in delay-1"><CardTitle title="This month’s signals" subtitle="Review, decide, and keep the human in the loop." /><div className="insight-list">{(query.data?.insights ?? []).map((insight) => <div className="insight-row" key={insight.title}><div className={`insight-icon ${insight.type}`}><Lightbulb size={15} /></div><div><strong>{insight.title}</strong><p>{insight.description}</p></div><span className={`status ${insight.severity === 'medium' ? 'pending' : ''}`}>{insight.severity}</span></div>)}</div></section>
    <section className="card card-pad page-section"><CardTitle title="Recurring expenses" subtitle="A clear annual view makes optional costs easier to discuss." /><div className="table-wrap"><table className="table"><thead><tr><th>Expense</th><th>Monthly</th><th>Annual</th><th>Role</th></tr></thead><tbody>{(query.data?.subscriptions ?? []).map((subscription) => <tr key={subscription.merchant}><td><strong>{subscription.merchant}</strong></td><td className="font-mono">{displayMoney(subscription.monthlyAmount, '$0')}</td><td className="font-mono">{displayMoney(subscription.annualCost, '$0')}</td><td><span className="status pending">{subscription.essentialStatus}</span></td></tr>)}</tbody></table></div></section>
  </main>;
}

function UtilityPage({ kind, onAction, transactions }: { kind: string; onAction: (kind: Exclude<ModalKind, null>) => void; transactions: Transaction[] }) {
  const meta: Record<string, { eyebrow: string; title: ReactNode; description: string; icon: typeof ReceiptText }> = {
    transactions: { eyebrow: 'Keep track / transactions', title: <>A clean record of<br /><em>the small decisions.</em></>, description: 'Every contribution and transfer has a place, so the plan never depends on memory.', icon: ReceiptText },
    contributions: { eyebrow: 'Keep track / contributions', title: <>Keep the promise<br /><em>visible.</em></>, description: 'The weekly rhythm is simple on purpose. This is where you see it accumulate.', icon: WalletCards },
    reports: { eyebrow: 'Keep track / reports', title: <>A slower read<br /><em>of your progress.</em></>, description: 'Useful snapshots for a monthly check-in or a thoughtful conversation at home.', icon: FileText },
    documents: { eyebrow: 'Keep track / documents', title: <>Keep the paper<br /><em>close, not loud.</em></>, description: 'The few documents that help the future feel less abstract, held in one calm place.', icon: ClipboardList },
    insights: { eyebrow: 'Keep track / insights', title: <>Notice what is<br /><em>already working.</em></>, description: 'Short reflections drawn from your plan, not from market noise.', icon: Lightbulb },
  };
  const item = meta[kind] || meta.transactions; const Icon = item.icon;
  if (kind === 'transactions') return <main className="content"><PageHeading eyebrow={item.eyebrow} title={item.title} description={item.description} actions={<button className="btn btn-primary" data-testid="button-add-transaction" onClick={() => onAction('contribution')}><Plus size={15} /> Add movement</button>} /><TransactionTable transactions={transactions} /></main>;
  if (kind === 'contributions') return <main className="content"><PageHeading eyebrow={item.eyebrow} title={item.title} description={item.description} actions={<button className="btn btn-primary" data-testid="button-add-contribution-page" onClick={() => onAction('contribution')}><Plus size={15} /> Record contribution</button>} /><section className="card card-pad stat-strip animate-in delay-1">{[['$10,650', 'contributed this year', '42 weekly deposits'], ['$250', 'current weekly pace', 'Next on 18 Oct'], ['96%', 'on-time rhythm', 'One skipped week']].map(([value, label, detail]) => <div className="stat-cell" key={label}><div className="mono-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>)}</section><section className="card card-pad page-section"><CardTitle title="Allocation rhythm" subtitle="A quiet, repeatable split." />{[['Duplex Reserve', '$200', '80%'], ['Capital OS', '$25', '10%'], ['Opportunity Reserve', '$25', '10%']].map(([name, amount, pct]) => <div className="goal-row" key={name}><div className="goal-label"><i />{name}</div><div className="goal-progress"><b style={{ width:pct, background:name === 'Duplex Reserve' ? 'var(--color-protected)' : name === 'Capital OS' ? 'var(--color-primary)' : 'var(--color-opportunity)' }} /></div><div className="goal-pct">{amount}</div></div>)}</section></main>;
  return <main className="content"><PageHeading eyebrow={item.eyebrow} title={item.title} description={item.description} actions={<button className="btn btn-primary" data-testid={`button-add-${kind}`} onClick={() => onAction(kind === 'documents' ? 'property' : 'strategy')}><Plus size={15} /> {kind === 'documents' ? 'Add document note' : kind === 'reports' ? 'Build a report' : 'Save an insight'}</button>} /><section className="empty-state animate-in delay-1"><Icon size={25} /><h3>{kind === 'documents' ? 'Your future self will thank you.' : kind === 'reports' ? 'A report worth opening.' : 'A little perspective helps.'}</h3><p>{kind === 'documents' ? 'Add a note about a statement, inspection checklist, or lender conversation when it becomes useful.' : kind === 'reports' ? 'Your first monthly capital report will appear after the next contribution cycle.' : 'Insights will become more personal as your weekly rhythm builds a longer story.'}</p><button className="btn btn-gold" data-testid={`button-create-${kind}`} onClick={() => onAction(kind === 'documents' ? 'property' : 'strategy')}><FilePlus2 size={14} /> Create the first one</button></section></main>;
}

function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  const [filter, setFilter] = useState('All');
  const filtered = filter === 'All' ? transactions : transactions.filter((item) => item.category === filter);
  return <section className="card card-pad animate-in delay-1"><div className="filter-bar"><SlidersHorizontal size={14} color="var(--ink-soft)" />{['All', 'Duplex Reserve', 'Opportunity Reserve', 'Capital OS'].map((label) => <button className={`filter-chip ${filter === label ? 'active' : ''}`} key={label} onClick={() => setFilter(label)} data-testid={`button-filter-transactions-${label.replaceAll(' ', '-').toLowerCase()}`}>{label}</button>)}</div><div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Movement</th><th>Category</th><th>Status</th><th>Amount</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td className="font-mono">{item.date}</td><td><strong>{item.name}</strong></td><td>{item.category}</td><td><span className={`status ${item.status === 'Scheduled' ? 'pending' : ''}`}>{item.status}</span></td><td className="font-mono">+${item.amount}</td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="empty-state" style={{ marginTop:15 }}><Search size={20} /><h3>Nothing in this sleeve yet</h3><p>Try another category to see your complete capital record.</p></div>}</section>;
}

function ActionModal({ kind, close, onComplete }: { kind: Exclude<ModalKind, null>; close: () => void; onComplete: (kind: Exclude<ModalKind, null>, values: { amount?: number; name?: string; note?: string }) => void }) {
  const copy = {
    contribution: { title: 'Record a contribution', desc: 'Add a movement to your weekly capital rhythm.', submit: 'Save contribution' },
    transfer: { title: 'Move capital with purpose', desc: 'A transfer is just a change of job—not a change of plan.', submit: 'Save transfer' },
    strategy: { title: 'Make space for a strategy', desc: 'Name the next useful conversation or review.', submit: 'Save strategy note' },
    property: { title: 'Add a property note', desc: 'Capture one detail while it is fresh.', submit: 'Save property note' },
  }[kind];
  const [amount, setAmount] = useState(kind === 'contribution' ? '250' : '');
  const [name, setName] = useState(kind === 'property' ? 'Separate utilities' : kind === 'strategy' ? 'Review duplex criteria' : '');
  const [note, setNote] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); onComplete(kind, { amount: amount ? Number(amount) : undefined, name, note }); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="eyebrow">Capital OS / quick action</div><h2 id="modal-title">{copy.title}</h2><p>{copy.desc}</p></div><button className="icon-btn" aria-label="Close dialog" data-testid="button-close-modal" onClick={close}><X size={17} /></button></div><form className="modal-form" onSubmit={submit}>{(kind === 'contribution' || kind === 'transfer') && <div className="field"><label>Amount</label><input autoFocus required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="input-action-amount" placeholder="250" /></div>}{kind === 'contribution' && <div className="field"><label>Allocate to</label><select data-testid="select-contribution-sleeve" defaultValue="Duplex Reserve"><option>Duplex Reserve</option><option>Capital OS</option><option>Opportunity Reserve</option></select></div>}{(kind === 'strategy' || kind === 'property') && <div className="field"><label>{kind === 'property' ? 'Note title' : 'Strategy title'}</label><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} data-testid="input-action-name" /></div>}<div className="field"><label>Note <span style={{ textTransform:'none', letterSpacing:0 }}>(optional)</span></label><textarea value={note} onChange={(event) => setNote(event.target.value)} data-testid="textarea-action-note" placeholder="A little context for later..." /></div><div className="modal-actions"><button type="button" className="btn" data-testid="button-cancel-modal" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary" data-testid="button-submit-modal"><Check size={14} /> {copy.submit}</button></div></form></div></div>;
}

function AppRouter({ onAction, onFeedback, transactions, dashboard, backendIssue }: { onAction: (kind: Exclude<ModalKind, null>) => void; onFeedback: (message: string) => void; transactions: Transaction[]; dashboard?: DashboardSnapshot; backendIssue?: boolean }) {
  return <Switch>
    <Route path="/" component={() => <Dashboard onAction={onAction} onFeedback={onFeedback} transactions={transactions} dashboard={dashboard} backendIssue={backendIssue} />} />
    <Route path="/budget" component={BudgetPage} />
    <Route path="/cash-flow" component={CashFlowPage} />
    <Route path="/bills" component={BillsPage} />
    <Route path="/upcoming-expenses" component={UpcomingExpensesPage} />
    <Route path="/income" component={IncomePage} />
    <Route path="/accounts" component={() => <AccountsPage onFeedback={onFeedback} />} />
    <Route path="/goals" component={() => <GoalsPage onAction={onAction} />} />
    <Route path="/strategies" component={() => <StrategiesPage onAction={onAction} />} />
    <Route path="/portfolio" component={() => <PortfolioPage onFeedback={onFeedback} />} />
    <Route path="/properties" component={() => <PropertiesPage onAction={onAction} />} />
    <Route path="/risk" component={() => <RiskPage onFeedback={onFeedback} />} />
    <Route path="/settings" component={() => <SettingsPage onFeedback={onFeedback} />} />
    <Route path="/transactions" component={() => <UtilityPage kind="transactions" onAction={onAction} transactions={transactions} />} />
    <Route path="/contributions" component={() => <UtilityPage kind="contributions" onAction={onAction} transactions={transactions} />} />
    <Route path="/reports" component={() => <UtilityPage kind="reports" onAction={onAction} transactions={transactions} />} />
    <Route path="/documents" component={() => <UtilityPage kind="documents" onAction={onAction} transactions={transactions} />} />
    <Route path="/insights" component={FinanceInsightsPage} />
    <Route component={NotFound} />
  </Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function AppContent() {
  const [modal, setModal] = useState<ModalKind>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const dashboardQuery = useGetDashboard();
  const contributionsQuery = useListContributions();
  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: 1, date: '11 Oct', name: 'Weekly allocation', category: 'Duplex Reserve', amount: 200, status: 'Posted' },
    { id: 2, date: '11 Oct', name: 'Weekly allocation', category: 'Capital OS', amount: 25, status: 'Posted' },
    { id: 3, date: '11 Oct', name: 'Weekly allocation', category: 'Opportunity Reserve', amount: 25, status: 'Posted' },
    { id: 4, date: '04 Oct', name: 'Weekly allocation', category: 'Duplex Reserve', amount: 200, status: 'Posted' },
  ]);
  const apiTransactions = useMemo(() => {
    if (!contributionsQuery.data?.length) return transactions;
    return contributionsQuery.data.map((item, index) => ({
      id: index + 1,
      date: new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      name: 'Weekly allocation',
      category: 'Duplex Reserve',
      amount: Number(item.amount),
      status: item.status === 'completed' ? 'Posted' : item.status,
    }));
  }, [contributionsQuery.data, transactions]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timeout); }, [toast]);
  const notify = (message: string) => setToast(message);
  const complete = async (kind: Exclude<ModalKind, null>, values: { amount?: number; name?: string; note?: string }) => {
    const labels = { contribution: 'Contribution recorded', transfer: 'Transfer saved', strategy: 'Strategy note saved', property: 'Property note saved' };
    if (kind === 'contribution') {
      try {
        await createContribution(
          { amount: (values.amount || 0).toFixed(2) },
          { headers: { 'Idempotency-Key': `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` } },
        );
        await queryClient.invalidateQueries();
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Contribution could not be recorded.');
        return;
      }
    }
    if (kind === 'contribution' || kind === 'transfer') setTransactions((current) => [{ id: Date.now(), date: 'Today', name: values.name || (kind === 'contribution' ? 'Weekly allocation' : 'Reserve transfer'), category: kind === 'contribution' ? 'Duplex Reserve' : 'Capital OS', amount: values.amount || 0, status: 'Posted' }, ...current]);
    setModal(null); setToast(`${labels[kind]} · your plan is up to date.`);
  };
  return <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RoutedErrorBoundary><AppShell onAction={setModal} onFeedback={notify} menuOpen={menuOpen} setMenuOpen={setMenuOpen}><AppRouter onAction={setModal} onFeedback={notify} transactions={apiTransactions} dashboard={dashboardQuery.data} backendIssue={dashboardQuery.isError} /></AppShell></RoutedErrorBoundary></WouterRouter>{modal && <ActionModal kind={modal} close={() => setModal(null)} onComplete={complete} />}{toast && <div className="toast-note" role="status" data-testid="status-action-feedback">{toast}</div>}</TooltipProvider>;
}

function App() {
  return <QueryClientProvider client={queryClient}><AppContent /><Toaster /></QueryClientProvider>;
}

export default App;