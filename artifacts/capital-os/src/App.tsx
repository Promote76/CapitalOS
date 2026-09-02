import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  createContribution,
  useGetCashFlow,
  useGetFinanceInsights,
  useGetSafeToDeploy,
  useListFinancialAccounts,
  useCreateManualFinancialAccount,
  useGetBudget,
  useGetHousehold,
  useGetPropertyUnderwriting,
  useUpdateBuyBox,
  useCreatePropertyCandidate,
  useAnalyzePropertyCandidate,
  getGetPropertyUnderwritingQueryKey,
  useUpdatePrivacySettings,
  useGetDashboard,
  useGetIntelligence,
  useRefreshIntelligence,
  useRunIntelligenceScenario,
  useDecideRecommendation,
  useRecordIntelligenceFeedback,
  useGetStrategyLab,
  useGetMicroLive,
  useRunMicroLiveRehearsal,
  useRunMicroLiveReconciliation,
  useReviewMicroLiveEnablement,
  useApproveMicroLiveVenue,
  useArmMicroLive,
  useCreateMicroLiveIncidentReview,
  useCompleteMicroLiveReactivationRequirement,
  getGetMicroLiveQueryKey,
  useCreateResearchStrategy,
  useCreateStrategyVersion,
  useRunStrategyExperiment,
  useEvaluateStrategyGraduation,
  useCreateResearchJournalEntry,
  getGetIntelligenceQueryKey,
  getGetStrategyLabQueryKey,
  useListContributions,
  useListBills,
  useListUpcomingExpenses,
  useListIncomeSources,
  useCreateBill,
  useUpdateBill,
  usePauseBill,
  useResumeBill,
  useDeleteBill,
  useCreateUpcomingExpense,
  useUpdateUpcomingExpense,
  usePauseUpcomingExpense,
  useResumeUpcomingExpense,
  useDeleteUpcomingExpense,
  useCreateIncomeSource,
  useUpdateIncomeSource,
  usePauseIncomeSource,
  useResumeIncomeSource,
  useDeleteIncomeSource,
  getGetSafeToDeployQueryKey,
  getListBillsQueryKey,
  getListUpcomingExpensesQueryKey,
  getListIncomeSourcesQueryKey,
  type UpcomingExpense,
  type IncomeSource,
  type Bill,
  type BillInput,
  type UpcomingExpenseInput,
  type IncomeSourceInput,
  type DashboardSnapshot,
  type CreatePropertyCandidateInput,
  type IntelligenceSnapshot,
  type ContributionScenario,
  type StrategyLabStrategy,
  type CreateResearchStrategyInput,
  type RunStrategyExperimentInput,
  type MicroLiveSnapshot,
  type MicroLiveVenueApprovalRequest,
  type MicroLiveIncidentReviewInput,
  type TreasurySnapshot,
  useGetTreasury,
} from '@workspace/api-client-react';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Bell,
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDollarSign,
  CircleHelp,
  ClipboardList,
  ClipboardCheck,
  Compass,
  FilePlus2,
  FileText,
  Gauge,
  Activity,
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
  FlaskConical,
  GitBranch,
  History,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Database,
  ScrollText,
  Scale,
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
import TreasuryPage from '@/pages/treasury';
import AccountingPage from '@/pages/accounting';
import OperationsPage from '@/pages/operations';
import BusinessPage from '@/pages/business';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

const queryClient = new QueryClient();
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'top' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#236b59',
    colorForeground: '#18322e',
    colorMutedForeground: '#58706b',
    colorDanger: '#b34a3c',
    colorBackground: '#ffffff',
    colorInput: '#f6faf8',
    colorInputForeground: '#18322e',
    colorNeutral: '#d9e6e1',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    borderRadius: '0.85rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-white rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#18322e]',
    headerSubtitle: 'text-[#58706b]',
    socialButtonsBlockButtonText: 'text-[#18322e]',
    formFieldLabel: 'text-[#355a50]',
    footerActionLink: 'text-[#236b59]',
    footerActionText: 'text-[#58706b]',
    dividerText: 'text-[#58706b]',
    identityPreviewEditButton: 'text-[#236b59]',
    formFieldSuccessText: 'text-[#236b59]',
    alertText: 'text-[#9d3d30]',
    logoBox: 'rounded-xl overflow-hidden',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton: 'border-[#d9e6e1] bg-[#f6faf8] hover:bg-[#e8f3ef]',
    formButtonPrimary: 'bg-[#236b59] hover:bg-[#1b594a] text-white',
    formFieldInput: 'border-[#d9e6e1] bg-[#f6faf8] text-[#18322e]',
    footerAction: 'border-t border-[#d9e6e1]',
    dividerLine: 'bg-[#d9e6e1]',
    alert: 'border-[#efcfc8] bg-[#fff0ed]',
    otpCodeFieldInput: 'border-[#d9e6e1] bg-[#f6faf8] text-[#18322e]',
    formFieldRow: 'text-[#18322e]',
    main: 'bg-white',
  },
};

function AuthLanding() {
  return (
    <div className="auth-landing">
      <div className="auth-landing-card">
        <div className="brand-mark">
          <div className="brand-glyph" aria-hidden="true" />
          <div><div className="brand-name">capital os</div><div className="brand-sub">family capital / 01</div></div>
        </div>
        <div className="auth-landing-kicker">Family capital, with a plan</div>
        <h1>Protect the base. Fund the next chapter.</h1>
        <p>Capital OS brings household finance, protected goals, Treasury, property planning, and business context into one governed workspace.</p>
        <div className="auth-landing-actions">
          <Link href="/sign-in" className="button button-primary">Sign in</Link>
          <Link href="/sign-up" className="button button-secondary">Create an account</Link>
        </div>
        <div className="auth-landing-note"><LockKeyhole size={15} /> AI is advisory-only. Live execution is disabled.</div>
      </div>
    </div>
  );
}

function SignInPage() {
  return (
    <div className="auth-page">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="auth-page">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { userId, isLoaded } = useAuth();
  const previousUserId = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    const currentUserId = userId ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== currentUserId) {
      queryClient.clear();
    }
    previousUserId.current = currentUserId;
  }, [isLoaded, userId]);
  return null;
}

function SessionControls() {
  const { user } = useUser();
  const { signOut } = useClerk();
  if (!user) return null;
  const label = user.firstName || user.primaryEmailAddress?.emailAddress || 'Signed in';
  return (
    <div className="session-controls">
      <div className="session-user"><div className="session-avatar">{label.slice(0, 1).toUpperCase()}</div><span>{label}</span></div>
      <button type="button" className="session-signout" onClick={() => signOut({ redirectUrl: basePath || '/' })}>Sign out</button>
    </div>
  );
}

function OnboardingPage({ onComplete }: { onComplete: () => void }) {
  const { user } = useUser();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!name && user) {
      setName(`${user.firstName || 'My'} household`);
    }
  }, [name, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/auth/onboard', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timezone }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Household setup could not be completed.');
      onComplete();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Household setup could not be completed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-landing">
      <div className="auth-landing-card onboarding-card">
        <div className="auth-landing-kicker">One secure workspace per account</div>
        <h1>Set up your household.</h1>
        <p>Capital OS starts with conservative, non-executing defaults. You can add verified accounts and planning data after setup; no balances are invented or copied from the demo household.</p>
        <form className="onboarding-form" onSubmit={submit}>
          <label>Household name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="The Morgan household" /></label>
          <label>Time zone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}><option>America/Chicago</option><option>America/New_York</option><option>America/Denver</option><option>America/Los_Angeles</option><option>UTC</option></select></label>
          {error && <div className="onboarding-error" role="alert">{error}</div>}
          <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Creating workspace…' : 'Create household'}</button>
        </form>
        <div className="auth-landing-note"><LockKeyhole size={15} /> Your account is linked to the internal household identity after setup.</div>
      </div>
    </div>
  );
}

function TenantGate() {
  const [state, setState] = useState<'loading' | 'onboarding' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Your secure workspace could not be loaded.');
        if (!active) return;
        setState(payload.memberships?.length ? 'ready' : 'onboarding');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : 'Your secure workspace could not be loaded.');
        setState('error');
      });
    return () => { active = false; };
  }, []);
  if (state === 'ready') return <AppContent />;
  if (state === 'onboarding') return <OnboardingPage onComplete={() => setState('ready')} />;
  if (state === 'error') return <div className="auth-loading">{error}</div>;
  return <div className="auth-loading">Preparing your secure workspace…</div>;
}

function AuthenticatedApp() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [location] = useLocation();
  if (!isLoaded) {
    return <div className="auth-loading">Loading your secure workspace…</div>;
  }
  if (!isSignedIn) {
    return location === '/' ? <AuthLanding /> : <Redirect to="/sign-in" />;
  }
  return <TenantGate key={userId ?? 'signed-in'} />;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  if (!clerkPubKey) {
    throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in the application environment.');
  }
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to access your family capital workspace' } },
        signUp: { start: { title: 'Create your Capital OS account', subtitle: 'Start with conservative defaults and a clear plan' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route component={AuthenticatedApp} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

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
  { href: '/accounting', label: 'Accounting', icon: Scale },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/strategies', label: 'Strategies', icon: Compass },
  { href: '/micro-live', label: 'Micro-Live', icon: Activity },
  { href: '/treasury', label: 'Treasury', icon: WalletCards },
  { href: '/portfolio', label: 'Portfolio', icon: BarChart3 },
  { href: '/properties', label: 'Properties', icon: Building2 },
  { href: '/business', label: 'Business', icon: BriefcaseBusiness },
  { href: '/risk', label: 'Risk & readiness', icon: ShieldCheck },
];
const planningNav = [
  { href: '/bills', label: 'Bills', icon: ReceiptText },
  { href: '/upcoming-expenses', label: 'Upcoming expenses', icon: CalendarDays },
  { href: '/income', label: 'Income', icon: CircleDollarSign },
];
const secondaryNav = [
  { href: '/operations', label: 'Operations', icon: ClipboardCheck },
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
        <SessionControls />
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

function intelligenceStatusClass(value: string) {
  if (value === 'critical' || value === 'high') return 'critical';
  if (value === 'medium' || value === 'review' || value === 'proposed') return 'pending';
  return '';
}

function ConfidenceLabel({ confidence, dataQuality }: { confidence: number; dataQuality: string }) {
  return <span className="intelligence-confidence"><Gauge size={12} /> {confidence.toFixed(0)}% confidence · {dataQuality} data</span>;
}

function IntelligenceRecommendationCard({ snapshot, onFeedback }: { snapshot: IntelligenceSnapshot; onFeedback: (message: string) => void }) {
  const decision = useDecideRecommendation();
  const feedback = useRecordIntelligenceFeedback();
  const recommendation = snapshot.recommendation;
  const decide = async (value: 'approved' | 'rejected') => {
    try {
      await decision.mutateAsync({
        recommendationId: recommendation.id,
        data: { decision: value, reason: value === 'approved' ? 'Accepted for human review.' : 'Rejected after household review.' },
      });
      await queryClient.invalidateQueries({ queryKey: getGetIntelligenceQueryKey() });
      onFeedback(value === 'approved' ? 'Recommendation accepted for human review.' : 'Recommendation rejected and recorded.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The recommendation decision could not be recorded.');
    }
  };
  return <section className="ai-card intelligence-recommendation" data-testid="card-intelligence-recommendation">
    <div className="intelligence-card-header">
      <div className="intelligence-title-wrap">
        <div className="state-icon intelligence-icon"><Sparkles size={17} /></div>
        <div><div className="state-label">AI CIO recommendation <span className="status" style={{ marginLeft: 6 }}>Advisory only</span></div><ConfidenceLabel confidence={recommendation.confidence} dataQuality={recommendation.dataQuality} /></div>
      </div>
      <span className={`status ${intelligenceStatusClass(recommendation.priority)}`}>{recommendation.priority}</span>
    </div>
    <h3>{recommendation.recommendation}</h3>
    <p className="intelligence-reason">{recommendation.reason}</p>
    <div className="intelligence-detail-grid">
      <div><strong>Expected benefit</strong><span>{recommendation.expectedBenefit}</span></div>
      <div><strong>Potential downside</strong><span>{recommendation.potentialDownside}</span></div>
      <div><strong>Next action</strong><span>{recommendation.suggestedNextAction}</span></div>
    </div>
    <div className="intelligence-evidence"><strong>Evidence</strong>{recommendation.evidence.map((item) => <span key={item}>• {item}</span>)}</div>
    <div className="intelligence-card-footer"><span>{recommendation.requiredApproval}</span>{recommendation.status === 'proposed' && <div className="heading-actions"><button className="btn btn-primary" onClick={() => { void decide('approved'); }} disabled={decision.isPending} data-testid="button-accept-intelligence"><Check size={14} /> Accept for review</button><button className="btn" onClick={() => { void decide('rejected'); }} disabled={decision.isPending} data-testid="button-reject-intelligence">Reject</button></div>}</div>
    <div className="feedback-bar"><span>Was this useful?</span><div>{(['helpful', 'not_helpful', 'implemented', 'dismissed'] as const).map((value) => <button key={value} className={`feedback-button ${feedback.isPending ? 'disabled' : ''}`} disabled={feedback.isPending} onClick={() => { void feedback.mutateAsync({ data: { recommendationId: recommendation.id, feedback: value } }).then(() => onFeedback(`Feedback recorded: ${value.replace('_', ' ')}.`)).catch((error) => onFeedback(error instanceof Error ? error.message : 'Feedback could not be recorded.')); }} data-testid={`button-feedback-${value}`}>{value === 'not_helpful' ? 'Not helpful' : value.charAt(0).toUpperCase() + value.slice(1)}</button>)}</div></div>
  </section>;
}

function DashboardIntelligence({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useGetIntelligence();
  const snapshot = query.data;
  return <section className="card card-pad intelligence-dashboard-card animate-in delay-2" data-testid="card-dashboard-intelligence">
    <CardTitle title="AI CIO / today’s read" subtitle="Evidence-backed guidance for the next household decision." action={<Link href="/insights" className="text-link">Open Intelligence <ArrowUpRight size={13} /></Link>} />
    {query.isLoading && <div className="intelligence-loading">Preparing the latest household read…</div>}
    {query.isError && <div className="intelligence-empty"><ShieldAlert size={17} /><span>Intelligence is temporarily unavailable. Your capital plan remains unchanged.</span><button className="text-link" onClick={() => { void query.refetch(); }}>Try again</button></div>}
    {snapshot && <div className="dashboard-intelligence-content"><div><span className={`status ${intelligenceStatusClass(snapshot.recommendation.priority)}`}>{snapshot.recommendation.priority} priority</span><h3>{snapshot.recommendation.recommendation}</h3><p>{snapshot.recommendation.reason}</p></div><div className="dashboard-intelligence-meta"><strong>{displayMoney(snapshot.dailyBrief.safeToDeploy, '$0')}</strong><span>safe to deploy</span><ConfidenceLabel confidence={snapshot.recommendation.confidence} dataQuality={snapshot.recommendation.dataQuality} /></div></div>}
    {snapshot && <button className="btn" style={{ marginTop: 14 }} onClick={() => onFeedback('The AI CIO remains advisory-only. Review the full evidence before changing the plan.')}>Why this matters <CircleHelp size={14} /></button>}
  </section>;
}

function DashboardTreasury() {
  const query = useGetTreasury();
  const snapshot = query.data as TreasurySnapshot | undefined;
  return <section className="card card-pad dashboard-treasury-card animate-in delay-2" data-testid="card-dashboard-treasury">
    <CardTitle title="Treasury / today" subtitle="Liquidity first. Protected goals stay protected." action={<Link href="/treasury" className="text-link">Open Treasury <ArrowUpRight size={13} /></Link>} />
    {query.isLoading && <div className="intelligence-loading">Reading the household capital map…</div>}
    {query.isError && <div className="intelligence-empty"><ShieldAlert size={17} /><span>Treasury is temporarily unavailable. No allocation action was taken.</span></div>}
    {snapshot && <div className="dashboard-treasury-content">
      <div className="dashboard-treasury-score"><span className="mono-label">Treasury health</span><strong>{snapshot.health.score}<small>/100</small></strong><span className="status">{snapshot.health.state}</span></div>
      <div className="dashboard-treasury-metrics">
        <div><span>Safe to deploy</span><strong>{displayMoney(snapshot.totals.safeToDeploy, '$0')}</strong></div>
        <div><span>Liquid reserve</span><strong>{displayMoney(snapshot.totals.liquidReserve, '$0')}</strong></div>
        <div><span>Emergency coverage</span><strong>{snapshot.health.emergencyCoverage.toFixed(1)} mo</strong></div>
      </div>
      <div className="dashboard-treasury-action"><ShieldCheck size={14} /><span>{snapshot.nextAction}</span></div>
    </div>}
  </section>;
}

function Dashboard({ onAction, onFeedback, transactions, dashboard, backendIssue }: { onAction: (kind: Exclude<ModalKind, null>) => void; onFeedback: (message: string) => void; transactions: Transaction[]; dashboard?: DashboardSnapshot; backendIssue?: boolean }) {
  const monthTotal = transactions.reduce((sum, item) => sum + item.amount, 0);
  const goal = dashboard?.goal;
  const allocation = dashboard?.allocation;
  const portfolio = dashboard?.portfolio;
  const confidence = dashboard?.strategies[0]?.confidenceScore ?? 78;
  return <main className="content">
    {backendIssue && <div className="card card-pad" role="status" style={{ marginBottom: 22, borderColor: 'var(--color-warning)', background: 'var(--color-warning-soft)' }}><strong>Showing the last saved view.</strong><p style={{ margin: '5px 0 0', color: 'var(--ink-soft)', fontSize: 12 }}>The household service is temporarily unavailable. Your local plan view is safe to review, and it will refresh automatically.</p></div>}
    <PageHeading eyebrow="Monday, 14 October 2024" title={<>Make room for the<br /><em>long view.</em></>} description="A clear week starts here. Your duplex plan is healthy, and the next small move is already in view." actions={<><button className="btn" data-testid="button-dashboard-export" onClick={() => onFeedback('Local-only preview: no server report was created.')}><ArrowDownLeft size={15} /> Export view</button><button className="btn btn-primary" data-testid="button-dashboard-contribution" onClick={() => onAction('contribution')}><Plus size={15} /> Record contribution</button></>} />
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
     <DashboardIntelligence onFeedback={onFeedback} />
      <DashboardTreasury />
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

function strategyStageClass(stage: string) {
  return stage.toLowerCase().replaceAll('_', '-').replaceAll(' ', '-');
}

function metricValue(value: number | undefined, suffix = '') {
  return value === undefined || value === null || Number.isNaN(value) ? '—' : `${value.toFixed(1)}${suffix}`;
}

function StrategyMetrics({ strategy }: { strategy?: StrategyLabStrategy }) {
  const metrics = strategy?.latestMetrics;
  const values = [
    ['Evidence score', metricValue(metrics?.evidenceScore, '/100')],
    ['Net edge', metricValue(metrics?.netEdgeBps, ' bps')],
    ['Max drawdown', metricValue(metrics?.maxDrawdownPct, '%')],
    ['Fill rate', metricValue(metrics?.fillRatePct, '%')],
    ['Profit factor', metricValue(metrics?.profitFactor)],
    ['Critical errors', metrics ? String(metrics.criticalModelErrors) : '—'],
  ];
  return <div className="strategy-score-grid">{values.map(([label, value]) => <div className="strategy-score" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>;
}

function StrategiesPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useGetStrategyLab();
  const createStrategy = useCreateResearchStrategy();
  const createVersion = useCreateStrategyVersion();
  const runExperiment = useRunStrategyExperiment();
  const evaluateGraduation = useEvaluateStrategyGraduation();
  const createJournal = useCreateResearchJournalEntry();
  const [selectedId, setSelectedId] = useState('');
  const [panel, setPanel] = useState<'strategy' | 'version' | 'experiment' | 'journal' | null>(null);
  const [strategyDraft, setStrategyDraft] = useState({ name: '', strategyType: 'systematic', description: '', hypothesis: '', executionModel: 'conservative' as CreateResearchStrategyInput['executionModel'] });
  const [versionDraft, setVersionDraft] = useState({ version: '', reason: '', logicChanges: '' });
  const [experimentDraft, setExperimentDraft] = useState({ name: '', mode: 'backtest' as RunStrategyExperimentInput['mode'], datasetVersion: 'market-history-2024.10', executionModel: 'moderate' as RunStrategyExperimentInput['executionModel'], randomSeed: '17' });
  const [journalDraft, setJournalDraft] = useState({ entryType: 'observation', title: '', body: '' });
  const data = query.data;
  const strategies = data?.strategies ?? [];
  const selected = strategies.find((strategy) => strategy.id === selectedId) ?? strategies[0];

  useEffect(() => {
    if (selected && !selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: getGetStrategyLabQueryKey() }); };
  const submitStrategy = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createStrategy.mutateAsync({ data: strategyDraft });
      setStrategyDraft({ name: '', strategyType: 'systematic', description: '', hypothesis: '', executionModel: 'conservative' });
      setPanel(null); await refresh(); onFeedback('Research strategy added to the lab.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'The strategy could not be saved.'); }
  };
  const submitVersion = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try {
      await createVersion.mutateAsync({ strategyId: selected.id, data: versionDraft });
      setVersionDraft({ version: '', reason: '', logicChanges: '' }); setPanel(null); await refresh(); onFeedback('Immutable strategy version recorded.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'The version could not be saved.'); }
  };
  const submitExperiment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !selected.versionId) { onFeedback('Select a strategy with a version before running an experiment.'); return; }
    try {
      await runExperiment.mutateAsync({ data: { strategyId: selected.id, strategyVersionId: selected.versionId, ...experimentDraft, randomSeed: Number(experimentDraft.randomSeed) } });
      setExperimentDraft({ name: '', mode: 'backtest', datasetVersion: 'market-history-2024.10', executionModel: 'moderate', randomSeed: '17' }); setPanel(null); await refresh(); onFeedback('Simulated experiment completed and recorded.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'The experiment could not be run.'); }
  };
  const submitJournal = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    try {
      await createJournal.mutateAsync({ data: { ...journalDraft, strategyId: selected.id } });
      setJournalDraft({ entryType: 'observation', title: '', body: '' }); setPanel(null); await refresh(); onFeedback('Research note added to the journal.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'The journal entry could not be saved.'); }
  };
  const evaluate = async () => {
    if (!selected) return;
    try {
      const result = await evaluateGraduation.mutateAsync({ strategyId: selected.id });
      await refresh(); onFeedback(result.eligible ? 'Evidence gates passed for review. Live trading remains disabled.' : 'Evidence gates reviewed. More research is required.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'Graduation evidence could not be evaluated.'); }
  };
  const formBusy = createStrategy.isPending || createVersion.isPending || runExperiment.isPending || createJournal.isPending;
  const openPanel = (next: typeof panel) => setPanel(panel === next ? null : next);

  if (query.isLoading) return <main className="content"><PageHeading eyebrow="Research / Strategy Lab" title={<>Evidence before<br /><em>exposure.</em></>} description="Loading the household research room." /><div className="strategy-lab-loading"><span /><span /><span /><span /></div></main>;
  if (query.isError || !data) return <main className="content"><PageHeading eyebrow="Research / Strategy Lab" title={<>The lab is<br /><em>resting.</em></>} description="The saved research snapshot could not be loaded." /><section className="card card-pad strategy-lab-error"><AlertTriangle size={19} /><div><strong>Research data unavailable</strong><p>Nothing has been changed. Try again when the household service is ready.</p><button className="btn btn-primary" onClick={() => { void query.refetch(); }}><RotateCcw size={14} /> Try again</button></div></section></main>;

  const overview = data.overview;
  return <main className="content strategy-lab-page">
    <PageHeading eyebrow="Research / Strategy Lab" title={<>Evidence before<br /><em>exposure.</em></>} description="A quiet room for testing ideas under honest assumptions. Every result is simulated, versioned, and reviewable." actions={<button className="btn btn-primary" data-testid="button-start-strategy" onClick={() => openPanel('strategy')}><Plus size={15} /> Add hypothesis</button>} />
    <section className="lab-safety-banner" data-testid="strategy-lab-safety"><div className="lab-safety-icon"><Lock size={17} /></div><div><strong>Live trading is disabled</strong><p>{data.safety.note || 'The Strategy Lab cannot submit real orders or access protected household capital.'}</p></div><span className="status">Research only</span></section>
    <section className="card card-pad lab-overview-strip animate-in delay-1"><div><span className="mono-label">Research inventory</span><strong>{overview.totalStrategiesTested}</strong><small>strategies tested</small></div><div><span className="mono-label">Evidence</span><strong>{overview.profitableExperiments}</strong><small>profitable experiments</small></div><div><span className="mono-label">Watch list</span><strong>{overview.unprofitableExperiments}</strong><small>unprofitable experiments</small></div><div><span className="mono-label">Latest failure</span><strong className="lab-stat-text">{overview.latestFailure || 'None recorded'}</strong><small>visible, not hidden</small></div></section>
    <section className="lab-stage-row card card-pad animate-in delay-2"><CardTitle title="The evidence ladder" subtitle="Progression is earned in order. There is no shortcut to production." /><div className="lab-stage-track">{['research', 'backtest', 'walk_forward', 'shadow', 'paper', 'micro_live', 'approved', 'production'].map((stage) => <div className={`lab-stage ${strategyStageClass(stage)} ${(data.stageCounts[stage as keyof typeof data.stageCounts] ?? 0) > 0 ? 'has-count' : ''}`} key={stage}><span>{stage.replaceAll('_', ' ')}</span><b>{data.stageCounts[stage as keyof typeof data.stageCounts] ?? 0}</b></div>)}</div><div className="lab-stage-foot"><span><CheckCircle2 size={14} /> Backtests and walk-forwards are simulated</span><span><ShieldCheck size={14} /> Capital access stays locked</span></div></section>
    {panel && <section className="card card-pad strategy-lab-form animate-in" aria-labelledby="research-form-title"><CardTitle title={panel === 'strategy' ? 'Write a falsifiable hypothesis' : panel === 'version' ? 'Create an immutable version' : panel === 'experiment' ? 'Run a controlled experiment' : 'Add to the research journal'} subtitle={panel === 'experiment' ? 'Results use a named dataset, deterministic seed, and realistic execution model.' : 'Research records are persisted and remain separate from household capital.'} action={<button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close research form"><X size={15} /></button>} />
      {panel === 'strategy' && <form onSubmit={submitStrategy} className="lab-form-grid"><label>Name<input required maxLength={120} value={strategyDraft.name} onChange={(event) => setStrategyDraft({ ...strategyDraft, name: event.target.value })} /></label><label>Strategy type<input required value={strategyDraft.strategyType} onChange={(event) => setStrategyDraft({ ...strategyDraft, strategyType: event.target.value })} /></label><label className="wide">Description<textarea required maxLength={1000} rows={2} value={strategyDraft.description} onChange={(event) => setStrategyDraft({ ...strategyDraft, description: event.target.value })} /></label><label className="wide">Hypothesis<textarea required maxLength={2000} rows={3} placeholder="If this condition holds, then..." value={strategyDraft.hypothesis} onChange={(event) => setStrategyDraft({ ...strategyDraft, hypothesis: event.target.value })} /></label><label>Execution assumption<select value={strategyDraft.executionModel} onChange={(event) => setStrategyDraft({ ...strategyDraft, executionModel: event.target.value as CreateResearchStrategyInput['executionModel'] })}><option value="conservative">Conservative</option><option value="moderate">Moderate</option><option value="queue_aware">Queue aware</option><option value="optimistic">Optimistic</option></select></label><div className="form-actions"><button className="btn btn-primary" disabled={formBusy}>{formBusy ? 'Saving…' : 'Save hypothesis'}</button></div></form>}
      {panel === 'version' && <form onSubmit={submitVersion} className="lab-form-grid"><label>Version label<input required maxLength={40} placeholder="v0.2" value={versionDraft.version} onChange={(event) => setVersionDraft({ ...versionDraft, version: event.target.value })} /></label><label>Reason<input required maxLength={500} placeholder="Clarify exit rule" value={versionDraft.reason} onChange={(event) => setVersionDraft({ ...versionDraft, reason: event.target.value })} /></label><label className="wide">Logic changes<textarea required maxLength={2000} rows={3} value={versionDraft.logicChanges} onChange={(event) => setVersionDraft({ ...versionDraft, logicChanges: event.target.value })} /></label><div className="form-actions"><button className="btn btn-primary" disabled={formBusy}>{formBusy ? 'Saving…' : 'Create locked version'}</button></div></form>}
      {panel === 'experiment' && <form onSubmit={submitExperiment} className="lab-form-grid"><label>Experiment name<input required maxLength={160} value={experimentDraft.name} onChange={(event) => setExperimentDraft({ ...experimentDraft, name: event.target.value })} /></label><label>Mode<select value={experimentDraft.mode} onChange={(event) => setExperimentDraft({ ...experimentDraft, mode: event.target.value as RunStrategyExperimentInput['mode'] })}><option value="backtest">Backtest</option><option value="walk_forward">Walk-forward</option><option value="shadow">Shadow</option><option value="paper">Paper</option></select></label><label>Dataset version<input required maxLength={120} value={experimentDraft.datasetVersion} onChange={(event) => setExperimentDraft({ ...experimentDraft, datasetVersion: event.target.value })} /></label><label>Execution model<select value={experimentDraft.executionModel} onChange={(event) => setExperimentDraft({ ...experimentDraft, executionModel: event.target.value as RunStrategyExperimentInput['executionModel'] })}><option value="moderate">Moderate</option><option value="conservative">Conservative</option><option value="queue_aware">Queue aware</option><option value="optimistic">Optimistic</option></select></label><label>Random seed<input required min="1" type="number" value={experimentDraft.randomSeed} onChange={(event) => setExperimentDraft({ ...experimentDraft, randomSeed: event.target.value })} /></label><div className="form-actions"><button className="btn btn-primary" disabled={formBusy || !selected?.versionId}>{formBusy ? 'Running…' : 'Run simulated test'}</button></div></form>}
      {panel === 'journal' && <form onSubmit={submitJournal} className="lab-form-grid"><label>Entry type<select value={journalDraft.entryType} onChange={(event) => setJournalDraft({ ...journalDraft, entryType: event.target.value })}><option value="observation">Observation</option><option value="decision">Decision</option><option value="failure">Failure</option><option value="review">Review</option></select></label><label className="wide">Title<input required maxLength={160} value={journalDraft.title} onChange={(event) => setJournalDraft({ ...journalDraft, title: event.target.value })} /></label><label className="wide">Note<textarea required maxLength={3000} rows={4} value={journalDraft.body} onChange={(event) => setJournalDraft({ ...journalDraft, body: event.target.value })} /></label><div className="form-actions"><button className="btn btn-primary" disabled={formBusy}>{formBusy ? 'Saving…' : 'Save journal entry'}</button></div></form>}
    </section>}
    <section className="lab-workspace animate-in delay-3"><div className="lab-library card card-pad"><CardTitle title="Research library" subtitle={`${strategies.length} household strategies · select one to inspect`} action={<BookOpen size={17} color="var(--ink-soft)" />} /><div className="lab-library-list">{strategies.length === 0 && <div className="lab-empty"><FlaskConical size={21} /><strong>No hypotheses yet</strong><p>Start with an idea you can disprove.</p><button className="btn" onClick={() => openPanel('strategy')}>Add first hypothesis</button></div>}{strategies.map((strategy) => <button className={`lab-library-item ${selected?.id === strategy.id ? 'selected' : ''}`} key={strategy.id} onClick={() => setSelectedId(strategy.id)}><span className="library-mark"><FlaskConical size={15} /></span><span><strong>{strategy.name}</strong><small>{strategy.strategyType} · {strategy.version || 'unversioned'}</small></span><span className={`status ${strategy.status === 'failed' ? 'review' : ''}`}>{strategy.stage.replaceAll('_', ' ')}</span></button>)}</div></div>
      <div className="lab-detail">{selected ? <><section className="card card-pad lab-detail-card"><div className="lab-detail-header"><div><span className="mono-label">{selected.strategyType} / {selected.owner}</span><h2>{selected.name}</h2><p>{selected.description}</p></div><span className={`status ${selected.status === 'failed' ? 'review' : ''}`}>{selected.status}</span></div><div className="hypothesis-box"><span className="mono-label">Hypothesis</span><p>{selected.hypothesis}</p></div><div className="lab-detail-actions"><button className="btn" onClick={() => openPanel('version')}><GitBranch size={14} /> New version</button><button className="btn" onClick={() => openPanel('experiment')} disabled={!selected.versionId}><FlaskConical size={14} /> Run experiment</button><button className="btn" onClick={() => openPanel('journal')}><NotebookPen size={14} /> Journal</button></div></section><section className="card card-pad"><CardTitle title="Logic & guardrails" subtitle="The assumptions that make the result interpretable." /><div className="logic-grid">{[['Markets', selected.markets], ['Venues', selected.venues], ['Assets', selected.assets], ['Time horizon', [selected.timeHorizon]], ['Required data', selected.requiredData], ['Assumptions', selected.assumptions], ['Known risks', selected.knownRisks]].map(([label, items]) => <div key={label as string}><span>{label as string}</span><p>{(items as string[]).length ? (items as string[]).join(' · ') : 'Not recorded'}</p></div>)}</div></section><section className="card card-pad"><CardTitle title="Latest scorecard" subtitle="Performance is evidence, not permission." /><StrategyMetrics strategy={selected} />{selected.latestMetrics?.warning && <div className="metric-warning"><AlertTriangle size={14} />{selected.latestMetrics.warning}</div>}</section><section className="card card-pad"><CardTitle title="Graduation review" subtitle={selected.graduation.note} action={<button className="btn" onClick={() => { void evaluate(); }} disabled={evaluateGraduation.isPending}>{evaluateGraduation.isPending ? 'Reviewing…' : 'Evaluate gates'}</button>} /><div className="graduation-gates">{selected.graduation.gates.map((gate) => <div key={gate.name}><span className={gate.passed ? 'gate-pass' : 'gate-fail'}>{gate.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}</span><span>{gate.name}</span><strong>{gate.passed ? 'Passed' : 'Open'}</strong></div>)}</div><div className="lab-disabled-note"><Lock size={13} /> This review cannot enable live trading.</div></section></> : <section className="card card-pad lab-empty"><FlaskConical size={26} /><strong>Select a strategy to inspect</strong><p>The library will hold its hypothesis, assumptions, experiments, and review history.</p></section>}</div></section>
    <section className="lab-lower-grid"><section className="card card-pad"><CardTitle title="Experiment history" subtitle="Failures stay visible so evidence cannot become mythology." action={<History size={17} color="var(--ink-soft)" />} /><div className="table-wrap"><table className="table lab-experiment-table"><thead><tr><th>Experiment</th><th>Mode / data</th><th>Result</th><th>Return</th><th>Drawdown</th></tr></thead><tbody>{data.experiments.length === 0 && <tr><td colSpan={5}>No experiments recorded yet.</td></tr>}{data.experiments.map((experiment) => <tr key={experiment.id}><td><strong>{experiment.name}</strong><small>{experiment.strategyName} · seed {experiment.randomSeed}</small></td><td>{experiment.mode.replaceAll('_', ' ')}<small>{experiment.datasetVersion}</small></td><td><span className={`status ${experiment.status === 'failed' ? 'review' : experiment.status === 'completed' ? '' : 'pending'}`}>{experiment.status}</span>{experiment.failureReason && <small className="failure-text">{experiment.failureReason}</small>}</td><td className="font-mono">{metricValue(experiment.metrics.totalReturnPct, '%')}</td><td className="font-mono">{metricValue(experiment.metrics.maxDrawdownPct, '%')}</td></tr>)}</tbody></table></div></section><section className="card card-pad paper-account-card"><CardTitle title="Paper account" subtitle="A bounded rehearsal account, never a route to household capital." action={<Database size={17} color="var(--ink-soft)" />} /><div className="paper-account-head"><strong>{displayMoney(data.paperAccount.virtualCash, '$0')}</strong><span>virtual cash</span></div><div className="paper-facts"><div><span>Orders</span><strong>{data.paperAccount.virtualOrders}</strong></div><div><span>Fills</span><strong>{data.paperAccount.virtualFills}</strong></div><div><span>Positions</span><strong>{data.paperAccount.virtualPositions}</strong></div></div><div className="paper-limits"><span>Order cap <b>{data.paperAccount.maxOrder}</b></span><span>Strategy exposure <b>{data.paperAccount.maxStrategyExposure}</b></span><span>Daily loss <b>{data.paperAccount.maxDailyLoss}</b></span></div><div className="lab-disabled-note"><ShieldCheck size={13} /> Kill switch: {data.paperAccount.killSwitch}. No brokerage connection.</div></section></section>
    <section className="card card-pad page-section"><CardTitle title="Research journal" subtitle="Decisions and failures are part of the dataset." action={<button className="btn" onClick={() => openPanel('journal')} disabled={!selected}><NotebookPen size={14} /> Add note</button>} /><div className="journal-list">{data.journal.length === 0 && <div className="lab-empty compact"><ScrollText size={19} /><span>No journal entries yet.</span></div>}{data.journal.slice(0, 6).map((entry) => <article key={entry.id}><div className="journal-date">{new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div><div><span className="status">{entry.entryType}</span><h3>{entry.title}</h3><p>{entry.body}</p></div></article>)}</div></section>
  </main>;
}

function PortfolioPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  return <main className="content">
    <PageHeading eyebrow="Plan / portfolio" title={<>Know what is<br /><em>carrying the load.</em></>} description="A composed view of where your family capital sits today—not a screen that asks you to react." actions={<button className="btn" data-testid="button-portfolio-export" onClick={() => onFeedback('Local-only preview: no server report was created.')}><ArrowDownLeft size={15} /> Export snapshot</button>} />
    <div className="portfolio-split">
      <section className="card card-pad animate-in delay-1"><CardTitle title="Capital composition" subtitle="Total tracked capital · $56,280" /><div className="donut-wrap"><div className="donut"><div className="donut-center"><strong>$56.3k</strong><span>total capital</span></div></div><div className="holding-list">{[['Duplex Reserve','63%','var(--color-primary)'],['Opportunity Reserve','20%','var(--color-opportunity)'],['Capital OS','11%','var(--color-protected)'],['Other cash','6%','var(--color-warning)']].map(([name, pct, color]) => <div className="holding-row" key={name}><i style={{ background:color }} /><span>{name}</span><b>{pct}</b></div>)}</div></div></section>
      <section className="card card-pad animate-in delay-1"><CardTitle title="Resilience check" subtitle="How the plan behaves in three ordinary scenarios." /><div className="activity-list">{[['Emergency buffer', '8.4 months of core expenses', 'Strong', 'var(--ink)'], ['Acquisition liquidity', '100% available within 5 days', 'Ready', 'var(--marigold)'], ['Single-account exposure', 'Largest account is 63% of total', 'Watch', 'var(--clay)']].map(([label, desc, status, color]) => <div className="activity-item" key={label}><div className="activity-icon" style={{ background: 'var(--secondary)', color }}><ShieldCheck size={14} /></div><div className="activity-copy"><strong>{label}</strong><span>{desc}</span></div><span className="status" style={{ color, background: 'var(--secondary)' }}>{status}</span></div>)}</div></section>
    </div>
      <section className="card card-pad page-section"><CardTitle title="Accounts & sleeves" subtitle="Last synced 14 October 2024 at 08:42" action={<button className="btn" data-testid="button-sync-portfolio" onClick={() => onFeedback('Account balances are already current.')}><RotateCcw size={14} /> Sync now</button>} /><div className="table-wrap"><table className="table"><thead><tr><th>Account</th><th>Purpose</th><th>Balance</th><th>Access</th><th /></tr></thead><tbody>{[['Vanguard brokerage · 4821','Duplex Reserve','$48,260','Liquid'],['Ally High Yield · 1094','Opportunity Reserve','$6,840','Liquid'],['Capital OS checking · 0037','Operating reserve','$1,180','Everyday'],['Series I bonds · 7410','Long horizon','$4,920','12-mo hold']].map((row, index) => <tr key={row[0]}><td><strong>{row[0]}</strong></td><td>{row[1]}</td><td className="font-mono">{row[2]}</td><td><span className={`status ${index === 3 ? 'pending' : ''}`}>{row[3]}</span></td><td><button className="icon-btn" data-testid={`button-account-menu-${index}`} onClick={() => onFeedback(`${row[0]} is connected to your plan.`)}><MoreHorizontal size={15} /></button></td></tr>)}</tbody></table></div></section>
  </main>;
}

function PropertiesPage({ onAction }: { onAction: (kind: Exclude<ModalKind, null>) => void }) {
  const query = useGetPropertyUnderwriting();
  const updateBuyBox = useUpdateBuyBox();
  const createCandidate = useCreatePropertyCandidate();
  const analyzeCandidate = useAnalyzePropertyCandidate();
  const [editingBuyBox, setEditingBuyBox] = useState(false);
  const [showCandidateForm, setShowCandidateForm] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [buyBoxDraft, setBuyBoxDraft] = useState({ purchasePriceMinimum: '', purchasePriceMaximum: '', minimumEstimatedRent: '', maximumEstimatedRehabilitation: '', minimumDscrEstimate: '' });
  const [candidateDraft, setCandidateDraft] = useState({ addressLabel: '', market: 'Northside / transit', askingPrice: '', estimatedRent: '', repairs: '', units: '2', bedrooms: '4' });
  const data = query.data as any;
  const readiness = data?.propertyGoal?.readiness;
  const candidates = data?.candidates ?? [];
  const currentCandidate = candidates.find((item: any) => item.id === selectedCandidateId);
  const beginBuyBoxEdit = () => {
    setBuyBoxDraft({
      purchasePriceMinimum: data.buyBox.purchasePriceMinimum,
      purchasePriceMaximum: data.buyBox.purchasePriceMaximum,
      minimumEstimatedRent: data.buyBox.minimumEstimatedRent,
      maximumEstimatedRehabilitation: data.buyBox.maximumEstimatedRehabilitation,
      minimumDscrEstimate: data.buyBox.minimumDscrEstimate,
    });
    setEditingBuyBox(true);
  };
  const saveBuyBox = async () => {
    await updateBuyBox.mutateAsync({ data: buyBoxDraft });
    await queryClient.invalidateQueries({ queryKey: getGetPropertyUnderwritingQueryKey() });
    setEditingBuyBox(false);
  };
  const addCandidate = async (event: FormEvent) => {
    event.preventDefault();
    if (!data?.propertyGoal?.id) return;
    await createCandidate.mutateAsync({
      data: {
        ...candidateDraft,
        propertyGoalId: data.propertyGoal.id,
        propertyType: 'duplex',
        bathrooms: '2',
        annualPropertyTaxes: '7200.00',
        insurance: '2400.00',
        hoa: '0.00',
        vacancyAssumption: '0.05',
        status: 'research',
      } as CreatePropertyCandidateInput,
    });
    await queryClient.invalidateQueries({ queryKey: getGetPropertyUnderwritingQueryKey() });
    setCandidateDraft({ addressLabel: '', market: 'Northside / transit', askingPrice: '', estimatedRent: '', repairs: '', units: '2', bedrooms: '4' });
    setShowCandidateForm(false);
  };
  const runAnalysis = async (candidateId: string) => {
    setSelectedCandidateId(candidateId);
    setAnalysis(await analyzeCandidate.mutateAsync({ candidateId }));
    await queryClient.invalidateQueries({ queryKey: getGetPropertyUnderwritingQueryKey() });
  };
  if (query.isLoading) return <main className="content"><div className="card card-pad">Loading acquisition dashboard…</div></main>;
  if (query.isError || !data) return <main className="content"><div className="card card-pad" role="alert">Acquisition data is temporarily unavailable. Try again in a moment.</div></main>;
  return <main className="content">
    <PageHeading eyebrow="Plan / properties / acquisition OS" title={<>Find the right duplex,<br /><em>not just a property.</em></>} description="Readiness, affordability, financing estimates, and investment quality stay separate so every next step remains explainable." actions={<><button className="btn" data-testid="button-add-property-note" onClick={() => onAction('property')}><NotebookPen size={14} /> Add note</button><button className="btn btn-primary" data-testid="button-add-property-candidate" onClick={() => setShowCandidateForm(!showCandidateForm)}><Plus size={15} /> Add candidate</button></>} />
    <section className="acquisition-metrics animate-in delay-1">
      <div className="metric-card blue"><div className="mono-label">Property readiness</div><div className="metric-value">{readiness?.score ?? 0}<small>/100</small></div><div className="metric-detail">{readiness?.status ?? 'Preparing'} · household level</div></div>
      <div className="metric-card green"><div className="mono-label">Safe to deploy</div><div className="metric-value">{displayMoney(data.household.safeToDeploy, '$0')}</div><div className="metric-detail">Governor-calculated, not a loan estimate</div></div>
      <div className="metric-card lavender"><div className="mono-label">Target cash to close</div><div className="metric-value">{displayMoney(data.buyBox.targetCashToClose, '$0')}</div><div className="metric-detail">Includes reserves and buffers</div></div>
      <div className="metric-card amber"><div className="mono-label">Pipeline</div><div className="metric-value">{candidates.length}<small> candidates</small></div><div className="metric-detail">Manual and provider-neutral</div></div>
    </section>
    <div className="section-grid-wide">
      <section className="card card-pad acquisition-readiness animate-in delay-2">
        <CardTitle title="Readiness score" subtitle="Household capacity to acquire, independent of any one property." action={<span className={`status ${readiness?.score < 60 ? 'pending' : ''}`}>{readiness?.status}</span>} />
        <div className="readiness-score"><div className="readiness-ring" style={{ '--readiness': `${readiness?.score ?? 0}%` } as React.CSSProperties}><strong>{readiness?.score ?? 0}</strong><span>of 100</span></div><div><p className="readiness-summary">{data.nextAction}</p><div className="progress-label"><span>Protected reserve path</span><b>{readiness?.score ?? 0}%</b></div><Progress value={readiness?.score ?? 0} /></div></div>
        <div className="governor-note"><ShieldCheck size={16} /><span>Readiness is not approval or qualification. It is a planning signal built from this household’s data.</span></div>
      </section>
      <section className="card card-pad animate-in delay-2">
        <CardTitle title="Buy box" subtitle="The guardrails every candidate is measured against." action={<button className="btn" onClick={editingBuyBox ? saveBuyBox : beginBuyBoxEdit}>{editingBuyBox ? 'Save guardrails' : 'Edit buy box'}</button>} />
        {editingBuyBox ? <div className="buy-box-editor">{[['purchasePriceMinimum','Min price'],['purchasePriceMaximum','Max price'],['minimumEstimatedRent','Min rent'],['maximumEstimatedRehabilitation','Max repairs'],['minimumDscrEstimate','Min DSCR']].map(([key, label]) => <div className="field" key={key}><label>{label}</label><input value={buyBoxDraft[key as keyof typeof buyBoxDraft]} onChange={(event) => setBuyBoxDraft({ ...buyBoxDraft, [key]: event.target.value })} /></div>)}</div> : <div className="buy-box-grid"><div><span>Price range</span><strong>{displayMoney(data.buyBox.purchasePriceMinimum, '$0')}–{displayMoney(data.buyBox.purchasePriceMaximum, '$0')}</strong></div><div><span>Owner occupied</span><strong>{data.buyBox.ownerOccupied ? 'House hack' : 'Investment only'}</strong></div><div><span>Rent floor</span><strong>{displayMoney(data.buyBox.minimumEstimatedRent, '$0')} / mo</strong></div><div><span>Repair ceiling</span><strong>{displayMoney(data.buyBox.maximumEstimatedRehabilitation, '$0')}</strong></div><div><span>Coverage floor</span><strong>{data.buyBox.minimumDscrEstimate} DSCR</strong></div><div><span>Market</span><strong>{data.buyBox.targetMarkets?.join(', ')}</strong></div></div>}
      </section>
    </div>
    {showCandidateForm && <section className="card card-pad page-section animate-in"><CardTitle title="Add a property candidate" subtitle="Incomplete data is allowed; it will lower confidence rather than become a hidden assumption." /><form className="candidate-form" onSubmit={addCandidate}><div className="field"><label>Address or listing label</label><input required value={candidateDraft.addressLabel} onChange={(event) => setCandidateDraft({ ...candidateDraft, addressLabel: event.target.value })} placeholder="e.g. 1842 N Maple Ave" /></div><div className="field"><label>Market</label><input required value={candidateDraft.market} onChange={(event) => setCandidateDraft({ ...candidateDraft, market: event.target.value })} /></div><div className="field"><label>Asking price</label><input required inputMode="decimal" value={candidateDraft.askingPrice} onChange={(event) => setCandidateDraft({ ...candidateDraft, askingPrice: event.target.value })} placeholder="465000.00" /></div><div className="field"><label>Estimated total rent / mo</label><input required inputMode="decimal" value={candidateDraft.estimatedRent} onChange={(event) => setCandidateDraft({ ...candidateDraft, estimatedRent: event.target.value })} placeholder="2600.00" /></div><div className="field"><label>Repair estimate</label><input required inputMode="decimal" value={candidateDraft.repairs} onChange={(event) => setCandidateDraft({ ...candidateDraft, repairs: event.target.value })} placeholder="18000.00" /></div><div className="field"><label>Bedrooms total</label><input required value={candidateDraft.bedrooms} onChange={(event) => setCandidateDraft({ ...candidateDraft, bedrooms: event.target.value })} /></div><button className="btn btn-primary" type="submit" disabled={createCandidate.isPending}><Check size={14} /> {createCandidate.isPending ? 'Saving…' : 'Save candidate'}</button></form></section>}
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Property pipeline" subtitle="Match score and deal quality are property-level signals. Household readiness remains separate." action={<div className="view-toggle"><button className="active">Table</button><button>Kanban</button></div>} />
      {candidates.length === 0 ? <div className="empty-state"><Building2 size={18} /><strong>No candidates yet</strong><span>Add a listing to begin research without committing capital.</span></div> : <div className="pipeline-table">{candidates.map((candidate: any) => <div className={`pipeline-row ${selectedCandidateId === candidate.id ? 'selected' : ''}`} key={candidate.id}><div className="pipeline-address"><strong>{candidate.addressLabel}</strong><span>{candidate.market ?? 'Market not set'} · {humanize(candidate.status)}</span></div><div className="pipeline-score"><span>Buy box</span><b>{candidate.buyBoxScore ?? '0'}%</b></div><div className="pipeline-score"><span>Deal quality</span><b>{candidate.dealQualityScore ?? '0'}%</b></div><div className="pipeline-price"><span>Ask</span><b>{displayMoney(candidate.askingPrice, '$0')}</b></div><button className="btn" onClick={() => runAnalysis(candidate.id)} disabled={analyzeCandidate.isPending}>{analyzeCandidate.isPending && selectedCandidateId === candidate.id ? 'Analyzing…' : 'Analyze deal'}</button></div>)}</div>}
    </section>
    {(analysis || currentCandidate) && <section className="section-grid-wide page-section animate-in"><section className="card card-pad"><CardTitle title="Deal analyzer" subtitle={`${currentCandidate?.addressLabel ?? 'Selected candidate'} · illustrative estimates only`} /><div className="analyzer-metrics"><div><span>Owner housing cost</span><strong>{displayMoney(analysis?.deal?.analysis?.ownerEffectiveHousingCost ?? currentCandidate?.deal?.analysis?.ownerEffectiveHousingCost, '$0')} / mo</strong></div><div><span>Projected cash flow</span><strong>{displayMoney(analysis?.deal?.analysis?.monthlyCashFlow ?? currentCandidate?.deal?.analysis?.monthlyCashFlow, '$0')} / mo</strong></div><div><span>DSCR estimate</span><strong>{analysis?.deal?.analysis?.dscr ?? currentCandidate?.deal?.analysis?.dscr ?? '—'}</strong></div><div><span>Cash to close</span><strong>{displayMoney(analysis?.cashToClose?.estimatedCashToClose, displayMoney(currentCandidate?.cashRequired, '$—'))}</strong></div></div><div className="governor-note"><ShieldAlert size={16} /><span>Property Capital Governor: <b>{analysis?.governor?.status ?? currentCandidate?.readinessStatus ?? 'Needs analysis'}</b>. AI cannot override this gate or submit an offer.</span></div></section><section className="card card-pad"><CardTitle title="Downside view" subtitle="Vacancy, rent softness, repairs, insurance, and income pressure." /><div className={`stress-result ${analysis?.stress?.result === 'fail' ? 'fail' : analysis?.stress?.result === 'review' ? 'review' : ''}`}><strong>{analysis?.stress?.result ?? 'Not run'}</strong><span>{analysis ? `${displayMoney(String(Math.round((analysis.stress.monthlyCashFlowCents ?? 0) / 100)), '$0')} monthly scenario cash flow` : 'Run analysis to calculate a combined downside case.'}</span></div><p className="disclaimer">This is not a mortgage approval, property valuation, rental guarantee, or offer recommendation.</p></section></section>}
    <div className="section-grid-wide page-section">
      <section className="card card-pad"><CardTitle title="Financing scenarios" subtitle="Planning comparisons, not lender offers or approvals." /><div className="scenario-list">{(data.financingScenarios ?? []).map((scenario: any) => <div className="scenario-row" key={scenario.id}><div><strong>{scenario.name}</strong><span>{scenario.loanType} · {(Number(scenario.downPaymentPercent) * 100).toFixed(1)}% down</span></div><div><span>Loan amount</span><b>{displayMoney(scenario.loanAmount, '$0')}</b></div><div><span>Housing estimate</span><b>{displayMoney(scenario.estimatedMonthlyHousingCost, '$0')} / mo</b></div></div>)}</div><p className="disclaimer">Rates, payment estimates, taxes, insurance, and reserves require professional verification. Nothing here represents mortgage approval or guaranteed qualification.</p></section>
      <section className="card card-pad"><CardTitle title="Preapproval tracker" subtitle="A checklist for a lender conversation, using non-approval language." />{(data.preapprovals ?? []).map((record: any) => <div className="preapproval-card" key={record.id}><div className="activity-icon"><Landmark size={14} /></div><div><strong>{record.provider}</strong><span>{humanize(record.status)} · no approval recorded</span><p>{record.documentsNeeded ?? 'Document list not started.'}</p></div><span className="status pending">Research</span></div>)}<button className="btn" style={{ marginTop:16 }} onClick={() => onAction('property')}><NotebookPen size={14} /> Add lender note</button></section>
    </div>
    <div className="section-grid-wide page-section">
      <section className="card card-pad"><CardTitle title="Target market comparison" subtitle="Market signals inform research; they do not represent property value or rental guarantees." /><div className="market-list">{(data.markets ?? []).map((market: any) => <div className="market-row" key={market.id}><div><strong>{market.name}</strong><span>{market.notes}</span></div><div><span>Fit score</span><b>{market.score}</b></div><div><span>Median price</span><b>{displayMoney(market.medianPrice, '$0')}</b></div><div><span>Rent yield signal</span><b>{(Number(market.rentYield) * 100).toFixed(1)}%</b></div></div>)}</div></section>
      <section className="card card-pad"><CardTitle title="Private document vault" subtitle="Documents remain private to this household workspace." /><div className="document-list">{(data.documents ?? []).map((document: any) => <div className="document-row" key={document.id}><div className="activity-icon"><LockKeyhole size={14} /></div><div><strong>{document.name}</strong><span>{document.metadata?.description ?? 'Private acquisition document'}</span></div><span className={`status ${document.metadata?.status === 'ready' ? '' : 'pending'}`}>{humanize(document.metadata?.status, 'Needed')}</span></div>)}</div><button className="btn" style={{ marginTop:16 }} onClick={() => onAction('property')}><FilePlus2 size={14} /> Add private note</button></section>
    </div>
    <section className="card card-pad page-section"><CardTitle title="Acquisition timeline" subtitle="One accountable next step at each checkpoint." /><div className="timeline-list">{(data.milestones ?? []).map((milestone: any, index: number) => <div className={`timeline-row ${milestone.status === 'current' ? 'current' : ''}`} key={milestone.id}><div className="timeline-dot">{index + 1}</div><div><strong>{milestone.name}</strong><span>{milestone.currentState} · {milestone.progress}%</span></div><div><span>Next</span><b>{milestone.nextAction}</b></div><span className={`status ${planningStatusClass(milestone.status)}`}>{humanize(milestone.status)}</span></div>)}</div></section>
    <section className="card card-pad page-section"><CardTitle title="Next-best actions" subtitle="Deterministic, useful, and reversible." /><div className="action-list"><div><Check size={15} /><span>{data.nextAction}</span></div><div><FileText size={15} /><span>Collect pay stubs, tax returns, statements, and insurance estimates for a lender conversation.</span></div><div><ShieldCheck size={15} /><span>Keep protected capital and the post-close liquidity floor outside any offer decision.</span></div></div></section>
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

async function refreshPlanningQueries(listKey: readonly string[]) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: listKey }),
    queryClient.invalidateQueries({ queryKey: getGetSafeToDeployQueryKey() }),
    queryClient.invalidateQueries({ queryKey: ['/api/cash-flow'] }),
  ]);
}

function PlanningFormFrame({ title, subtitle, onCancel, children }: { title: string; subtitle: string; onCancel: () => void; children: ReactNode }) {
  return <section className="card card-pad page-section planning-form-card"><CardTitle title={title} subtitle={subtitle} /><button className="icon-btn planning-form-close" aria-label="Close form" onClick={onCancel}><X size={15} /></button>{children}</section>;
}

function BillsPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useListBills({ query: { queryKey: getListBillsQueryKey(), staleTime: 5 * 60 * 1000 } });
  const create = useCreateBill();
  const update = useUpdateBill();
  const pause = usePauseBill();
  const resume = useResumeBill();
  const remove = useDeleteBill();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BillInput>({ billName: '', dueDate: '', expectedAmount: '', essential: true, autoPay: false });
  const bills = query.data ?? [];
  const activeBills = bills.filter((bill) => bill.active);
  const orderedBills = [...bills].sort((a, b) => Number(b.active) - Number(a.active) || new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  const total = activeBills.reduce((sum, bill) => sum + Number(bill.expectedAmount), 0);
  const attentionCount = activeBills.filter((bill) => ['overdue', 'review', 'attention'].some((term) => bill.status.toLowerCase().includes(term))).length;
  const startCreate = () => { setEditingId(null); setForm({ billName: '', dueDate: '', expectedAmount: '', essential: true, autoPay: false }); setFormOpen(true); };
  const startEdit = (bill: Bill) => { setEditingId(bill.id); setForm({ billName: bill.billName, dueDate: bill.dueDate.slice(0, 10), expectedAmount: bill.expectedAmount, status: bill.status, essential: bill.essential, autoPay: bill.autoPay }); setFormOpen(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) await update.mutateAsync({ billId: editingId, data: form });
      else await create.mutateAsync({ data: form });
      await refreshPlanningQueries(getListBillsQueryKey());
      setFormOpen(false);
      onFeedback(editingId ? 'Bill updated. Safe-to-deploy context refreshed.' : 'Bill added. Safe-to-deploy context refreshed.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'Bill could not be saved.'); }
  };
  const togglePause = async (bill: Bill) => {
    try { if (bill.active) await pause.mutateAsync({ billId: bill.id }); else await resume.mutateAsync({ billId: bill.id }); await refreshPlanningQueries(getListBillsQueryKey()); onFeedback(bill.active ? 'Bill paused and removed from Governor commitments.' : 'Bill resumed and added to Governor commitments.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Bill status could not be changed.'); }
  };
  const deleteRow = async (bill: Bill) => {
    if (!window.confirm(`Delete ${bill.billName}?`)) return;
    try { await remove.mutateAsync({ billId: bill.id }); await refreshPlanningQueries(getListBillsQueryKey()); onFeedback('Bill deleted. Safe-to-deploy context refreshed.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Bill could not be deleted.'); }
  };
  const pending = create.isPending || update.isPending || pause.isPending || resume.isPending || remove.isPending;
  return <main className="content">
    <PageHeading eyebrow="Household finance / bills" title={<>Keep the<br /><em>must-pay list clear.</em></>} description="Known household bills stay visible here so timing and essential commitments are accounted for before new capital decisions." actions={<><Link className="btn" href="/upcoming-expenses" data-testid="link-bills-upcoming-expenses"><CalendarDays size={15} /> Upcoming expenses</Link><button className="btn btn-primary" onClick={startCreate} data-testid="button-add-bill"><Plus size={15} /> Add bill</button></>} />
    <PlanningDataState label="bills" isLoading={query.isLoading} isError={query.isError} isFetching={query.isFetching} isStale={query.isStale} dataUpdatedAt={query.dataUpdatedAt} hasData={bills.length > 0} onRetry={() => { void query.refetch(); }} />
    {formOpen && <PlanningFormFrame title={editingId ? 'Edit household bill' : 'Add a household bill'} subtitle="Active bills are included in the Capital Governor’s commitment view." onCancel={() => setFormOpen(false)}><form className="planning-form" onSubmit={submit}><div className="field"><label>Bill name</label><input required value={form.billName} onChange={(event) => setForm({ ...form, billName: event.target.value })} data-testid="input-bill-name" /></div><div className="field"><label>Due date</label><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} data-testid="input-bill-due-date" /></div><div className="field"><label>Expected amount</label><input required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" value={form.expectedAmount} onChange={(event) => setForm({ ...form, expectedAmount: event.target.value })} data-testid="input-bill-amount" /></div>{editingId && <div className="field"><label>Status</label><select value={form.status ?? 'upcoming'} onChange={(event) => setForm({ ...form, status: event.target.value as BillInput['status'] })}><option value="upcoming">Upcoming</option><option value="due_soon">Due soon</option><option value="estimated">Estimated</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="skipped">Skipped</option></select></div>}<label className="planning-check"><input type="checkbox" checked={form.essential ?? true} onChange={(event) => setForm({ ...form, essential: event.target.checked })} /> Essential commitment</label><label className="planning-check"><input type="checkbox" checked={form.autoPay ?? false} onChange={(event) => setForm({ ...form, autoPay: event.target.checked })} /> Autopay enabled</label><div className="modal-actions"><button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}><Check size={14} /> {editingId ? 'Save changes' : 'Add bill'}</button></div></form></PlanningFormFrame>}
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Planned bill total" value={query.data ? displayMoney(total.toFixed(2), 'Not available') : 'Not available'} detail="known commitments" tone="amber" />
      <FinanceMetric label="Next due" value={query.data ? formatPlanningDate(orderedBills[0]?.dueDate, 'No bills') : 'Not available'} detail={orderedBills[0]?.billName ?? 'waiting for data'} tone="blue" />
       <FinanceMetric label="Essential bills" value={query.data ? `${activeBills.filter((bill) => bill.essential).length}` : 'Not available'} detail="active commitments" tone="green" />
      <FinanceMetric label="Needs attention" value={query.data ? `${attentionCount}` : 'Not available'} detail="review before deploying" tone="lavender" />
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Upcoming bills" subtitle="Due date, priority, and payment status at a glance." action={<Link className="text-link" href="/cash-flow" data-testid="link-bills-cash-flow">See cash flow <ArrowUpRight size={13} /></Link>} />
      {!query.isLoading && !query.isError && bills.length === 0 && <div className="empty-state" data-testid="empty-bills"><CalendarDays size={25} /><h3>No bills recorded</h3><p>Add known recurring obligations when the household is ready. They will be included in the Governor’s conservative planning context.</p></div>}
       {bills.length > 0 && <div className="planning-table bills-table" role="table" aria-label="Household bills"><div className="planning-table-header" role="row"><span>Bill</span><span>Timing</span><span>Priority</span><span>Amount</span><span>Status</span></div>{orderedBills.map((bill) => <div className={`planning-table-row ${bill.active ? '' : 'planning-row-paused'}`} role="row" key={bill.id} data-testid={`row-bill-${bill.id}`}><div><strong>{bill.billName}</strong><span>{bill.autoPay ? 'Autopay enabled' : 'Manual payment'}</span></div><span>{formatPlanningDate(bill.dueDate)}</span><span className={`status ${bill.essential ? '' : 'review'}`}>{bill.essential ? 'Essential' : 'Flexible'}</span><strong className="planning-amount">{displayMoney(bill.expectedAmount, 'Not available')}</strong><div className="planning-row-status"><span className={`status ${bill.active ? planningStatusClass(bill.status) : 'critical'}`}>{bill.active ? humanize(bill.status) : 'Paused'}</span><div className="planning-actions"><button className="text-link" onClick={() => startEdit(bill)} data-testid={`button-edit-bill-${bill.id}`}><Pencil size={12} /> Edit</button><button className="text-link" onClick={() => { void togglePause(bill); }} disabled={pending} data-testid={`${bill.active ? 'button-pause' : 'button-resume'}-bill-${bill.id}`}>{bill.active ? 'Pause' : 'Resume'}</button><button className="text-link danger" onClick={() => { void deleteRow(bill); }} disabled={pending} data-testid={`button-delete-bill-${bill.id}`}>Delete</button></div></div></div>)}</div>}
      <div className="finance-note"><ShieldCheck size={16} /><span>Bills are treated as known commitments in Safe-to-Deploy, so a new or changed obligation reduces available room automatically after the next refresh.</span></div>
    </section>
    <SafeToDeployContext focus="bills" />
  </main>;
}

function UpcomingExpensesPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useListUpcomingExpenses({ query: { queryKey: getListUpcomingExpensesQueryKey(), staleTime: 5 * 60 * 1000 } });
  const create = useCreateUpcomingExpense();
  const update = useUpdateUpcomingExpense();
  const pause = usePauseUpcomingExpense();
  const resume = useResumeUpcomingExpense();
  const remove = useDeleteUpcomingExpense();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UpcomingExpenseInput>({ name: '', estimatedAmount: '', expectedDate: '', priority: 'normal', required: false, fundedAmount: '0.00' });
  const expenses = query.data ?? [];
  const activeExpenses = expenses.filter((expense) => expense.active);
  const orderedExpenses = [...expenses].sort((a, b) => Number(b.active) - Number(a.active) || new Date(a.expectedDate).getTime() - new Date(b.expectedDate).getTime());
  const remaining = (expense: UpcomingExpense) => Math.max(0, Number(expense.estimatedAmount) - Number(expense.fundedAmount));
  const requiredRemaining = activeExpenses.reduce((sum, expense) => sum + (expense.required ? remaining(expense) : 0), 0);
  const startCreate = () => { setEditingId(null); setForm({ name: '', estimatedAmount: '', expectedDate: '', priority: 'normal', required: false, fundedAmount: '0.00' }); setFormOpen(true); };
  const startEdit = (expense: UpcomingExpense) => { setEditingId(expense.id); setForm({ name: expense.name, estimatedAmount: expense.estimatedAmount, expectedDate: expense.expectedDate.slice(0, 10), priority: expense.priority, required: expense.required, fundedAmount: expense.fundedAmount }); setFormOpen(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) await update.mutateAsync({ expenseId: editingId, data: form });
      else await create.mutateAsync({ data: form });
      await refreshPlanningQueries(getListUpcomingExpensesQueryKey());
      setFormOpen(false);
      onFeedback(editingId ? 'Upcoming expense updated. Safe-to-deploy context refreshed.' : 'Upcoming expense added. Safe-to-deploy context refreshed.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'Upcoming expense could not be saved.'); }
  };
  const togglePause = async (expense: UpcomingExpense) => {
    try { if (expense.active) await pause.mutateAsync({ expenseId: expense.id }); else await resume.mutateAsync({ expenseId: expense.id }); await refreshPlanningQueries(getListUpcomingExpensesQueryKey()); onFeedback(expense.active ? 'Upcoming expense paused and removed from Governor commitments.' : 'Upcoming expense resumed and added to Governor commitments.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Upcoming expense status could not be changed.'); }
  };
  const deleteRow = async (expense: UpcomingExpense) => {
    if (!window.confirm(`Delete ${expense.name}?`)) return;
    try { await remove.mutateAsync({ expenseId: expense.id }); await refreshPlanningQueries(getListUpcomingExpensesQueryKey()); onFeedback('Upcoming expense deleted. Safe-to-deploy context refreshed.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Upcoming expense could not be deleted.'); }
  };
  const pending = create.isPending || update.isPending || pause.isPending || resume.isPending || remove.isPending;
  return <main className="content">
    <PageHeading eyebrow="Household finance / upcoming expenses" title={<>Make room for<br /><em>what is next.</em></>} description="One-time and known future expenses have a place of their own, separate from recurring bills and everyday transactions." actions={<><Link className="btn" href="/bills" data-testid="link-upcoming-bills"><ReceiptText size={15} /> View bills</Link><button className="btn btn-primary" onClick={startCreate} data-testid="button-add-upcoming-expense"><Plus size={15} /> Add expense</button></>} />
    <PlanningDataState label="upcoming expenses" isLoading={query.isLoading} isError={query.isError} isFetching={query.isFetching} isStale={query.isStale} dataUpdatedAt={query.dataUpdatedAt} hasData={expenses.length > 0} onRetry={() => { void query.refetch(); }} />
    {formOpen && <PlanningFormFrame title={editingId ? 'Edit upcoming expense' : 'Add an upcoming expense'} subtitle="Required, unfunded expenses reduce the Capital Governor’s commitment room." onCancel={() => setFormOpen(false)}><form className="planning-form" onSubmit={submit}><div className="field"><label>Expense name</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-upcoming-expense-name" /></div><div className="field"><label>Expected date</label><input required type="date" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} data-testid="input-upcoming-expense-date" /></div><div className="field"><label>Estimated amount</label><input required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" value={form.estimatedAmount} onChange={(event) => setForm({ ...form, estimatedAmount: event.target.value })} data-testid="input-upcoming-expense-amount" /></div><div className="field"><label>Already funded</label><input required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" value={form.fundedAmount ?? '0.00'} onChange={(event) => setForm({ ...form, fundedAmount: event.target.value })} data-testid="input-upcoming-expense-funded" /></div><div className="field"><label>Priority</label><select value={form.priority ?? 'normal'} onChange={(event) => setForm({ ...form, priority: event.target.value as UpcomingExpenseInput['priority'] })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div><label className="planning-check"><input type="checkbox" checked={form.required ?? false} onChange={(event) => setForm({ ...form, required: event.target.checked })} /> Required commitment</label><div className="modal-actions"><button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}><Check size={14} /> {editingId ? 'Save changes' : 'Add expense'}</button></div></form></PlanningFormFrame>}
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Required still to fund" value={query.data ? displayMoney(requiredRemaining.toFixed(2), 'Not available') : 'Not available'} detail="reduces safe-to-deploy room" tone="amber" />
      <FinanceMetric label="Next expected" value={query.data ? formatPlanningDate(orderedExpenses[0]?.expectedDate, 'No expenses') : 'Not available'} detail={orderedExpenses[0]?.name ?? 'waiting for data'} tone="blue" />
       <FinanceMetric label="Required items" value={query.data ? `${activeExpenses.filter((expense) => expense.required).length}` : 'Not available'} detail="active commitments" tone="green" />
       <FinanceMetric label="High priority" value={query.data ? `${activeExpenses.filter((expense) => ['high', 'urgent'].includes(expense.priority.toLowerCase())).length}` : 'Not available'} detail="reviewed first" tone="lavender" />
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Known upcoming expenses" subtitle="Funding progress keeps future choices visible without mixing them into recurring bills." action={<Link className="text-link" href="/cash-flow" data-testid="link-upcoming-cash-flow">See forecast <ArrowUpRight size={13} /></Link>} />
      {!query.isLoading && !query.isError && expenses.length === 0 && <div className="empty-state" data-testid="empty-upcoming-expenses"><CalendarDays size={25} /><h3>No upcoming expenses recorded</h3><p>Known future choices and one-time costs will appear here when they are added to the household plan.</p></div>}
       {expenses.length > 0 && <div className="planning-table expenses-table" role="table" aria-label="Known upcoming expenses"><div className="planning-table-header" role="row"><span>Expense</span><span>Timing</span><span>Priority</span><span>Funding</span><span>Status</span></div>{orderedExpenses.map((expense) => { const percent = Number(expense.estimatedAmount) > 0 ? (Number(expense.fundedAmount) / Number(expense.estimatedAmount)) * 100 : 0; return <div className={`planning-table-row ${expense.active ? '' : 'planning-row-paused'}`} role="row" key={expense.id} data-testid={`row-upcoming-expense-${expense.id}`}><div><strong>{expense.name}</strong><span>{expense.required ? 'Required commitment' : 'Optional choice'}</span></div><span>{formatPlanningDate(expense.expectedDate)}</span><span className={`status ${planningStatusClass(expense.priority)}`}>{humanize(expense.priority)}</span><div className="planning-funding"><div><strong>{displayMoney(expense.estimatedAmount, 'Not available')}</strong><span>{displayMoney(expense.fundedAmount, 'Not available')} funded · {displayMoney(remaining(expense).toFixed(2), 'Not available')} left</span></div><Progress value={percent} /></div><div className="planning-row-status"><span className={`status ${expense.active ? (expense.required ? 'pending' : 'review') : 'critical'}`}>{expense.active ? (expense.required ? 'Required' : 'Optional') : 'Paused'}</span><div className="planning-actions"><button className="text-link" onClick={() => startEdit(expense)} data-testid={`button-edit-upcoming-expense-${expense.id}`}><Pencil size={12} /> Edit</button><button className="text-link" onClick={() => { void togglePause(expense); }} disabled={pending} data-testid={`${expense.active ? 'button-pause' : 'button-resume'}-upcoming-expense-${expense.id}`}>{expense.active ? 'Pause' : 'Resume'}</button><button className="text-link danger" onClick={() => { void deleteRow(expense); }} disabled={pending} data-testid={`button-delete-upcoming-expense-${expense.id}`}>Delete</button></div></div></div>; })}</div>}
      <div className="finance-note"><ShieldCheck size={16} /><span>Only the unfunded remainder of required expenses is deducted from Safe-to-Deploy. Optional choices stay visible without being treated as obligations.</span></div>
    </section>
    <SafeToDeployContext focus="upcoming" />
  </main>;
}

function IncomePage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useListIncomeSources({ query: { queryKey: getListIncomeSourcesQueryKey(), staleTime: 5 * 60 * 1000 } });
  const create = useCreateIncomeSource();
  const update = useUpdateIncomeSource();
  const pause = usePauseIncomeSource();
  const resume = useResumeIncomeSource();
  const remove = useDeleteIncomeSource();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<IncomeSourceInput>({ name: '', sourceType: 'employment', expectedMonthly: '', cadence: 'monthly', nextPayDate: '' });
  const sources = query.data ?? [];
  const activeSources = sources.filter((source) => source.active);
  const monthlyInflow = activeSources.reduce((sum, source) => sum + Number(source.expectedMonthly), 0);
  const cadenceSummary = [...new Set(activeSources.map((source) => humanize(source.cadence)))].join(' · ') || 'Not scheduled';
  const nextPayDate = [...activeSources].map((source) => source.nextPayDate).filter(Boolean).sort()[0];
  const startCreate = () => { setEditingId(null); setForm({ name: '', sourceType: 'employment', expectedMonthly: '', cadence: 'monthly', nextPayDate: '' }); setFormOpen(true); };
  const startEdit = (source: IncomeSource) => { setEditingId(source.id); setForm({ name: source.name, sourceType: source.sourceType as IncomeSourceInput['sourceType'], expectedMonthly: source.expectedMonthly, cadence: source.cadence as IncomeSourceInput['cadence'], nextPayDate: source.nextPayDate.slice(0, 10) }); setFormOpen(true); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editingId) await update.mutateAsync({ incomeId: editingId, data: form });
      else await create.mutateAsync({ data: form });
      await refreshPlanningQueries(getListIncomeSourcesQueryKey());
      setFormOpen(false);
      onFeedback(editingId ? 'Income source updated. Forecast refreshed.' : 'Income source added. Forecast refreshed.');
    } catch (error) { onFeedback(error instanceof Error ? error.message : 'Income source could not be saved.'); }
  };
  const togglePause = async (source: IncomeSource) => {
    try { if (source.active) await pause.mutateAsync({ incomeId: source.id }); else await resume.mutateAsync({ incomeId: source.id }); await refreshPlanningQueries(getListIncomeSourcesQueryKey()); onFeedback(source.active ? 'Income source paused and removed from the forecast.' : 'Income source resumed and added to the forecast.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Income source status could not be changed.'); }
  };
  const deleteRow = async (source: IncomeSource) => {
    if (!window.confirm(`Delete ${source.name}?`)) return;
    try { await remove.mutateAsync({ incomeId: source.id }); await refreshPlanningQueries(getListIncomeSourcesQueryKey()); onFeedback('Income source deleted. Forecast refreshed.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Income source could not be deleted.'); }
  };
  const pending = create.isPending || update.isPending || pause.isPending || resume.isPending || remove.isPending;
  return <main className="content">
    <PageHeading eyebrow="Household finance / income" title={<>Know what keeps<br /><em>the plan moving.</em></>} description="Expected income sources anchor the forward-looking forecast. Keep active and paused sources clear so commitments are not mistaken for spendable cash." actions={<><Link className="btn" href="/cash-flow" data-testid="link-income-cash-flow"><TrendingUp size={15} /> View cash flow</Link><button className="btn btn-primary" onClick={startCreate} data-testid="button-add-income"><Plus size={15} /> Add income</button></>} />
    <PlanningDataState label="income" isLoading={query.isLoading} isError={query.isError} isFetching={query.isFetching} isStale={query.isStale} dataUpdatedAt={query.dataUpdatedAt} hasData={sources.length > 0} onRetry={() => { void query.refetch(); }} />
    {formOpen && <PlanningFormFrame title={editingId ? 'Edit income source' : 'Add an income source'} subtitle="Only active sources are used for forward-looking cash-flow timing." onCancel={() => setFormOpen(false)}><form className="planning-form" onSubmit={submit}><div className="field"><label>Source name</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-income-name" /></div><div className="field"><label>Source type</label><select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value as IncomeSourceInput['sourceType'] })}><option value="employment">Employment</option><option value="contract">Contract</option><option value="business">Business</option><option value="rental">Rental</option><option value="investment">Investment</option><option value="interest">Interest</option><option value="other">Other</option></select></div><div className="field"><label>Expected monthly</label><input required inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" value={form.expectedMonthly} onChange={(event) => setForm({ ...form, expectedMonthly: event.target.value })} data-testid="input-income-amount" /></div><div className="field"><label>Cadence</label><select value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value as IncomeSourceInput['cadence'] })}><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></div><div className="field"><label>Next pay date</label><input required type="date" value={form.nextPayDate} onChange={(event) => setForm({ ...form, nextPayDate: event.target.value })} data-testid="input-income-pay-date" /></div><div className="modal-actions"><button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}><Check size={14} /> {editingId ? 'Save changes' : 'Add income'}</button></div></form></PlanningFormFrame>}
    <div className="finance-grid animate-in delay-1">
      <FinanceMetric label="Expected monthly inflow" value={query.data ? displayMoney(monthlyInflow.toFixed(2), 'Not available') : 'Not available'} detail="active sources only" tone="green" />
      <FinanceMetric label="Active sources" value={query.data ? `${activeSources.length}` : 'Not available'} detail="included in forecast" tone="blue" />
      <FinanceMetric label="Paused sources" value={query.data ? `${sources.length - activeSources.length}` : 'Not available'} detail="not counted forward" tone="lavender" />
      <FinanceMetric label="Timing" value={query.data ? cadenceSummary : 'Not available'} detail={nextPayDate ? `next pay ${formatPlanningDate(nextPayDate)}` : 'expected cadence'} tone="amber" />
    </div>
    <section className="card card-pad page-section animate-in delay-2">
      <CardTitle title="Income sources" subtitle="Status, cadence, priority, and expected amount for each source." action={<Link className="text-link" href="/upcoming-expenses" data-testid="link-income-upcoming-expenses">Plan upcoming expenses <ArrowUpRight size={13} /></Link>} />
      {!query.isLoading && !query.isError && sources.length === 0 && <div className="empty-state" data-testid="empty-income"><CircleDollarSign size={25} /><h3>No income sources recorded</h3><p>Add expected sources so the monthly forecast can show how household commitments are covered.</p></div>}
       {sources.length > 0 && <div className="planning-table income-table" role="table" aria-label="Household income sources"><div className="planning-table-header" role="row"><span>Source</span><span>Timing</span><span>Priority</span><span>Amount</span><span>Status</span></div>{sources.map((source: IncomeSource) => <div className={`planning-table-row ${source.active ? '' : 'planning-row-paused'}`} role="row" key={source.id} data-testid={`row-income-${source.id}`}><div><strong>{source.name}</strong><span>{humanize(source.sourceType)} income</span></div><div style={{ display: 'grid', gap: 3 }}><strong>{humanize(source.cadence)}</strong><span>Next pay {formatPlanningDate(source.nextPayDate)}</span></div><span className={`status ${source.active ? '' : 'review'}`}>{source.active ? 'In forecast' : 'Paused'}</span><strong className="planning-amount">{displayMoney(source.expectedMonthly, 'Not available')}</strong><div className="planning-row-status"><span className={`status ${source.active ? '' : 'critical'}`}>{source.active ? 'Active' : 'Paused'}</span><div className="planning-actions"><button className="text-link" onClick={() => startEdit(source)} data-testid={`button-edit-income-${source.id}`}><Pencil size={12} /> Edit</button><button className="text-link" onClick={() => { void togglePause(source); }} disabled={pending} data-testid={`${source.active ? 'button-pause' : 'button-resume'}-income-${source.id}`}>{source.active ? 'Pause' : 'Resume'}</button><button className="text-link danger" onClick={() => { void deleteRow(source); }} disabled={pending} data-testid={`button-delete-income-${source.id}`}>Delete</button></div></div></div>)}</div>}
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

function IntelligencePage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useGetIntelligence();
  const refresh = useRefreshIntelligence();
  const scenario = useRunIntelligenceScenario();
  const [proposedWeekly, setProposedWeekly] = useState('250');
  const [scenarioResult, setScenarioResult] = useState<ContributionScenario | null>(null);
  const snapshot = query.data;
  const refreshNow = async () => {
    try {
      const next = await refresh.mutateAsync();
      queryClient.setQueryData(getGetIntelligenceQueryKey(), next);
      onFeedback('Intelligence refreshed from the latest household and property data.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Intelligence could not be refreshed.');
    }
  };
  const runScenario = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const result = await scenario.mutateAsync({ data: { proposedWeekly } });
      setScenarioResult(result);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The scenario could not be calculated.');
    }
  };
  return <main className="content">
    <PageHeading eyebrow="Keep track / intelligence" title={<>A clearer read on<br /><em>the next right move.</em></>} description="Specialist signals are combined into an explainable CIO view. Every recommendation is advisory, evidence-backed, and kept behind the Capital and Risk Governors." actions={<button className="btn btn-primary" onClick={() => { void refreshNow(); }} disabled={refresh.isPending} data-testid="button-refresh-intelligence"><RotateCcw size={14} className={refresh.isPending ? 'spin' : ''} /> {refresh.isPending ? 'Refreshing…' : 'Refresh intelligence'}</button>} />
    {query.isLoading && <section className="card card-pad intelligence-loading" data-testid="state-intelligence-loading">Preparing the latest household read…</section>}
    {query.isError && <section className="card card-pad intelligence-empty" data-testid="state-intelligence-error"><ShieldAlert size={18} /><div><strong>Intelligence is unavailable</strong><span>The underlying plan remains safe and unchanged. Try again when the household service is available.</span></div><button className="btn" onClick={() => { void query.refetch(); }}>Try again</button></section>}
    {snapshot && <>
      <section className="intelligence-brief-grid animate-in delay-1">
        <div className="intelligence-brief-card primary"><div className="eyebrow">Daily brief</div><div className="brief-value">{snapshot.dailyBrief.status}</div><p>Current posture across liquidity, risk, and the property pipeline.</p></div>
        <div className="intelligence-brief-card"><div className="mono-label">Safe to deploy</div><div className="brief-value">{displayMoney(snapshot.dailyBrief.safeToDeploy, '$0')}</div><p>Discretionary room after obligations and protected reserves.</p></div>
        <div className="intelligence-brief-card"><div className="mono-label">Emergency reserve</div><div className="brief-value">{snapshot.dailyBrief.emergencyReserveMonths.toFixed(1)} <small>months</small></div><p>Household buffer used by the readiness signal.</p></div>
        <div className="intelligence-brief-card"><div className="mono-label">Property pipeline</div><div className="brief-value">{snapshot.dailyBrief.propertyCandidates}</div><p>Candidate{snapshot.dailyBrief.propertyCandidates === 1 ? '' : 's'} available for comparison.</p></div>
      </section>
      <IntelligenceRecommendationCard snapshot={snapshot} onFeedback={onFeedback} />
      <section className="card card-pad page-section">
        <CardTitle title="Specialist analyst desk" subtitle="Each analyst owns a narrow view so strong signals do not hide weak ones." />
        <div className="analyst-grid">{snapshot.analysts.map((analyst) => <article className="analyst-card" key={analyst.id}><div className="analyst-card-header"><div><div className="mono-label">{analyst.scope.replaceAll('_', ' ')}</div><h3>{analyst.analyst}</h3></div><span className={`status ${analyst.dataQuality === 'low' ? 'critical' : analyst.dataQuality === 'medium' ? 'pending' : ''}`}>{analyst.dataQuality}</span></div><p>{analyst.summary}</p><ConfidenceLabel confidence={analyst.confidence} dataQuality={analyst.dataQuality} /><div className="analyst-evidence">{analyst.evidence.slice(0, 3).map((item) => <span key={item}>• {item}</span>)}</div></article>)}</div>
      </section>
      <div className="section-grid page-section">
        <section className="card card-pad">
          <CardTitle title="Persisted insights" subtitle="Advisory observations retained for the next review." />
          <div className="insight-list">{snapshot.insights.map((insight) => <div className="insight-row" key={insight.id}><div className={`insight-icon ${insight.severity === 'high' ? 'review' : insight.severity === 'medium' ? 'advisory' : 'positive'}`}><Lightbulb size={15} /></div><div><strong>{insight.title}</strong><p>{insight.description}</p><div className="insight-evidence">{insight.evidence.join(' · ')}</div></div><span className={`status ${insight.severity === 'high' ? 'critical' : insight.severity === 'medium' ? 'pending' : ''}`}>{insight.severity}</span></div>)}</div>
          {snapshot.insights.length === 0 && <div className="empty-state"><Lightbulb size={20} /><h3>No persisted insights yet</h3><p>Refresh intelligence after the next household update.</p></div>}
        </section>
        <section className="card card-pad">
          <CardTitle title="What-if contribution" subtitle="Plan pace only. This never changes the live allocation." />
          <form className="scenario-form" onSubmit={runScenario}><div className="field"><label>Proposed weekly duplex contribution</label><div className="scenario-input"><span>$</span><input inputMode="decimal" pattern="[0-9]+(\\.[0-9]{1,2})?" value={proposedWeekly} onChange={(event) => setProposedWeekly(event.target.value)} required data-testid="input-intelligence-scenario" /></div></div><button className="btn btn-primary" type="submit" disabled={scenario.isPending} data-testid="button-run-intelligence-scenario"><Sparkles size={14} /> {scenario.isPending ? 'Calculating…' : 'Compare pace'}</button></form>
          {scenarioResult && <div className="scenario-result" data-testid="card-intelligence-scenario-result"><div><strong>{scenarioResult.proposedWeeks === null ? 'No completion date' : `${scenarioResult.proposedWeeks} weeks`}</strong><span>at the proposed pace</span></div><div><strong>{scenarioResult.weeksEarlier === null ? '—' : `${scenarioResult.weeksEarlier} weeks`}</strong><span>earlier than current</span></div><p>{scenarioResult.productionDataChanged ? 'Production data changed.' : 'Planning-only result; production data was not changed.'}</p></div>}
        </section>
      </div>
      <section className="card card-pad page-section">
        <CardTitle title={snapshot.weeklyReport.title} subtitle={`Generated ${displayDate(snapshot.weeklyReport.generatedAt, 'today')}`} />
        <p className="report-summary">{snapshot.weeklyReport.summary}</p>
        <div className="report-sections">{snapshot.weeklyReport.sections.map((section) => <span key={section}><Check size={13} /> {section}</span>)}</div>
      </section>
      <section className="card card-pad page-section">
        <CardTitle title="Monthly Family Capital Review" subtitle="A slower, family-office-style read of the current tracked picture." />
        <div className="monthly-stat-grid">{[['Opening net worth', snapshot.monthlyReview.openingNetWorth], ['Closing net worth', snapshot.monthlyReview.closingNetWorth], ['Change', snapshot.monthlyReview.change], ['Income', snapshot.monthlyReview.income], ['Expenses', snapshot.monthlyReview.expenses], ['Savings', snapshot.monthlyReview.savings], ['Investments', snapshot.monthlyReview.investments]].map(([label, value]) => <div className="monthly-stat" key={label}><span>{label}</span><strong>{label === 'Change' && value.startsWith('$') ? value : label === 'Change' ? value : displayMoney(value, '$0')}</strong></div>)}</div>
        <div className="monthly-review-grid"><div><strong>Duplex progress</strong><span>{snapshot.monthlyReview.duplexProgress}</span></div><div><strong>Portfolio performance</strong><span>{snapshot.monthlyReview.portfolioPerformance}</span></div><div><strong>Property progress</strong><span>{snapshot.monthlyReview.propertyProgress}</span></div><div><strong>Risk review</strong><span>{snapshot.monthlyReview.riskReview}</span></div></div>
        <div className="monthly-review-lists"><div><strong>Top financial decisions</strong>{snapshot.monthlyReview.topFinancialDecisions.map((item) => <span key={item}>• {item}</span>)}</div><div><strong>Next-month priorities</strong>{snapshot.monthlyReview.nextMonthPriorities.map((item) => <span key={item}>• {item}</span>)}</div></div>
      </section>
    </>}
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

function MicroLivePage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const queryClient = useQueryClient();
  const household = useGetHousehold();
  const query = useGetMicroLive();
  const rehearsal = useRunMicroLiveRehearsal();
  const reconciliationRun = useRunMicroLiveReconciliation();
  const review = useReviewMicroLiveEnablement();
  const approveVenue = useApproveMicroLiveVenue();
  const armSession = useArmMicroLive();
  const incidentReview = useCreateMicroLiveIncidentReview();
  const completeRequirement = useCompleteMicroLiveReactivationRequirement();
  const snapshot = query.data as MicroLiveSnapshot | undefined;
  const isOwner = household.data?.role === 'owner';
  const [reviewingVenueId, setReviewingVenueId] = useState<string | null>(null);
  const [venueApprovalDraft, setVenueApprovalDraft] = useState<MicroLiveVenueApprovalRequest>({
    credentialsReference: '',
    jurisdictionConfirmed: false,
    termsReviewed: false,
    marketPermissions: [],
    withdrawalReviewed: false,
    withdrawalDisabled: true,
  });
  const [marketPermissionsText, setMarketPermissionsText] = useState('');
  const [armingVenueId, setArmingVenueId] = useState<string | null>(null);
  const [armingConfirmed, setArmingConfirmed] = useState(false);
  const [reviewingIncidentId, setReviewingIncidentId] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<MicroLiveIncidentReviewInput>({
    rootCause: '',
    capitalImpact: '0.00',
    safeguardsWorked: [],
    requiredFixes: [],
    reactivationRequirements: [],
    notes: '',
  });
  const [reviewText, setReviewText] = useState({ safeguardsWorked: '', requiredFixes: '', reactivationRequirements: '' });
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: getGetMicroLiveQueryKey() }); };
  const startVenueApproval = (venue: MicroLiveSnapshot['venues'][number]) => {
    setReviewingVenueId(venue.id);
    setVenueApprovalDraft({
      credentialsReference: '',
      jurisdictionConfirmed: venue.jurisdictionConfirmed,
      termsReviewed: venue.termsReviewed,
      marketPermissions: venue.marketPermissions,
      withdrawalReviewed: venue.withdrawalReviewed,
      withdrawalDisabled: venue.withdrawalDisabled,
    });
    setMarketPermissionsText(venue.marketPermissions.join(', '));
    setArmingVenueId(null);
  };
  const submitVenueApproval = async (event: FormEvent) => {
    event.preventDefault();
    if (!reviewingVenueId) return;
    const marketPermissions = marketPermissionsText.split(/[,\n]/).map((market) => market.trim()).filter(Boolean);
    try {
      await approveVenue.mutateAsync({
        venueId: reviewingVenueId,
        data: { ...venueApprovalDraft, marketPermissions },
      });
      await refresh();
      setReviewingVenueId(null);
      onFeedback('Venue approval review recorded. Live execution remains disabled.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The venue approval review could not be saved.');
    }
  };
  const startArming = (venueId: string) => {
    setArmingVenueId(venueId);
    setArmingConfirmed(false);
    setReviewingVenueId(null);
  };
  const submitArming = async (event: FormEvent) => {
    event.preventDefault();
    if (!armingVenueId || !armingConfirmed) return;
    try {
      const result = await armSession.mutateAsync({ data: { venueId: armingVenueId } });
      await refresh();
      setArmingVenueId(null);
      setArmingConfirmed(false);
      onFeedback(result.liveExecutionEnabled ? 'Session armed.' : 'Arming recorded without enabling live execution.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Human arming was blocked by the safety gates.');
    }
  };
  const startIncidentReview = (incidentId: string) => {
    setReviewingIncidentId(incidentId);
    setReviewDraft({ rootCause: '', capitalImpact: '0.00', safeguardsWorked: [], requiredFixes: [], reactivationRequirements: [], notes: '' });
    setReviewText({ safeguardsWorked: '', requiredFixes: '', reactivationRequirements: '' });
  };
  const submitIncidentReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!reviewingIncidentId) return;
    const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);
    const data: MicroLiveIncidentReviewInput = {
      ...reviewDraft,
      safeguardsWorked: lines(reviewText.safeguardsWorked),
      requiredFixes: lines(reviewText.requiredFixes),
      reactivationRequirements: lines(reviewText.reactivationRequirements),
    };
    try {
      await incidentReview.mutateAsync({ incidentId: reviewingIncidentId, data });
      await refresh();
      setReviewingIncidentId(null);
      onFeedback('Post-incident review saved. Human reactivation requirements remain open.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The incident review could not be saved.');
    }
  };
  if (query.isLoading) return <main className="content"><PageHeading eyebrow="Execution / Micro-Live" title="Controlled execution." description="Loading the fail-closed control plane." /><div className="card card-pad loading-card">Checking readiness, reconciliation, and Guardian health…</div></main>;
  if (query.isError || !snapshot) return <main className="content"><PageHeading eyebrow="Execution / Micro-Live" title="The monitor is unavailable." description="No execution state is shown until the control plane can be read safely." /><div className="card card-pad error-card"><ShieldAlert size={20} /><strong>Execution remains disabled.</strong><button className="btn" onClick={() => query.refetch()}>Try again</button></div></main>;
  const money = (value: string) => `$${Number(value).toFixed(2)}`;
  const latestRun = snapshot.reconciliationRuns[0];
  const openRequirements = snapshot.reactivationRequirements.filter((requirement) => requirement.status !== 'COMPLETE');
  return <main className="content">
    <PageHeading eyebrow="Execution / Micro-Live" title={<>Containment before <span className="accent-text">connectivity.</span></>} description="A small, reviewable control plane for future Micro-Live experiments. This workspace transmits no orders and cannot access household capital." actions={<button className="btn btn-primary" onClick={async () => { await rehearsal.mutateAsync(); await refresh(); onFeedback('Live rehearsal completed without transmitting an order.'); }} disabled={rehearsal.isPending}><RotateCcw size={14} /> {rehearsal.isPending ? 'Running…' : 'Run live rehearsal'}</button>} />
    <section className="micro-live-banner"><div className="micro-live-banner-icon"><Lock size={19} /></div><div><strong>Live execution is disabled</strong><span>Rehearsal mode only · credential values never displayed · no order transmission</span></div><span className="status review">DISABLED</span></section>
    <section className="micro-live-grid">
      <div className="card card-pad micro-live-status-card"><CardTitle title="Execution status" subtitle="Global fail-closed state" action={<Activity size={17} color="var(--blue)" />} /><div className="micro-live-status-value"><span className="status-pill">{snapshot.status}</span><strong>0</strong><small>open orders</small></div><div className="micro-live-stat-row"><span>Capital allocated</span><b>{money(snapshot.session.capitalAllocated)}</b></div><div className="micro-live-stat-row"><span>Current position</span><b>{snapshot.session.currentPosition}</b></div><div className="micro-live-stat-row"><span>Net P&amp;L</span><b>{money(snapshot.session.netPnl)}</b></div></div>
      <div className="card card-pad"><CardTitle title="Micro-Live sandbox" subtitle="Configurable policy · no leverage" action={<Gauge size={17} color="var(--green)" />} /><div className="micro-live-limit-grid"><div><span>Max venue</span><strong>{money(String(Number(snapshot.policy.limits.maxVenueCapitalCents ?? 1000) / 100))}</strong></div><div><span>Max strategy</span><strong>{money(String(Number(snapshot.policy.limits.maxStrategyCapitalCents ?? 1000) / 100))}</strong></div><div><span>Max order</span><strong>{money(String(Number(snapshot.policy.limits.maxIndividualOrderCents ?? 100) / 100))}</strong></div><div><span>Hard daily loss</span><strong>{money(String(Number(snapshot.policy.limits.hardDailyLossCents ?? 150) / 100))}</strong></div></div><div className="safety-inline"><CheckCircle2 size={15} /> Leverage, margin, borrowing, and auto-scale are off</div></div>
    </section>
    <section className="card card-pad page-section"><CardTitle title="Readiness gates" subtitle={`Live readiness ${snapshot.readiness.score}/100 · a high score never guarantees profitability`} action={<button className="btn" onClick={async () => { await review.mutateAsync(); onFeedback('Enablement review recorded. Live execution remains disabled.'); }} disabled={review.isPending}>{review.isPending ? 'Reviewing…' : 'Review gates'}</button>} /><div className="readiness-grid">{snapshot.readiness.checks.map((check) => <div className={`readiness-check ${check.passed ? 'passed' : 'blocked'}`} key={check.name}><span>{check.passed ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}</span><span>{check.name}</span><b>{check.passed ? 'Pass' : 'Blocked'}</b></div>)}</div></section>
    <section className="micro-live-columns">
      <div className="card card-pad"><CardTitle title="Venue approval review" subtitle="Review every boundary before a venue can be considered for Micro-Live" action={<Landmark size={17} color="var(--ink-soft)" />} /><div className="venue-review-list">{snapshot.venues.map((venue) => <article className="venue-review-card" key={venue.id}>
        <div className="venue-review-header"><div><strong>{venue.name}</strong><span>{venue.adapterType} · {venue.status}</span></div><span className={`status ${venue.approval.approved ? '' : 'review'}`}>{venue.approval.approved ? 'Approved' : 'Not approved'}</span></div>
        <div className="venue-facts"><div><span>Permitted markets</span><strong>{venue.marketPermissions.length ? venue.marketPermissions.join(' · ') : 'None recorded'}</strong></div><div><span>Withdrawals</span><strong>{venue.withdrawalDisabled ? 'Disabled' : 'Not disabled'}</strong></div><div><span>Credentials</span><strong>{venue.credentialsConfigured ? 'Configured · value hidden' : 'Not configured'}</strong></div><div><span>Health</span><strong>{venue.health}</strong></div></div>
        <div className="venue-checks">{venue.approval.checks.map((check) => <div className={`venue-check ${check.passed ? 'passed' : 'blocked'}`} key={check.name}><span>{check.passed ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}</span><span>{check.name}</span><b>{check.passed ? 'Pass' : 'Open'}</b></div>)}</div>
        <div className="safety-inline"><LockKeyhole size={15} /> Credential values are never displayed; only a server-side reference and the approval evidence are retained.</div>
        {isOwner && <div className="venue-operator-actions">
          <div className="operator-actions-row"><button className="btn" onClick={() => startVenueApproval(venue)} disabled={approveVenue.isPending}>Review approval</button>{venue.approval.approved && <button className="btn btn-primary" onClick={() => startArming(venue.id)} disabled={armSession.isPending}>Arm session</button>}</div>
          {reviewingVenueId === venue.id && <form className="venue-approval-form" onSubmit={submitVenueApproval}>
            <div className="operator-form-note"><ShieldCheck size={15} /><span>Owner review only. Enter a reference to credentials held by the server; never paste a key, token, or secret here.</span></div>
            <div className="field"><label>Server-side credential reference</label><input required value={venueApprovalDraft.credentialsReference} onChange={(event) => setVenueApprovalDraft({ ...venueApprovalDraft, credentialsReference: event.target.value })} placeholder="vault reference, not a credential value" /></div>
            <div className="field"><label>Permitted markets <span>(comma or line separated)</span></label><textarea required rows={2} value={marketPermissionsText} onChange={(event) => setMarketPermissionsText(event.target.value)} placeholder="spot" /></div>
            <div className="venue-review-toggles"><label><input type="checkbox" checked={venueApprovalDraft.jurisdictionConfirmed} onChange={(event) => setVenueApprovalDraft({ ...venueApprovalDraft, jurisdictionConfirmed: event.target.checked })} /> Jurisdiction and account eligibility confirmed</label><label><input type="checkbox" checked={venueApprovalDraft.termsReviewed} onChange={(event) => setVenueApprovalDraft({ ...venueApprovalDraft, termsReviewed: event.target.checked })} /> Venue terms reviewed</label><label><input type="checkbox" checked={venueApprovalDraft.withdrawalReviewed} onChange={(event) => setVenueApprovalDraft({ ...venueApprovalDraft, withdrawalReviewed: event.target.checked })} /> Withdrawal permissions reviewed</label><label><input type="checkbox" checked={venueApprovalDraft.withdrawalDisabled} onChange={(event) => setVenueApprovalDraft({ ...venueApprovalDraft, withdrawalDisabled: event.target.checked })} /> Withdrawals disabled for this execution account</label></div>
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setReviewingVenueId(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={approveVenue.isPending}><Check size={14} /> {approveVenue.isPending ? 'Saving…' : 'Submit approval review'}</button></div>
          </form>}
          {armingVenueId === venue.id && <form className="venue-arming-form" onSubmit={submitArming}>
            <div className="operator-form-note warning"><AlertTriangle size={15} /><span>This is a human arming request, not a readiness shortcut. The server will fail closed if any strategy, risk, venue, or reconciliation gate is open.</span></div>
            <label className="arming-confirmation"><input type="checkbox" checked={armingConfirmed} onChange={(event) => setArmingConfirmed(event.target.checked)} /> I explicitly confirm this venue and understand that any permitted session remains bounded, expires, and cannot access household or protected capital.</label>
            <div className="modal-actions"><button type="button" className="btn" onClick={() => setArmingVenueId(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!armingConfirmed || armSession.isPending}><ShieldCheck size={14} /> {armSession.isPending ? 'Checking gates…' : 'Confirm human arming'}</button></div>
          </form>}
        </div>}
      </article>)}</div></div>
      <div className="card card-pad"><CardTitle title="Independent Guardian" subtitle="Separate process boundary · authority is containment only" action={<ShieldCheck size={17} color="var(--green)" />} /><div className="guardian-state"><span className="status">{snapshot.guardian.status}</span><strong>{snapshot.guardian.decision}</strong><p>{snapshot.guardian.reason}. {snapshot.guardian.independentDeployment}</p></div><div className="safety-inline"><LockKeyhole size={15} /> Guardian cannot run strategies, increase capital, withdraw funds, or change risk rules.</div></div>
    </section>
     <section className="micro-live-columns page-section">
       <div className="card card-pad">
         <CardTitle title="Persistent reconciliation" subtitle={`Latest venue-authoritative run · ${latestRun ? new Date(latestRun.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not recorded'}`} action={<button className="btn" onClick={async () => { try { await reconciliationRun.mutateAsync(); await refresh(); onFeedback('Reconciliation run persisted. No order transmission occurred.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Reconciliation could not be recorded.'); } }} disabled={reconciliationRun.isPending}><RotateCcw size={13} /> {reconciliationRun.isPending ? 'Running…' : 'Run reconciliation'}</button>} />
         <div className="reconciliation-summary"><span className={`status ${snapshot.reconciliation.status === 'CLEAN' ? '' : 'critical'}`}>{snapshot.reconciliation.status}</span><strong>{snapshot.reconciliation.action}</strong><p>{snapshot.reconciliation.status === 'CLEAN' ? 'Internal OMS state matches the persisted venue snapshot. New exposure remains disabled by policy.' : 'Mismatch contained. New exposure is blocked until state is rebuilt and reviewed.'}</p></div>
         <div className="micro-live-history">{snapshot.reconciliationRuns.slice(0, 5).map((run) => <div className="micro-live-history-row" key={run.id}><div><strong>{run.status}</strong><span>{new Date(run.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div><span className="mono-label">{run.id.slice(0, 8)}</span></div>)}</div>
       </div>
       <div className="card card-pad">
         <CardTitle title="Position & fill snapshots" subtitle="Persisted evidence used for reconciliation" action={<Database size={17} color="var(--ink-soft)" />} />
         <div className="snapshot-facts"><div><span>Position snapshots</span><strong>{snapshot.positionSnapshots.length}</strong></div><div><span>Fill snapshots</span><strong>{snapshot.fillSnapshots.length}</strong></div><div><span>Last position</span><strong>{snapshot.positionSnapshots[0] ? new Date(snapshot.positionSnapshots[0].capturedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</strong></div><div><span>Last fill</span><strong>{snapshot.fillSnapshots[0] ? new Date(snapshot.fillSnapshots[0].capturedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'}</strong></div></div>
         <div className="micro-live-snapshot-list">{snapshot.positionSnapshots.slice(0, 4).map((position) => <div className="micro-live-list-row" key={position.id}><div><strong>{position.source} · {position.marketId}</strong><span>{position.quantity} units · {money(position.notional)} notional</span></div><span className="status">{position.source === 'VENUE' ? 'Authoritative' : 'Internal'}</span></div>)}{snapshot.positionSnapshots.length === 0 && <div className="micro-live-empty">No position snapshots recorded.</div>}</div>
         {snapshot.fillSnapshots.length === 0 && <div className="micro-live-empty">No fills recorded in rehearsal mode.</div>}
       </div>
     </section>
     <section className="card card-pad page-section">
       <CardTitle title="Open incidents" subtitle="Major and critical incidents remain open until a human review and every reactivation requirement are complete" action={<span className={`status ${snapshot.incidents.length ? 'critical' : ''}`}>{snapshot.incidents.length} open</span>} />
       {snapshot.incidents.length === 0 && <div className="micro-live-empty"><CheckCircle2 size={17} /><div><strong>No open incidents</strong><span>Reconciliation, Guardian, and rehearsal checks are currently contained.</span></div></div>}
       <div className="incident-list">{snapshot.incidents.map((incident) => <article className="incident-card" key={incident.id}><div className="incident-card-header"><div><span className={`status ${incident.severity === 'CRITICAL' ? 'critical' : 'pending'}`}>{incident.severity}</span><h3>{incident.title}</h3></div>{!incident.hasReview && <button className="btn btn-primary" onClick={() => startIncidentReview(incident.id)}>Record human review</button>}</div><p>{incident.timeline[0]}</p><div className="incident-meta"><span>{incident.incidentType.replaceAll('_', ' ')}</span><span>Capital impact {money(incident.capitalImpact)}</span><span>{incident.openRequirementCount} requirements open</span></div>{reviewingIncidentId === incident.id && <form className="incident-review-form" onSubmit={submitIncidentReview}><div className="field"><label>Root cause</label><textarea required rows={3} value={reviewDraft.rootCause} onChange={(event) => setReviewDraft({ ...reviewDraft, rootCause: event.target.value })} /></div><div className="field"><label>Capital impact</label><input required inputMode="decimal" pattern="-?[0-9]+(\\.[0-9]{1,2})?" value={reviewDraft.capitalImpact} onChange={(event) => setReviewDraft({ ...reviewDraft, capitalImpact: event.target.value })} /></div><div className="field"><label>Safeguards that worked <span>(one per line)</span></label><textarea rows={2} value={reviewText.safeguardsWorked} onChange={(event) => setReviewText({ ...reviewText, safeguardsWorked: event.target.value })} /></div><div className="field"><label>Required fixes <span>(one per line)</span></label><textarea required rows={2} value={reviewText.requiredFixes} onChange={(event) => setReviewText({ ...reviewText, requiredFixes: event.target.value })} /></div><div className="field"><label>Reactivation requirements <span>(one per line)</span></label><textarea required rows={3} value={reviewText.reactivationRequirements} onChange={(event) => setReviewText({ ...reviewText, reactivationRequirements: event.target.value })} /></div><div className="field"><label>Review notes <span>(optional)</span></label><textarea rows={2} value={reviewDraft.notes ?? ''} onChange={(event) => setReviewDraft({ ...reviewDraft, notes: event.target.value })} /></div><div className="modal-actions"><button type="button" className="btn" onClick={() => setReviewingIncidentId(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={incidentReview.isPending}><Check size={14} /> {incidentReview.isPending ? 'Saving…' : 'Save review'}</button></div></form>}</article>)}</div>
     </section>
     <section className="micro-live-columns page-section">
       <div className="card card-pad"><CardTitle title="Post-incident reviews" subtitle="A review records what happened without granting permission to trade" action={<ScrollText size={17} color="var(--ink-soft)" />} />{snapshot.incidentReviews.length === 0 && <div className="micro-live-empty">No post-incident reviews recorded.</div>}<div className="review-list">{snapshot.incidentReviews.map((item) => <div className="review-row" key={item.id}><div><strong>{item.rootCause}</strong><span>{new Date(item.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {item.requiredFixes.length} fixes recorded</span></div><span className="status review">Human review</span></div>)}</div></div>
       <div className="card card-pad"><CardTitle title="Human reactivation requirements" subtitle="Completing these records does not arm or enable live execution" action={<ShieldAlert size={17} color="var(--amber)" />} />{openRequirements.length === 0 && <div className="micro-live-empty"><CheckCircle2 size={17} /><div><strong>No open requirements</strong><span>Any future reactivation still requires a separate human arming review.</span></div></div>}<div className="requirement-list">{snapshot.reactivationRequirements.map((requirement) => <div className="requirement-row" key={requirement.id}><div><strong>{requirement.requirement}</strong><span className={`status ${requirement.status === 'COMPLETE' ? '' : 'pending'}`}>{requirement.status}</span></div>{requirement.status !== 'COMPLETE' && <button className="text-link" onClick={async () => { try { await completeRequirement.mutateAsync({ requirementId: requirement.id }); await refresh(); onFeedback('Reactivation requirement marked complete. Live execution remains disabled.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'The requirement could not be completed.'); } }} disabled={completeRequirement.isPending}>Mark complete</button>}</div>)}</div></div>
     </section>
    <section className="card card-pad page-section"><CardTitle title="Rehearsal timeline" subtitle="Production-shaped flow with no order transmission" action={<History size={17} color="var(--ink-soft)" />} /><div className="execution-timeline">{snapshot.rehearsal.sequence.map((event, index) => <div className="timeline-step" key={event}><span>{String(index + 1).padStart(2, '0')}</span><strong>{event.replaceAll(/([A-Z])/g, ' $1').trim()}</strong>{index < snapshot.rehearsal.sequence.length - 1 && <ChevronRight size={14} />}</div>)}</div><div className="rehearsal-note"><CheckCircle2 size={16} /> {snapshot.rehearsal.note}</div></section>
    <section className="card card-pad page-section"><CardTitle title="Protection summary" subtitle="The order of priorities remains containment, state accuracy, risk, reliability, execution, then return." /><div className="protection-grid">{[['Household capital', snapshot.safety.householdCapitalAccessible ? 'Accessible' : 'Inaccessible'], ['Protected capital', snapshot.safety.protectedCapitalAccessible ? 'Accessible' : 'Inaccessible'], ['AI order authority', snapshot.safety.aiCanPlaceOrders ? 'Allowed' : 'Not allowed'], ['Risk rule changes', snapshot.safety.aiCanChangeRisk ? 'Allowed' : 'Not allowed'], ['Auto scaling', snapshot.safety.autoScale ? 'Enabled' : 'Disabled'], ['Order transmission', snapshot.safety.liveOrderTransmissionEnabled ? 'Enabled' : 'Disabled']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
  </main>;
}

function ActionModal({ kind, close, onComplete }: { kind: Exclude<ModalKind, null>; close: () => void; onComplete: (kind: Exclude<ModalKind, null>, values: { amount?: number; name?: string; note?: string }) => void }) {
  const copy = {
    contribution: { title: 'Record a contribution', desc: 'Add a movement to your weekly capital rhythm.', submit: 'Save contribution' },
    transfer: { title: 'Move capital with purpose', desc: 'A transfer is just a change of job—not a change of plan.', submit: 'Save transfer' },
    strategy: { title: 'Make space for a strategy', desc: 'Prepare a note for the next useful conversation or review. This quick action is local-only.', submit: 'Prepare note' },
    property: { title: 'Add a property note', desc: 'Prepare a local note; no property record will be changed by this quick action.', submit: 'Prepare note' },
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
    <Route path="/bills" component={() => <BillsPage onFeedback={onFeedback} />} />
    <Route path="/upcoming-expenses" component={() => <UpcomingExpensesPage onFeedback={onFeedback} />} />
    <Route path="/income" component={() => <IncomePage onFeedback={onFeedback} />} />
    <Route path="/accounts" component={() => <AccountsPage onFeedback={onFeedback} />} />
    <Route path="/accounting" component={() => <AccountingPage onFeedback={onFeedback} />} />
    <Route path="/operations" component={() => <OperationsPage onFeedback={onFeedback} />} />
    <Route path="/business" component={() => <BusinessPage onFeedback={onFeedback} />} />
    <Route path="/goals" component={() => <GoalsPage onAction={onAction} />} />
    <Route path="/strategies" component={() => <StrategiesPage onFeedback={onFeedback} />} />
    <Route path="/micro-live" component={() => <MicroLivePage onFeedback={onFeedback} />} />
    <Route path="/treasury" component={() => <TreasuryPage onFeedback={onFeedback} />} />
    <Route path="/portfolio" component={() => <PortfolioPage onFeedback={onFeedback} />} />
    <Route path="/properties" component={() => <PropertiesPage onAction={onAction} />} />
    <Route path="/risk" component={() => <RiskPage onFeedback={onFeedback} />} />
    <Route path="/settings" component={() => <SettingsPage onFeedback={onFeedback} />} />
    <Route path="/transactions" component={() => <UtilityPage kind="transactions" onAction={onAction} transactions={transactions} />} />
    <Route path="/contributions" component={() => <UtilityPage kind="contributions" onAction={onAction} transactions={transactions} />} />
    <Route path="/reports" component={() => <UtilityPage kind="reports" onAction={onAction} transactions={transactions} />} />
    <Route path="/documents" component={() => <UtilityPage kind="documents" onAction={onAction} transactions={transactions} />} />
     <Route path="/insights" component={() => <IntelligencePage onFeedback={onFeedback} />} />
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
    return contributionsQuery.data.flatMap((item, index) => {
      const split = item.metadata?.split as Record<string, number | string> | undefined;
      const destinations: Array<[string, number | string | undefined]> = [
        ['Duplex Reserve', split?.duplex] as [string, number | string | undefined],
        ['Capital OS', split?.capital] as [string, number | string | undefined],
        ['Opportunity Reserve', split?.opportunity] as [string, number | string | undefined],
      ].filter(([, amount]) => Number(amount ?? 0) > 0);
      const rows: Array<[string, number | string]> = destinations.length
        ? destinations.map(([category, amount]) => [category, amount ?? 0])
        : [['Duplex Reserve', item.amount]];
      return rows.map(([category, amount], rowIndex) => ({
        id: index * 10 + rowIndex + 1,
        date: new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        name: 'Weekly allocation',
        category,
        amount: destinations.length ? Number(amount) / 100 : Number(amount),
        status: item.status === 'completed' ? 'Posted' : item.status,
      }));
    });
  }, [contributionsQuery.data, transactions]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timeout); }, [toast]);
  const notify = (message: string) => setToast(message);
  const complete = async (kind: Exclude<ModalKind, null>, values: { amount?: number; name?: string; note?: string }) => {
    const labels = { contribution: 'Contribution recorded', transfer: 'Transfer draft prepared', strategy: 'Strategy note prepared', property: 'Property note prepared' };
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
    if (kind !== 'contribution') {
      setModal(null);
      notify(`${labels[kind]} locally. Nothing was saved to the household service.`);
      return;
    }
    setModal(null); setToast(`${labels[kind]} · your plan is up to date.`);
  };
  return <TooltipProvider><RoutedErrorBoundary><AppShell onAction={setModal} onFeedback={notify} menuOpen={menuOpen} setMenuOpen={setMenuOpen}><AppRouter onAction={setModal} onFeedback={notify} transactions={apiTransactions} dashboard={dashboardQuery.data} backendIssue={dashboardQuery.isError} /></AppShell></RoutedErrorBoundary>{modal && <ActionModal kind={modal} close={() => setModal(null)} onComplete={complete} />}{toast && <div className="toast-note" role="status" data-testid="status-action-feedback">{toast}</div>}</TooltipProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /><Toaster /></WouterRouter>;
}

export default App;