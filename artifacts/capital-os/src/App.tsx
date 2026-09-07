import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
  useCreateManualFinanceTransaction,
  useImportFinancialAccountCsv,
  useGetBankingStatus,
  useListReadOnlyBankConnections,
  useCreateReadOnlyBankConnection,
  useLinkReadOnlyBankAccount,
  useSyncReadOnlyBankConnection,
  useRevokeReadOnlyBankConnection,
  useExportReadOnlyBankConnection,
  useDeleteReadOnlyBankConnectionData,
  getListReadOnlyBankConnectionsQueryKey,
  getExportReadOnlyBankConnectionQueryKey,
  useListTransactionReviewQueue,
  useReviewFinancialTransaction,
  getListTransactionReviewQueueQueryKey,
  useGetBudget,
  useGetBudgetPlanningPeriod,
  useCreateBudgetPlanningCategory,
  useUpdateBudgetPlanningCategory,
  useApproveBudgetPlanningPeriod,
  useReorderBudgetPlanningCategories,
  useCloseBudgetPlanningPeriod,
  useListBudgetPlanningHistory,
  useGetBudgetPlanningComparison,
  useGetBudgetPlanningCategoryContributionDetail,
  useGetBudgetPlanningChangeHistory,
  useGetWeeklyBudgetGuidance,
  useAcceptWeeklyBudgetGuidance,
  useUpdateWeeklyBudgetAllocations,
  getGetWeeklyBudgetGuidanceQueryKey,
  getGetBudgetPlanningChangeHistoryQueryKey,
  getGetBudgetPlanningPeriodQueryKey,
  getListBudgetPlanningHistoryQueryKey,
  getGetBudgetPlanningComparisonQueryKey,
  getGetBudgetPlanningCategoryContributionDetailQueryKey,
  type BudgetPlanningCategory,
  type BudgetPlanningPeriod,
  type BudgetPlanningComparison,
  type BudgetPlanningContributionDetail,
  type BudgetPlanningHistoryItem,
  type AuditEventSummary,
  type BudgetPlanningCategoryInputCategoryType,
  type BudgetPlanningCategoryInputEssentialStatus,
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
  useGetExecutionControl,
  requestExecutionStop,
  getGetExecutionControlQueryKey,
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
  type TransactionReviewInput,
  type BankConnection,
  type FinancialAccount,
  useGetTreasury,
  useGetFamilyOffice,
  useCreateFamilyOfficeResearch,
  useDecideFamilyOfficeProposal,
  useCreateShadowPortfolio,
  useCreateShadowIntent,
  getGetFamilyOfficeQueryKey,
  type FamilyOfficeProposalDecisionInputDecision,
  type ShadowIntentInputDirection,
} from '@workspace/api-client-react';
import { dashboardDataState } from './dashboard-state';
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
  MinusCircle,
  AlertCircle,
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
import { bankConnectionAccess } from '@/bank-connection-access';
import { useProviderProtectedAction } from '@/lib/reverification';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/hooks/use-toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import TreasuryPage from '@/pages/treasury';
import AccountingPage from '@/pages/accounting';
import OperationsPage from '@/pages/operations';
import BusinessPage from '@/pages/business';
import FinancingPage from '@/pages/financing';
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
  { href: '/financing', label: 'Financing', icon: CircleDollarSign },
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
  { href: '/family-office', label: 'Family Office', icon: Sparkles },
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
  const decideWithReverification = useProviderProtectedAction(async (value: 'approved' | 'rejected') =>
    decision.mutateAsync({
      recommendationId: recommendation.id,
      data: { decision: value, reason: value === 'approved' ? 'Accepted for human review.' : 'Rejected after household review.' },
    }),
  );
  const decide = async (value: 'approved' | 'rejected') => {
    try {
      await decideWithReverification(value);
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

function DashboardState({ state, onRetry, onAction }: { state: 'loading' | 'unavailable' | 'empty'; onRetry: () => void; onAction: (kind: Exclude<ModalKind, null>) => void }) {
  const copy = {
    loading: {
      title: 'Loading your household plan',
      message: 'Reading the latest household data. No balances or activity are shown until the server responds.',
    },
    unavailable: {
      title: 'Household data unavailable',
      message: 'The household service could not be reached. No balances, goals, allocations, or activity are being shown.',
    },
    empty: {
      title: 'Your household plan is ready to begin',
      message: 'No balances or planning activity have been recorded yet. Add verified household data to build this view.',
    },
  }[state];
  return <main className="content">
    <PageHeading eyebrow="Household overview" title={<>Your plan starts<br /><em>with real facts.</em></>} description="Capital OS only shows financial guidance after household data has been returned by the server." />
    <section className={`dashboard-data-state card card-pad ${state}`} data-testid={`dashboard-state-${state}`} role={state === 'unavailable' ? 'alert' : 'status'}>
      {state === 'loading' ? <div className="dashboard-state-spinner" aria-hidden="true" /> : state === 'unavailable' ? <ShieldAlert size={25} /> : <CircleDollarSign size={25} />}
      <h2>{copy.title}</h2>
      <p>{copy.message}</p>
      {state === 'loading' && <span className="dashboard-state-note">This page will update when the request finishes.</span>}
      {state === 'unavailable' && <button className="btn btn-primary" onClick={onRetry} data-testid="button-retry-dashboard"><RotateCcw size={14} /> Try again</button>}
      {state === 'empty' && <div className="dashboard-state-actions"><Link className="btn btn-secondary" href="/accounts">Open accounts</Link><button className="btn btn-primary" onClick={() => onAction('contribution')} data-testid="button-empty-dashboard-contribution"><Plus size={14} /> Record contribution</button></div>}
    </section>
  </main>;
}

function Dashboard({ onAction, onFeedback, transactions, dashboard, dashboardState, contributionsLoading, contributionsUnavailable, onRetry }: { onAction: (kind: Exclude<ModalKind, null>) => void; onFeedback: (message: string) => void; transactions: Transaction[]; dashboard?: DashboardSnapshot; dashboardState: 'loading' | 'unavailable' | 'empty' | 'ready'; contributionsLoading: boolean; contributionsUnavailable: boolean; onRetry: () => void }) {
  const monthTotal = transactions.reduce((sum, item) => sum + item.amount, 0);
  const goal = dashboard?.goal;
  const allocation = dashboard?.allocation;
  const portfolio = dashboard?.portfolio;
  const confidence = dashboard?.strategies[0]?.confidenceScore;
  if (dashboardState !== 'ready') {
    return <DashboardState state={dashboardState} onRetry={onRetry} onAction={onAction} />;
  }
  const movementState = contributionsLoading ? 'loading' : contributionsUnavailable ? 'unavailable' : transactions.length ? 'ready' : 'empty';
  return <main className="content">
    <PageHeading eyebrow="Household overview" title={<>Make room for the<br /><em>long view.</em></>} description="Review the household data and decisions that have been recorded." actions={<><button className="btn" data-testid="button-dashboard-export" onClick={() => onFeedback('Local-only preview: no server report was created.')}><ArrowDownLeft size={15} /> Export view</button><button className="btn btn-primary" data-testid="button-dashboard-contribution" onClick={() => onAction('contribution')}><Plus size={15} /> Record contribution</button></>} />
    <div className="dashboard-grid">
      <section className="hero-card card animate-in delay-1">
        <div className="eyebrow" style={{ color: '#58766a' }}>Primary goal / 01</div>
        <h2>{goal?.name ?? 'Primary household goal'}</h2>
        <p>Current progress is shown from the household plan returned by the server.</p>
        <div className="hero-stat"><div className="hero-stat-value" data-testid="text-goal-total">{displayMoney(goal?.currentAmount, '—')}</div><div className="hero-stat-label">of {displayMoney(goal?.targetAmount, '—')} target</div></div>
        <div className="hero-progress"><div className="hero-progress-meta"><span>{goal ? `${goal.progressPercent.toFixed(1)}% funded` : 'Funding not available'}</span><span>Target: {displayDate(goal?.targetDate, 'Not set')}</span></div><Progress value={goal?.progressPercent ?? 0} /></div>
      </section>
      <section className="card card-pad weekly-card animate-in delay-1">
        <CardTitle title="This week’s allocation" subtitle="Server-defined household rule" action={<button className="icon-btn" data-testid="button-allocation-menu" onClick={() => onFeedback('The current household allocation is server-defined.')}><MoreHorizontal size={16} /></button>} />
        <div className="weekly-amount" data-testid="text-weekly-total">{displayMoney(allocation?.totalWeekly, '—')} <span>/ week</span></div>
        <div className="allocation-list">
        {allocation && [['Duplex Reserve', displayMoney(allocation.duplexReserve, '—'), 'var(--color-protected)'], ['Capital OS', displayMoney(allocation.capitalOs, '—'), 'var(--color-primary)'], ['Opportunity Reserve', displayMoney(allocation.opportunityReserve, '—'), 'var(--color-opportunity)']].map(([name, value, color]) => <div className="allocation-row" key={name}><i className="allocation-dot" style={{ background: color }} /><span className="allocation-name">{name}</span><span className="allocation-value">{value}</span></div>)}
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
        <div className="state-value" data-testid="text-protected-capital">{displayMoney(portfolio?.protectedCapital, '—')}</div>
        <div className="state-caption">Protected capital is ring-fenced and unavailable to experimental strategies.</div>
      </section>
      <section className="capital-state-card active" data-testid="card-active-capital">
        <div className="state-icon"><CircleDollarSign size={17} /></div>
        <div className="state-label">Active Capital <span className="status" style={{ marginLeft: 6, background: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>Working</span></div>
        <div className="state-value" data-testid="text-active-capital">{displayMoney(portfolio?.activeCapital, '—')}</div>
        <div className="state-caption">Authorized for productive deployment while the duplex reserve stays protected.</div>
      </section>
      <section className="capital-state-card confidence" data-testid="card-confidence-score">
        <div className="state-icon"><Gauge size={17} /></div>
        <div className="state-label">Capital Confidence <span className="info-note" title="Confidence reflects historical evidence, execution quality, system health, and risk controls. It is not a guarantee of future returns.">i</span></div>
        <div className="confidence-score"><strong>{confidence === undefined ? '—' : `${confidence.toFixed(0)} / 100`}</strong><span>{confidence === undefined ? 'Not available' : 'Server-derived confidence'}</span></div>
        <div className="state-caption">Confidence reflects evidence, execution quality, system health, and risk controls. Not a guarantee of future returns.</div>
      </section>
    </div>
    <div className="section-grid">
      <section className="card card-pad animate-in delay-3">
        <CardTitle title="Capital trajectory" subtitle="Historical capital movement from the household ledger" />
        <div className="dashboard-placeholder" data-testid="empty-capital-trajectory"><BarChart3 size={22} /><strong>Capital history is not available yet</strong><span>The dashboard will show a trajectory after historical ledger data is returned.</span></div>
      </section>
      <section className="card card-pad animate-in delay-3">
        <CardTitle title="Recent movement" subtitle={movementState === 'ready' ? `${monthTotal.toLocaleString()} moved in loaded contributions` : movementState === 'loading' ? 'Loading contribution history' : movementState === 'unavailable' ? 'Contribution history unavailable' : 'No recorded contributions'} action={<Link href="/transactions" className="mono-label" data-testid="link-view-transactions">View all <ArrowUpRight size={12} style={{ verticalAlign: 'middle' }} /></Link>} />
        {movementState === 'ready' && <div className="activity-list">{transactions.slice(0, 3).map((item) => <div className="activity-item" key={item.id}><div className="activity-icon"><ArrowDownLeft /></div><div className="activity-copy"><strong>{item.name}</strong><span>{item.date} · {item.category}</span></div><div className="activity-amount">+${item.amount}</div></div>)}</div>}
        {movementState === 'loading' && <div className="dashboard-inline-state">Loading contribution history…</div>}
        {movementState === 'unavailable' && <div className="dashboard-inline-state" role="alert">No contribution rows are shown because the household history could not be loaded.</div>}
        {movementState === 'empty' && <div className="dashboard-inline-state">No contributions have been recorded for this household.</div>}
      </section>
    </div>
    <section className="card card-pad page-section">
      <CardTitle title="Capital balances" subtitle="Balances recorded for this household." action={<Link href="/goals" className="btn" data-testid="link-view-goals">Open goals <ChevronRight size={14} /></Link>} />
      <div>{(portfolio?.composition ?? []).map((item, index) => <div className="goal-row" key={item.label}><div><div className="goal-label"><i style={{ background: index === 0 ? 'var(--color-protected)' : index === 1 ? 'var(--color-opportunity)' : 'var(--color-primary)' }} />{item.label}</div><div className="goal-meta">{displayMoney(item.amount, '—')} current balance</div></div><div className="goal-progress"><b style={{ width: `${item.percent}%`, background: index === 0 ? 'var(--color-protected)' : index === 1 ? 'var(--color-opportunity)' : 'var(--color-primary)' }} /></div><div className="goal-pct">{item.percent.toFixed(1)}%</div></div>)}</div>
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
  const executionControl = useGetExecutionControl();
  const [stopping, setStopping] = useState(false);
  const stopWithReverification = useProviderProtectedAction(() =>
    requestExecutionStop(
      { reason: 'Emergency stop confirmed by household operator' },
      { headers: { 'Idempotency-Key': `web-emergency-stop-${crypto.randomUUID()}` } },
    ),
  );
  const confirmEmergencyStop = async () => {
    setStopping(true);
    try {
      const result = await stopWithReverification();
      await queryClient.invalidateQueries({ queryKey: getGetExecutionControlQueryKey() });
      setEmergencyOpen(false);
      setComfortable(false);
      onFeedback(`Emergency stop confirmed by the server. Execution state: ${result.state}.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The server could not confirm the emergency stop.');
    } finally {
      setStopping(false);
    }
  };
  return <main className="content">
    <PageHeading eyebrow="Plan / risk & readiness" title={<>Protect the plan<br /><em>you can explain.</em></>} description="Risk is a set of understandable safeguards. Review them before they need to do any work." actions={<><button className="btn" data-testid="button-risk-review" onClick={() => setComfortable(!comfortable)}><RotateCcw size={15} /> Re-run review</button><button className="btn emergency-btn" data-testid="button-emergency-stop" onClick={() => setEmergencyOpen(true)}><ShieldAlert size={15} /> Emergency stop</button></>} />
    <section className="card card-pad animate-in delay-1"><CardTitle title="Server execution control" subtitle="The database-backed state is authoritative across reloads, sessions, and API restarts." action={<span className={`status ${executionControl.data?.state === 'STOP' ? 'blocked' : 'review'}`} data-testid="status-execution-control">{executionControl.isLoading ? 'Checking…' : executionControl.data?.state ?? 'Unavailable'}</span>} /><p className="finance-note"><ShieldCheck size={16} /> {executionControl.data?.state === 'STOP' ? 'New order intents are stopped by the server.' : executionControl.isError ? 'The control plane could not be read safely; execution remains denied.' : 'No browser-local state can override the server control plane.'}</p></section>
    <section className="card card-pad animate-in delay-1"><CardTitle title="Readiness posture" subtitle={comfortable ? 'Your plan has a comfortable margin today.' : 'Review in progress — compare this with your household budget.'} action={<span className={`status ${comfortable ? '' : 'pending'}`} data-testid="status-risk-posture">{comfortable ? 'Comfortable' : 'Reviewing'}</span>} /><div style={{ maxWidth:780 }}><div className="risk-meter"><span className="risk-marker" style={{ left: comfortable ? '37%' : '57%' }} /></div><div className="risk-scale"><span>Protected</span><span>Balanced</span><span>Stretched</span></div></div><div className="stat-strip" style={{ marginTop:28, marginLeft:-22, marginRight:-22, borderTop:'1px solid var(--line)' }}>{[['8.4 mo', 'cash runway', 'Above your 6 mo floor'], ['63%', 'largest sleeve', 'Concentration to watch'], ['0', 'high flags', 'No action needed now']].map(([value, label, detail]) => <div className="stat-cell" key={label}><div className="mono-label">{label}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>)}</div></section>
    <section className="card card-pad page-section animate-in delay-2"><CardTitle title="Risk Governor safeguards" subtitle="Capital OS watches these boundaries so you do not have to watch a market screen." /><div className="safeguard-grid" data-testid="risk-safeguards">{[['Protected Capital Lock', 'Ring-fenced reserve cannot be allocated to experimental strategies.', LockKeyhole], ['Max Active Capital', 'Active capital stays within the approved household ceiling.', ShieldCheck], ['Reconciliation Health', 'All recent movements match the planned allocation.', Check], ['Strategy Exposure', 'No single strategy can quietly become the whole plan.', SlidersHorizontal], ['Venue Health', 'Connected accounts are reporting normally.', Landmark], ['Market Data Health', 'Reference data is current for the next review.', Gauge]].map(([title, desc, Icon]) => <div className="safeguard" key={title as string}><Icon size={16} /><div><strong>{title as string}</strong><span>{desc as string}</span></div><span className="status" style={{ marginLeft:'auto', flex:'0 0 auto' }}>Healthy</span></div>)}</div></section>
    <div className="section-grid">
      <section className="card card-pad page-section"><CardTitle title="The three questions" subtitle="A practical review, not a prediction." />{[['Could the household keep contributing?', 'Yes · the weekly plan is 4.8% of take-home income.', ShieldCheck], ['Could we pause without losing the thread?', 'Yes · the reserve is already separated by purpose.', LockKeyhole], ['Could we say no to the wrong property?', 'Yes · your opportunity reserve protects that choice.', Home]].map(([title, desc, Icon]) => <div className="activity-item" key={title as string}><div className="activity-icon"><Icon size={14} /></div><div className="activity-copy"><strong>{title as string}</strong><span>{desc as string}</span></div><Check size={16} color="var(--ink)" /></div>)}</section>
      <section className="card card-pad page-section"><CardTitle title="Watch next" subtitle="Low drama, high usefulness." />{['Confirm insurance estimate in Q4', 'Review beneficiaries before year end', 'Revisit purchase window in January'].map((item, index) => <div className="setting-row" key={item}><div><strong>{item}</strong><p>{['Due 15 Nov', 'Due 31 Dec', 'Due 06 Jan'][index]}</p></div><ChevronRight size={15} color="var(--ink-soft)" /></div>)}</section>
     </div>
     {emergencyOpen && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="emergency-title"><div className="modal-header"><div><div className="eyebrow" style={{ color:'var(--color-critical)' }}>Critical action / confirmation required</div><h2 id="emergency-title">Stop new activity?</h2><p>This sends a server-authoritative STOP command. It persists beyond this browser session and denies new order intents before they reach the OMS.</p></div><button className="icon-btn" aria-label="Close emergency confirmation" data-testid="button-close-emergency-modal" onClick={() => setEmergencyOpen(false)} disabled={stopping}><X size={17} /></button></div><div className="modal-actions"><button className="btn" data-testid="button-cancel-emergency-stop" onClick={() => setEmergencyOpen(false)} disabled={stopping}>Keep system running</button><button className="btn emergency-btn" data-testid="button-confirm-emergency-stop" onClick={() => { void confirmEmergencyStop(); }} disabled={stopping}><ShieldAlert size={14} /> {stopping ? 'Confirming…' : 'Confirm server stop'}</button></div></div></div>}
  </main>;
}

function SettingsPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const [settings, setSettings] = useState({ weekly: true, reminders: true, insights: false });
  const household = useGetHousehold();
  const updatePrivacy = useUpdatePrivacySettings();
  const [privacy, setPrivacy] = useState({ financeDataPrivate: true, shareHealthSummary: false });
  const updatePrivacyWithReverification = useProviderProtectedAction((data: typeof privacy) =>
    updatePrivacy.mutateAsync({ data }),
  );
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
      await updatePrivacyWithReverification(next);
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

function FinanceMetric({ label, value, detail, tone = '', action }: { label: string; value: string; detail: string; tone?: string; action?: ReactNode }) {
  return <div className={`metric-card ${tone}`}><div className="mono-label">{label}</div><div className="metric-value">{value}</div><div className="metric-detail">{detail}</div>{action && <div className="metric-action">{action}</div>}</div>;
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

function CategoryForm({ period, category, onClose, onSuccess, onError }: {
  period: BudgetPlanningPeriod,
  category?: BudgetPlanningCategory,
  onClose: () => void,
  onSuccess: () => void,
  onError: (err: unknown) => void
}) {
  const createMutation = useCreateBudgetPlanningCategory();
  const updateMutation = useUpdateBudgetPlanningCategory();
  const [form, setForm] = useState({
    name: category?.name || '',
    categoryType: (category?.categoryType as BudgetPlanningCategoryInputCategoryType) || 'variable_essential',
    essentialStatus: (category?.essentialStatus as BudgetPlanningCategoryInputEssentialStatus) || 'mixed',
    monthlyTarget: category?.monthlyTarget || '',
    warningThreshold: category?.warningThreshold ? String(Number(category.warningThreshold) * 100) : '',
    notes: category?.notes || '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const parsedWarning = form.warningThreshold ? String(Number(form.warningThreshold) / 100) : undefined;

    try {
      if (category) {
        await updateMutation.mutateAsync({
          periodId: period.id,
          categoryId: category.id,
          data: {
            version: period.version,
            ...form,
            warningThreshold: parsedWarning
          }
        });
      } else {
        await createMutation.mutateAsync({
          periodId: period.id,
          data: {
            version: period.version,
            ...form,
            warningThreshold: parsedWarning
          }
        });
      }
      onSuccess();
    } catch (err) {
      onError(err);
      setIsSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!category || !confirm('Archive this category?')) return;
    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        periodId: period.id,
        categoryId: category.id,
        data: { version: period.version, archived: true }
      });
      onSuccess();
    } catch (err) {
      onError(err);
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="account-form card-pad">
      <div className="field">
        <label htmlFor="category-name">Name</label>
        <input id="category-name" required maxLength={160} value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
      </div>
      <div className="field">
        <label htmlFor="category-type">Type</label>
        <select id="category-type" required value={form.categoryType} onChange={e => setForm({...form, categoryType: e.target.value as BudgetPlanningCategoryInputCategoryType})}>
           <option value="fixed_expense">Fixed Expense</option>
           <option value="variable_essential">Variable Essential</option>
           <option value="variable_discretionary">Variable Discretionary</option>
           <option value="savings">Savings</option>
           <option value="investment">Investment</option>
           <option value="debt_payment">Debt Payment</option>
           <option value="transfer">Transfer</option>
           <option value="income">Income</option>
           <option value="one_time_expense">One Time Expense</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="category-essential">Essential Status</label>
        <select id="category-essential" required value={form.essentialStatus} onChange={e => setForm({...form, essentialStatus: e.target.value as BudgetPlanningCategoryInputEssentialStatus})}>
           <option value="essential">Essential</option>
           <option value="discretionary">Discretionary</option>
           <option value="mixed">Mixed</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="category-monthly-target">Monthly Target</label>
        <input id="category-monthly-target" required type="number" inputMode="decimal" step="0.01" min="0" value={form.monthlyTarget} onChange={e => setForm({...form, monthlyTarget: e.target.value})} />
      </div>
      <div className="field">
        <label htmlFor="category-warning">Warning Threshold % <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
        <input id="category-warning" type="number" inputMode="decimal" step="1" min="1" value={form.warningThreshold} onChange={e => setForm({...form, warningThreshold: e.target.value})} placeholder="e.g. 105" />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label htmlFor="category-notes">Notes <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label>
        <textarea id="category-notes" maxLength={2000} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} style={{ minHeight: '60px', resize: 'vertical' }} />
      </div>
      <div className="modal-actions" style={{ gridColumn: '1 / -1', justifyContent: 'space-between', display: 'flex' }}>
        {category ? (
           <button type="button" className="btn btn-secondary text-critical" onClick={handleArchive} disabled={isSubmitting}>Archive</button>
        ) : <div />}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>Save</button>
        </div>
      </div>
    </form>
  );
}

function ContributionDetailView({ periodId, categoryId, onClose }: { periodId: string; categoryId: string; onClose: () => void }) {
  const query = useGetBudgetPlanningCategoryContributionDetail(periodId, categoryId, {
    query: { enabled: true, queryKey: getGetBudgetPlanningCategoryContributionDetailQueryKey(periodId, categoryId) }
  });

  if (query.isLoading) return <div className="card-pad"><div className="skeleton budget-skeleton-table" /></div>;
  if (query.isError) return <div className="card-pad"><div className="form-feedback error">Could not load details.</div></div>;
  if (!query.data) return null;

  const { includedActual, includedReviewedHouseholdTransactions, exclusions } = query.data;

  return (
    <div className="card-pad">
       <div className="finance-grid planning-contributions-grid">
          <div className="metric-card blue">
             <span className="metric-detail">Included Actuals ({includedReviewedHouseholdTransactions.length} rows)</span>
             <div className="metric-value">{displayMoney(includedActual, '$0')}</div>
          </div>
          <div className="metric-card amber">
             <span className="metric-detail">Excluded Items</span>
             <div className="metric-value">{exclusions.uncategorized + exclusions.excluded + exclusions.business + exclusions.transfers + exclusions.unreviewed}</div>
          </div>
       </div>

       <div className="planning-contributions-exclusions">
          <span>Uncategorized: {exclusions.uncategorized}</span>
          <span>Excluded: {exclusions.excluded}</span>
          <span>Business: {exclusions.business}</span>
          <span>Transfers: {exclusions.transfers}</span>
          <span>Unreviewed: {exclusions.unreviewed}</span>
       </div>

       <div className="finance-table planning-contributions-table">
          {includedReviewedHouseholdTransactions.length === 0 ? (
             <div className="finance-empty-state">No reviewed transactions included.</div>
          ) : includedReviewedHouseholdTransactions.map(tx => (
             <div key={tx.id} className="finance-row">
                <div>
                   <strong>{tx.merchant || tx.description}</strong>
                   <span>{tx.transactionDate.slice(0, 10)}</span>
                </div>
                <div className="finance-bar planning-contributions-bar" />
                <div className="finance-amount">
                   <strong>{displayMoney(tx.amount, '$0')}</strong>
                </div>
                <div />
             </div>
          ))}
       </div>

       <div className="modal-actions planning-contributions-actions">
          <button className="btn btn-secondary" onClick={onClose}>Close Details</button>
       </div>
    </div>
  );
}

function BudgetPlanningControlCenter() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const requestedMonth = new URLSearchParams(window.location.search).get('month');
    if (requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) return requestedMonth;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const historyQuery = useListBudgetPlanningHistory();
  const periodQuery = useGetBudgetPlanningPeriod(selectedMonth, {
    query: { retry: false, queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) }
  });
  const comparisonQuery = useGetBudgetPlanningComparison(selectedMonth, {
    query: { retry: false, queryKey: getGetBudgetPlanningComparisonQueryKey(selectedMonth) }
  });

  const monthOptions = useMemo(() => {
    const options = new Set<string>();
    const d = new Date();
    for (let i = -12; i <= 12; i++) {
      const temp = new Date(d.getFullYear(), d.getMonth() + i, 1);
      options.add(`${temp.getFullYear()}-${String(temp.getMonth() + 1).padStart(2, '0')}`);
    }
    if (historyQuery.data) {
      historyQuery.data.forEach(h => options.add(h.month));
    }
    return Array.from(options).sort().reverse();
  }, [historyQuery.data]);

  const idempotencyKeys = useRef({
    approve: crypto.randomUUID(),
    close: crypto.randomUUID(),
    guidance: crypto.randomUUID(),
  });

  const reorderCategories = useReorderBudgetPlanningCategories();
  const approvePeriod = useApproveBudgetPlanningPeriod({ request: { headers: { 'Idempotency-Key': idempotencyKeys.current.approve } } });
  const closePeriod = useCloseBudgetPlanningPeriod({ request: { headers: { 'Idempotency-Key': idempotencyKeys.current.close } } });
  const acceptGuidance = useAcceptWeeklyBudgetGuidance({ request: { headers: { 'Idempotency-Key': idempotencyKeys.current.guidance } } });
  const updateAllocations = useUpdateWeeklyBudgetAllocations();
  const [allocationPercentages, setAllocationPercentages] = useState<Record<string, string>>({});
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const activeCategories = periodQuery.data ? periodQuery.data.categories.filter(c => !c.archived).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const archivedCategories = periodQuery.data ? periodQuery.data.categories.filter(c => c.archived).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const allocatingCategories = activeCategories.filter(category => !['income', 'transfer'].includes(category.categoryType));

  const changeHistoryQuery = useGetBudgetPlanningChangeHistory(periodQuery.data?.id ?? '', {
    query: { enabled: !!periodQuery.data?.id, queryKey: periodQuery.data?.id ? getGetBudgetPlanningChangeHistoryQueryKey(periodQuery.data.id) : ['/api/budget-planning-change-history'] }
  });

  const guidanceQuery = useGetWeeklyBudgetGuidance(periodQuery.data?.id ?? '', {
    query: { enabled: !!periodQuery.data?.id, queryKey: periodQuery.data?.id ? getGetWeeklyBudgetGuidanceQueryKey(periodQuery.data.id) : ['/api/guidance-placeholder'], retry: false, refetchOnMount: 'always' }
  });
  useEffect(() => {
    if (!periodQuery.data) return;
    setAllocationPercentages(Object.fromEntries(
      periodQuery.data.categories
        .filter(category => !category.archived && !['income', 'transfer'].includes(category.categoryType))
        .map(category => [category.id, category.allocationBasisPoints === null ? '' : (category.allocationBasisPoints / 100).toFixed(2)])
    ));
    setAllocationError(null);
  }, [periodQuery.data?.id, periodQuery.data?.version]);
  const allocationBasisPoints = allocatingCategories.map(category => {
    const value = allocationPercentages[category.id] ?? '';
    return /^\d+(?:\.\d{1,2})?$/.test(value) ? Math.round(Number(value) * 100) : null;
  });
  const allocationTotalBasisPoints = allocationBasisPoints.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const allocationTemplateValid = allocatingCategories.length > 0
    && allocationBasisPoints.every((value): value is number => value !== null && value >= 0 && value <= 10000)
    && allocationTotalBasisPoints === 10000;
  const persistedAllocationTotal = allocatingCategories.reduce((sum, category) => sum + (category.allocationBasisPoints ?? 0), 0);
  const persistedAllocationTemplateValid = allocatingCategories.length > 0
    && allocatingCategories.every(category => Number.isInteger(category.allocationBasisPoints) && category.allocationBasisPoints! >= 0 && category.allocationBasisPoints! <= 10000)
    && persistedAllocationTotal === 10000;

  const submitApprove = useProviderProtectedAction(async (periodId: string, version: number) => {
    return approvePeriod.mutateAsync({ periodId, data: { version } });
  });
  const submitClose = useProviderProtectedAction(async (periodId: string, version: number) => {
    return closePeriod.mutateAsync({ periodId, data: { version } });
  });

  const handleMutationError = (error: unknown, action: string) => {
    const errObj = error as Record<string, unknown>;
    const isConflict = errObj?.status === 409 || JSON.stringify(error).includes('409');
    if (isConflict) {
      toast({
        variant: 'destructive',
        title: 'Version Conflict',
        description: 'This plan was modified elsewhere. Refreshing...',
      });
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) });
    } else {
      toast({
        variant: 'destructive',
        title: `${action} failed`,
        description: error instanceof Error ? error.message : 'Unexpected error',
      });
    }
  };

  const handleApprove = async (period: BudgetPlanningPeriod) => {
    if (!persistedAllocationTemplateValid) {
      toast({ variant: 'destructive', title: 'Allocation template incomplete', description: 'Save every allocating category with a total of exactly 100.00% before approving this plan.' });
      return;
    }
    if (!confirm('Approve this plan? It will become immutable.')) return;
    try {
      await submitApprove(period.id, period.version);
      idempotencyKeys.current.approve = crypto.randomUUID();
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) });
      queryClient.invalidateQueries({ queryKey: getListBudgetPlanningHistoryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningComparisonQueryKey(selectedMonth) });
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningChangeHistoryQueryKey(period.id) });
      queryClient.invalidateQueries({ queryKey: ['/api/budget'] });
      queryClient.invalidateQueries({ queryKey: ['/api/safe-to-deploy'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cash-flow'] });
      toast({ title: 'Plan approved' });
    } catch (err: unknown) {
      handleMutationError(err, 'Approval');
    }
  };

  const handleClose = async (period: BudgetPlanningPeriod) => {
    if (!confirm('Close this plan?')) return;
    try {
      await submitClose(period.id, period.version);
      idempotencyKeys.current.close = crypto.randomUUID();
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) });
      queryClient.invalidateQueries({ queryKey: getListBudgetPlanningHistoryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningComparisonQueryKey(selectedMonth) });
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningChangeHistoryQueryKey(period.id) });
      toast({ title: 'Plan closed' });
    } catch (err: unknown) {
      handleMutationError(err, 'Close');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (!periodQuery.data) return;
    const period = periodQuery.data;
    const categories = [...activeCategories];

    if (direction === 'up' && index > 0) {
      const temp = categories[index];
      categories[index] = categories[index - 1];
      categories[index - 1] = temp;
    } else if (direction === 'down' && index < categories.length - 1) {
      const temp = categories[index];
      categories[index] = categories[index + 1];
      categories[index + 1] = temp;
    } else return;

    // Request must include EVERY category ID exactly once (active first, then archived appended).
    const categoryIds = [...categories.map(c => c.id), ...archivedCategories.map(c => c.id)];

    try {
      await reorderCategories.mutateAsync({ periodId: period.id, data: { version: period.version, categoryIds } });
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) });
      if (period.id) {
         queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningChangeHistoryQueryKey(period.id) });
      }
    } catch (err: unknown) {
      handleMutationError(err, 'Reorder');
    }
  };

  const handleAcceptGuidance = async (periodId: string, version: number, categoryIds: string[], fingerprint: string) => {
    try {
      await acceptGuidance.mutateAsync({
        periodId,
        data: { version, categoryIds, recommendationFingerprint: fingerprint }
      });
      idempotencyKeys.current.guidance = crypto.randomUUID();
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) });
      queryClient.invalidateQueries({ queryKey: getGetWeeklyBudgetGuidanceQueryKey(periodId) });
      queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningChangeHistoryQueryKey(periodId) });
      toast({ title: 'Guidance accepted' });
    } catch (err: unknown) {
      handleMutationError(err, 'Accept Guidance');
    }
  };

  const handleSaveAllocations = async () => {
    const period = periodQuery.data;
    if (!period || period.status !== 'draft') return;
    if (!allocationTemplateValid) {
      setAllocationError('Enter every allocating category to no more than two decimal places and make the total exactly 100.00%.');
      return;
    }
    try {
      await updateAllocations.mutateAsync({
        periodId: period.id,
        data: {
          version: period.version,
          allocations: allocatingCategories.map((category, index) => ({ categoryId: category.id, basisPoints: allocationBasisPoints[index]! })),
        },
      });
      setAllocationError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) }),
        queryClient.invalidateQueries({ queryKey: getGetWeeklyBudgetGuidanceQueryKey(period.id) }),
        queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningChangeHistoryQueryKey(period.id) }),
      ]);
      toast({ title: 'Weekly allocations saved', description: 'The draft template totals exactly 100.00%.' });
    } catch (error) {
      setAllocationError(error instanceof Error ? error.message : 'The allocation template could not be saved.');
      handleMutationError(error, 'Save allocations');
    }
  };

  const [editingCategory, setEditingCategory] = useState<BudgetPlanningCategory | 'new' | null>(null);
  const [detailCategory, setDetailCategory] = useState<BudgetPlanningCategory | null>(null);

  const format = (v: string) => displayMoney(v, '$0');

  const formatMonth = (monthString: string) => {
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <section className="card card-pad page-section animate-in delay-2" style={{ marginTop: '24px' }}>
      <div className="planning-header">
        <div>
          <CardTitle title="Planning Control Center" subtitle="Draft, approve, and compare monthly periods." />
        </div>
        <div className="planning-month-selector">
          <CalendarDays size={16} className="text-secondary" />
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} aria-label="Select planning month">
            {monthOptions.map(m => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
        </div>
      </div>

      {comparisonQuery.isSuccess && comparisonQuery.data && (
        <div className="finance-grid planning-comparison-grid">
          <div className="metric-card blue">
            <span className="metric-detail">Month Budgeted</span>
            <div className="metric-value">{displayMoney(comparisonQuery.data.monthBudgeted, '$0')}</div>
          </div>
          <div className="metric-card lavender">
            <span className="metric-detail">Quarter Budgeted</span>
            <div className="metric-value">{displayMoney(comparisonQuery.data.quarterBudgeted, '$0')}</div>
          </div>
          <div className="metric-card green">
            <span className="metric-detail">Year Budgeted</span>
            <div className="metric-value">{displayMoney(comparisonQuery.data.yearBudgeted, '$0')}</div>
          </div>
          <div className="metric-card amber">
            <span className="metric-detail">Approved Periods</span>
            <div className="metric-value">{comparisonQuery.data.approvedPeriodCount}</div>
          </div>
        </div>
      )}

      {periodQuery.isLoading ? (
        <div className="budget-skeleton" aria-hidden="true"><div className="skeleton budget-skeleton-table" /></div>
      ) : periodQuery.isError ? (
        <div className="finance-empty-state" role="alert">
           <strong>No plan found for {selectedMonth}</strong>
           <span>Select a different month or ensure the service is available.</span>
           <button className="btn btn-secondary" onClick={() => void periodQuery.refetch()}>Try again</button>
        </div>
      ) : periodQuery.data && (
        <div className="planning-period-content">
           <div className="planning-actions-bar">
             <div className="planning-status-badge">
                <span className={`status ${periodQuery.data.status === 'draft' ? 'review' : periodQuery.data.status === 'approved' ? 'pending' : 'success'}`}>
                  {periodQuery.data.status.toUpperCase()} PLAN
                </span>
             </div>
             <div className="planning-actions">
                {periodQuery.data.status === 'draft' && (
                  <>
                    <button onClick={() => setEditingCategory('new')} className="btn btn-secondary btn-sm"><Plus size={14} /> Category</button>
                     <button onClick={() => handleApprove(periodQuery.data)} disabled={approvePeriod.isPending || !persistedAllocationTemplateValid} title={persistedAllocationTemplateValid ? 'Approve this plan' : 'Save a complete 100.00% allocation template before approval'} className="btn btn-primary btn-sm"><Check size={14} /> Approve</button>
                  </>
                )}
                {periodQuery.data.status === 'approved' && (
                  <button onClick={() => handleClose(periodQuery.data)} disabled={closePeriod.isPending} className="btn btn-secondary btn-sm"><Lock size={14} /> Close Period</button>
                )}
             </div>
           </div>

           {periodQuery.data.status === 'draft' && periodQuery.data.advisory && (
             <div className="finance-data-banner review planning-advisory-banner">
               <div className="finance-data-banner-icon planning-advisory-icon"><AlertTriangle size={16} /></div>
               <div>
                 <strong>Advisory Draft</strong>
                 <span>Changes here do not affect official totals until approved. Projected expense target: {displayMoney(periodQuery.data.advisory.projectedExpenseTarget, '$0')}. Net activity: {displayMoney(periodQuery.data.advisory.reviewedHouseholdNetActivity, '$0')}. {periodQuery.data.copiedFromPeriodId ? 'Initialized from the latest finalized plan.' : 'Initialized from the live category taxonomy.'}</span>
               </div>
             </div>
           )}

           <div className="guidance-panel card-pad" style={{ background: 'var(--surface-subtle)', borderRadius: '10px', marginBottom: '24px', border: '1px solid var(--border-default)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                 <Sparkles size={18} className="text-primary" />
                 <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Weekly Budget Guidance</h3>
              </div>

              {guidanceQuery.isLoading ? (
                 <div className="skeleton" style={{ height: '80px', borderRadius: '8px' }} />
              ) : guidanceQuery.isError ? (
                 <div className="finance-empty-state review" style={{ padding: '16px', background: 'var(--surface-default)' }}>
                    <AlertCircle size={16} className="text-critical" />
                    <strong>Guidance Unavailable</strong>
                    <span>Unable to calculate guidance. This usually means verified income is missing for this period or the calculation failed.</span>
                    <button className="btn btn-secondary btn-sm" onClick={() => void guidanceQuery.refetch()}>Retry Calculation</button>
                 </div>
              ) : guidanceQuery.data ? (
                 <div className="guidance-summary" style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                     <p style={{ margin: 0 }}>Guidance is <strong>advisory</strong> until accepted, and the drafted plan must be separately approved. Calculated on {new Date(guidanceQuery.data.calculationDate).toLocaleString()} using <strong>{guidanceQuery.data.basis.replace(/_/g, ' ')}</strong> basis. Evidence <code data-testid="text-weekly-guidance-fingerprint">{guidanceQuery.data.fingerprint.slice(0, 12)}</code>.</p>

                    <div className="finance-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                       <div className="metric-card green" style={{ padding: '12px' }}>
                          <span className="metric-detail">Verified Income ({guidanceQuery.data.includedIncomeCount} rows)</span>
                          <div className="metric-value">{displayMoney(guidanceQuery.data.verifiedIncome, '$0')}</div>
                       </div>
                       <div className="metric-card amber" style={{ padding: '12px' }}>
                          <span className="metric-detail">Included Outflow</span>
                          <div className="metric-value">{guidanceQuery.data.includedOutflowCount} rows</div>
                       </div>
                       <div className="metric-card default" style={{ padding: '12px' }}>
                          <span className="metric-detail">Exclusions</span>
                          <div className="metric-value">{Object.values(guidanceQuery.data.exclusions).reduce((a, b) => a + b, 0)} items</div>
                       </div>
                    </div>

                    {Object.values(guidanceQuery.data.exclusions).reduce((a, b) => a + b, 0) > 0 && (
                       <div style={{ background: 'var(--surface-default)', padding: '10px 12px', borderRadius: '6px', fontSize: '11px' }}>
                           <strong>Transactions blocking weekly guidance</strong>
                           <div style={{ marginTop: '4px' }}>Every row below remains excluded from recommendation math. Open a focused review to see the exact reason and fix only eligible household rows.</div>
                           <div className="filter-bar" style={{ margin: '9px 0 0' }}>
                             {Object.entries(guidanceQuery.data.exclusions).filter(([, count]) => count > 0).map(([reason, count]) => (
                               <Link
                                 key={reason}
                                 className="filter-chip"
                                 href={`/transactions?periodId=${encodeURIComponent(periodQuery.data.id)}&reason=${encodeURIComponent(reason)}&month=${encodeURIComponent(selectedMonth)}`}
                                 data-testid={`link-weekly-guidance-exclusion-${reason}`}
                               >
                                 {humanize(reason, reason)} <span>({count})</span>
                               </Link>
                             ))}
                           </div>
                       </div>
                    )}

                     <div style={{ background: 'var(--surface-default)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '12px' }}>
                         <div>
                           <strong style={{ color: 'var(--text-primary)' }}>Household allocation template</strong>
                           <div style={{ marginTop: '3px' }}>Allocate every active spending, debt, saving, and investing category. Income, transfers, and credit-card payments never receive an allocation.</div>
                         </div>
                         <strong style={{ color: allocationTotalBasisPoints === 10000 ? 'var(--color-success)' : 'var(--color-critical)', whiteSpace: 'nowrap' }}>
                           {(allocationTotalBasisPoints / 100).toFixed(2)} / 100.00%
                         </strong>
                       </div>
                       <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                         {allocatingCategories.map(category => (
                           <label key={category.id} className="field" style={{ gap: '4px' }}>
                             <span>{category.name}</span>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                               <input
                                 aria-label={`${category.name} allocation percentage`}
                                 inputMode="decimal"
                                 min="0"
                                 max="100"
                                 step="0.01"
                                 value={allocationPercentages[category.id] ?? ''}
                                 disabled={periodQuery.data.status !== 'draft' || updateAllocations.isPending}
                                 onChange={event => {
                                   setAllocationPercentages(current => ({ ...current, [category.id]: event.target.value }));
                                   setAllocationError(null);
                                 }}
                               />
                               <span>%</span>
                             </div>
                           </label>
                         ))}
                       </div>
                       {allocationError && <div role="alert" style={{ marginTop: '10px', color: 'var(--color-critical)' }}>{allocationError}</div>}
                       {periodQuery.data.status === 'draft' ? (
                         <button className="btn btn-secondary btn-sm" style={{ marginTop: '12px' }} disabled={!allocationTemplateValid || updateAllocations.isPending} onClick={() => void handleSaveAllocations()}>
                           {updateAllocations.isPending ? 'Saving…' : 'Save 100% allocation'}
                         </button>
                       ) : (
                         <div style={{ marginTop: '10px' }}>This allocation template is preserved with the immutable {periodQuery.data.status} period.</div>
                       )}
                     </div>

                    {periodQuery.data.status === 'draft' && (
                      <div style={{ marginTop: '4px' }}>
                         <button
                           className="btn btn-primary"
                           disabled={acceptGuidance.isPending || !guidanceQuery.data.categories.some(c => c.eligible && c.recommendedMonthly !== null)}
                           onClick={() => {
                              if (!periodQuery.data) return;
                               const eligibleIds = guidanceQuery.data.categories
                                 .filter(c => c.eligible && c.recommendedMonthly !== null)
                                 .map(c => c.categoryId);
                              if (eligibleIds.length > 0) {
                                 handleAcceptGuidance(periodQuery.data.id, periodQuery.data.version, eligibleIds, guidanceQuery.data.fingerprint);
                              }
                           }}
                        >
                           <Sparkles size={14} /> Accept All Eligible Recommendations
                        </button>
                      </div>
                    )}
                 </div>
              ) : null}
           </div>

           <div className="planning-categories">
              {activeCategories.map((cat, i, arr) => {
                 const gCat = guidanceQuery.data?.categories.find(c => c.categoryId === cat.id);
                 return (
                  <div key={cat.id} className="planning-category-card">
                     <div className="planning-category-header">
                        <div className="planning-row-info">
                            <strong>{cat.name} {gCat?.allocationBasisPoints != null && <span style={{ display: 'inline-block', marginLeft: '6px', padding: '2px 6px', background: 'var(--surface-subtle)', borderRadius: '4px', fontSize: '10px', fontWeight: 600, color: 'var(--text-secondary)' }}>{(gCat.allocationBasisPoints / 100).toFixed(2)}%</span>}</strong>
                           <span>{cat.categoryType.replace(/_/g, ' ')} • {cat.essentialStatus}</span>
                           {cat.notes && <span style={{ marginTop: '4px', display: 'block', fontSize: '11px' }}>{cat.notes}</span>}
                        </div>
                        <div className="planning-row-target">
                           {displayMoney(cat.monthlyTarget, '$0')}
                           {Number(cat.warningThreshold) > 0 && <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary)' }}>Warn: {Number(cat.warningThreshold) * 100}%</span>}
                        </div>
                        <div className="planning-row-actions">
                           <button className="btn btn-secondary btn-sm" onClick={() => setDetailCategory(cat)} aria-label={`View Contributions`} title="View Contributions"><BarChart3 size={14} /></button>
                           {periodQuery.data && periodQuery.data.status === 'draft' && (
                             <>
                               <button className="btn btn-secondary btn-sm" onClick={() => setEditingCategory(cat)} aria-label={`Edit`} title="Edit Category"><Pencil size={14} /></button>
                               <button className="btn btn-secondary btn-sm" onClick={() => handleMove(i, 'up')} disabled={i === 0 || reorderCategories.isPending} aria-label={`Move Up`} title="Move Up">↑</button>
                               <button className="btn btn-secondary btn-sm" onClick={() => handleMove(i, 'down')} disabled={i === arr.length - 1 || reorderCategories.isPending} aria-label={`Move Down`} title="Move Down">↓</button>
                             </>
                           )}
                        </div>
                     </div>
                     {gCat && (
                        <>
                          <div className="planning-row-expanded-metrics">
                             <div className="planning-guidance-metric">
                               <span className="label">Recommended (Mo)</span>
                               <span className="value">{gCat.recommendedMonthly ? displayMoney(gCat.recommendedMonthly, '$0') : '—'}</span>
                             </div>
                             <div className="planning-guidance-metric">
                               <span className="label">Recommended (Wk)</span>
                               <span className="value">{gCat.recommendedWeekly ? displayMoney(gCat.recommendedWeekly, '$0') : '—'}</span>
                             </div>
                             <div className="planning-guidance-metric">
                               <span className="label">Eligible Actuals</span>
                               <span className="value">{displayMoney(gCat.eligibleActualSpending, '$0')}</span>
                             </div>
                             <div className="planning-guidance-metric">
                               <span className="label">Remaining</span>
                               <span className="value">{gCat.remainingRecommendedAmount ? displayMoney(gCat.remainingRecommendedAmount, '$0') : '—'}</span>
                             </div>

                             <div className="planning-guidance-metric" style={{ justifyContent: 'center' }}>
                                <div className={`planning-guidance-status ${gCat.status}`}>
                                   {gCat.status === 'green' && <CheckCircle2 size={14} />}
                                   {gCat.status === 'red' && <AlertTriangle size={14} />}
                                   {gCat.status === 'neutral' && <MinusCircle size={14} />}
                                   <span style={{ textTransform: 'capitalize' }}>{gCat.status}</span>
                                </div>
                             </div>

                              {periodQuery.data && periodQuery.data.status === 'draft' && gCat.eligible && gCat.recommendedMonthly !== null && (
                               <div className="planning-guidance-metric" style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                     onClick={() => {
                                       const period = periodQuery.data;
                                       const guidance = guidanceQuery.data;
                                       if (!period || !guidance) return;
                                       void handleAcceptGuidance(period.id, period.version, [gCat.categoryId], guidance.fingerprint);
                                     }}
                                    disabled={acceptGuidance.isPending}
                                 >
                                   Accept
                                 </button>
                               </div>
                             )}
                          </div>
                          <div className={`planning-guidance-reason ${gCat.status}`}>
                             {gCat.reason}
                          </div>
                        </>
                     )}
                  </div>
                 );
              })}
              {activeCategories.length === 0 && (
                <div className="finance-empty-state">
                   <strong>No categories yet</strong>
                   <span>Create a category to start planning.</span>
                </div>
              )}
           </div>

           {archivedCategories.length > 0 && (
             <div className="planning-archived-section">
                <button
                  className="planning-archived-toggle"
                  onClick={() => setShowArchived(!showArchived)}
                  aria-expanded={showArchived}
                >
                  <span>Archived Categories ({archivedCategories.length})</span>
                  {showArchived ? <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} /> : <ChevronRight size={14} />}
                </button>
                {showArchived && (
                  <div className="planning-categories" style={{ marginTop: '12px' }}>
                    {archivedCategories.map((cat) => (
                       <div key={cat.id} className="planning-category-card archived">
                          <div className="planning-category-header">
                            <div className="planning-row-info">
                               <strong>{cat.name}</strong>
                               <span>{cat.categoryType.replace(/_/g, ' ')} • {cat.essentialStatus}</span>
                               {cat.notes && <span style={{ marginTop: '4px', display: 'block', fontSize: '11px' }}>{cat.notes}</span>}
                            </div>
                            <div className="planning-row-target">
                               {displayMoney(cat.monthlyTarget, '$0')}
                            </div>
                            <div className="planning-row-actions">
                               <button className="btn btn-secondary btn-sm" onClick={() => setDetailCategory(cat)} aria-label={`View Contributions for ${cat.name}`} title="View Contributions"><BarChart3 size={14} /></button>
                               {periodQuery.data.status === 'draft' && (
                                 <button className="btn btn-secondary btn-sm" onClick={() => setEditingCategory(cat)} aria-label={`Edit ${cat.name}`} title="Edit Category"><Pencil size={14} /></button>
                               )}
                            </div>
                          </div>
                       </div>
                    ))}
                  </div>
                )}
             </div>
           )}

           <div className="planning-history-grid">
             <div className="planning-change-history" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
               <strong>Recent Change Events</strong>
               {changeHistoryQuery.isLoading && <div className="budget-skeleton"><div className="skeleton" style={{ minHeight: '60px' }} /></div>}
               {changeHistoryQuery.isError && <div className="finance-empty-state" role="alert"><span>Could not load change history.</span><button className="btn btn-secondary" onClick={() => void changeHistoryQuery.refetch()}>Retry</button></div>}
               {changeHistoryQuery.isSuccess && changeHistoryQuery.data.length === 0 && <div className="finance-empty-state"><span>No changes recorded for this period.</span></div>}
               {changeHistoryQuery.isSuccess && changeHistoryQuery.data.length > 0 && (
                 <div className="planning-history-list">
                   {changeHistoryQuery.data.slice(0, 6).map((item) => (
                     <div key={item.id} className="planning-history-item">
                       <div>
                         <strong>{item.actor}</strong> {item.eventType.replace(/_/g, ' ')} {item.entity.toLowerCase()}
                         {item.reason && <div className="planning-history-item-meta" style={{ marginTop: '4px' }}>{item.reason}</div>}
                       </div>
                       <div className="planning-history-item-meta">{item.timestamp.slice(0, 10)} {item.timestamp.slice(11, 16)}</div>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             <div className="planning-change-history" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
               <strong>Period History</strong>
               {historyQuery.isLoading && <div className="budget-skeleton"><div className="skeleton" style={{ minHeight: '60px' }} /></div>}
               {historyQuery.isError && <div className="finance-empty-state" role="alert"><span>Could not load period history.</span><button className="btn btn-secondary" onClick={() => void historyQuery.refetch()}>Retry</button></div>}
               {historyQuery.isSuccess && historyQuery.data.length === 0 && <div className="finance-empty-state"><span>No historical periods found.</span></div>}
               {historyQuery.isSuccess && historyQuery.data.length > 0 && (
                 <div className="planning-history-list">
                   {historyQuery.data.slice(0, 6).map((item) => (
                     <div key={item.id} className="planning-history-item">
                       <div>
                         <strong>{formatMonth(item.month)}</strong>
                         <div className="planning-history-item-meta" style={{ marginTop: '4px' }}>
                           v{item.version} {item.copiedFromPeriodId ? '• Copied' : ''} {item.approvedAt ? `• Approved ${item.approvedAt.slice(0, 10)}` : ''}
                         </div>
                       </div>
                       <div className={`planning-history-item-status status ${item.status === 'draft' ? 'review' : item.status === 'approved' ? 'pending' : 'success'}`}>
                         {item.status}
                       </div>
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </div>
        </div>
      )}

      {editingCategory && periodQuery.data && (
        <div className="planning-modal-overlay" role="dialog" aria-labelledby="category-modal-title" aria-modal="true">
          <div className="planning-modal-content">
            <div className="card-pad" style={{ borderBottom: '1px solid var(--border-default)' }} id="category-modal-title"><CardTitle title={editingCategory === 'new' ? 'New Category' : 'Edit Category'} /></div>
            <CategoryForm
              period={periodQuery.data}
              category={editingCategory === 'new' ? undefined : editingCategory}
              onClose={() => setEditingCategory(null)}
              onSuccess={() => {
                 setEditingCategory(null);
                 queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningPeriodQueryKey(selectedMonth) });
                 queryClient.invalidateQueries({ queryKey: getGetBudgetPlanningChangeHistoryQueryKey(periodQuery.data.id) });
              }}
              onError={(err) => handleMutationError(err, 'Save Category')}
            />
          </div>
        </div>
      )}

      {detailCategory && periodQuery.data && (
        <div className="planning-modal-overlay" role="dialog" aria-labelledby="contribution-modal-title" aria-modal="true">
          <div className="planning-modal-content">
            <div className="card-pad" style={{ borderBottom: '1px solid var(--border-default)' }} id="contribution-modal-title"><CardTitle title={`Contributions: ${detailCategory.name}`} subtitle="Provenance of actuals for this category" /></div>
            <ContributionDetailView periodId={periodQuery.data.id} categoryId={detailCategory.id} onClose={() => setDetailCategory(null)} />
          </div>
        </div>
      )}
    </section>
  );
}

function BudgetPage() {
  const query = useGetBudget();
  const safe = useGetSafeToDeploy();
  const accounts = useListFinancialAccounts();
  const createTransaction = useCreateManualFinanceTransaction();
  const [transaction, setTransaction] = useState({
    accountId: '',
    transactionDate: new Date().toLocaleDateString('en-CA'),
    direction: 'outflow' as 'inflow' | 'outflow',
    amount: '',
    description: '',
    merchant: '',
  });
  const [transactionMessage, setTransactionMessage] = useState('');
  const [transactionError, setTransactionError] = useState('');
  useEffect(() => {
    if (!transaction.accountId && accounts.data?.accounts[0]) {
      setTransaction((current) => ({ ...current, accountId: accounts.data.accounts[0].id }));
    }
  }, [accounts.data, transaction.accountId]);
  const submitTransaction = async (event: FormEvent) => {
    event.preventDefault();
    setTransactionMessage('');
    setTransactionError('');
    if (!transaction.accountId) {
      setTransactionError('Add a manual account before recording a transaction.');
      return;
    }
    try {
      await createTransaction.mutateAsync({
        accountId: transaction.accountId,
        data: {
          transactionDate: transaction.transactionDate,
          direction: transaction.direction,
          amount: transaction.amount,
          description: transaction.description,
          merchant: transaction.merchant.trim() || null,
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/budget'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/cash-flow'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/safe-to-deploy'] }),
        queryClient.invalidateQueries({ queryKey: getListTransactionReviewQueueQueryKey() }),
      ]);
      setTransaction((current) => ({ ...current, amount: '', description: '', merchant: '' }));
      setTransactionMessage('Transaction saved for review. It will not affect planning totals until approved.');
    } catch (error) {
      setTransactionError(error instanceof Error ? error.message : 'Transaction could not be saved.');
    }
  };
  const data = query.data;
  const hasBudgetData = Number(data?.totals.budgeted ?? 0) > 0;
  const accountsAvailable = Boolean(accounts.data?.accounts.length);
  return <main className="content">
    <PageHeading eyebrow="Household finance / budget" title={<>Give every dollar<br /><em>a clear job.</em></>} description="A calm view of what came in, what went out, and what remains available for the plan." actions={<Link className="btn btn-primary" href="/cash-flow"><TrendingUp size={15} /> View cash flow</Link>} />
    {query.isLoading && <div className="finance-data-banner" role="status"><div className="finance-data-banner-icon"><Activity size={16} /></div><div><strong>Loading household budget</strong><span>Confirming reviewed transactions and planning targets before showing totals.</span></div></div>}
    {query.isError && <div className="card card-pad finance-route-error" role="alert"><div><strong>Budget data is temporarily unavailable</strong><span>No financial totals are shown until the household budget can be confirmed.</span></div><button className="btn btn-secondary" onClick={() => { void query.refetch(); }} data-testid="button-retry-budget">Try again</button></div>}
    {query.isSuccess && <div className="finance-data-banner" role="note"><div className="finance-data-banner-icon"><ShieldCheck size={16} /></div><div><strong>{hasBudgetData ? 'Household planning data' : 'Start with your household facts'}</strong><span>{hasBudgetData ? 'Manual entries and CSV imports are read-only source records. Imported rows stay in review until approved.' : 'Add a manual account, income source, or CSV ledger to build this household view. No demo household data is shared here.'}</span></div></div>}
    <section className="card card-pad page-section animate-in">
      <CardTitle title="Record a transaction" subtitle="Enter it once, then review it before it reaches your budget or Safe-to-Deploy." />
      {accounts.isLoading ? <div className="finance-empty-state" role="status"><strong>Loading household accounts</strong><span>The transaction form will be ready when account ownership is confirmed.</span></div> : accounts.isError ? <div className="finance-empty-state" role="alert"><strong>Accounts are temporarily unavailable</strong><span>A transaction cannot be attributed safely until accounts load.</span><button className="btn btn-secondary" onClick={() => { void accounts.refetch(); }} data-testid="button-retry-budget-accounts">Try again</button></div> : !accountsAvailable ? <div className="finance-empty-state"><strong>Add an account first</strong><span>Transactions need a household account so balances and history stay attributable.</span><Link className="btn btn-secondary" href="/accounts">Open accounts</Link></div> : <form className="account-form transaction-form" onSubmit={submitTransaction}>
        <div className="field"><label htmlFor="budget-transaction-account">Account</label><select id="budget-transaction-account" required value={transaction.accountId} onChange={(event) => setTransaction({ ...transaction, accountId: event.target.value })}><option value="" disabled>Select an account</option>{(accounts.data?.accounts ?? []).map((account) => <option value={account.id} key={account.id}>{account.nickname} · {account.institution}</option>)}</select></div>
        <div className="field"><label htmlFor="budget-transaction-date">Date</label><input id="budget-transaction-date" required type="date" value={transaction.transactionDate} onChange={(event) => setTransaction({ ...transaction, transactionDate: event.target.value })} /></div>
        <div className="field"><label htmlFor="budget-transaction-direction">Type</label><select id="budget-transaction-direction" value={transaction.direction} onChange={(event) => setTransaction({ ...transaction, direction: event.target.value as 'inflow' | 'outflow' })}><option value="outflow">Money out</option><option value="inflow">Money in</option></select></div>
        <div className="field"><label htmlFor="budget-transaction-amount">Amount</label><input id="budget-transaction-amount" required inputMode="decimal" min="0.01" step="0.01" pattern="[0-9]+([.][0-9]{1,2})?" value={transaction.amount} onChange={(event) => setTransaction({ ...transaction, amount: event.target.value })} placeholder="0.00" /></div>
        <div className="field"><label htmlFor="budget-transaction-description">Description</label><input id="budget-transaction-description" required maxLength={240} value={transaction.description} onChange={(event) => setTransaction({ ...transaction, description: event.target.value })} placeholder="What was this for?" /></div>
        <div className="field"><label htmlFor="budget-transaction-merchant">Merchant <span style={{ textTransform: 'none', letterSpacing: 0 }}>(optional)</span></label><input id="budget-transaction-merchant" maxLength={160} value={transaction.merchant} onChange={(event) => setTransaction({ ...transaction, merchant: event.target.value })} placeholder="e.g. Grocery store" /></div>
        <div className="modal-actions"><button type="submit" className="btn btn-primary" disabled={createTransaction.isPending}><Check size={14} /> {createTransaction.isPending ? 'Saving…' : 'Save for review'}</button></div>
      </form>}
      {transactionMessage && <div className="form-feedback success" role="status">{transactionMessage} <Link className="text-link" href="/transactions">Open the review queue</Link></div>}
      {transactionError && <div className="form-feedback error" role="alert">{transactionError}</div>}
      <div className="finance-note"><ShieldCheck size={16} /><span>Entries are household-scoped, actor-attributed, and excluded from budget calculations until a household member reviews them.</span></div>
    </section>
    {query.isLoading && <div className="budget-skeleton" aria-hidden="true"><div className="finance-grid"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton budget-skeleton-table" /></div>}
    {query.isSuccess && data && <>
      <div className="finance-grid animate-in delay-1">
        <FinanceMetric label="Month planned" value={displayMoney(data.totals.budgeted, '$0')} detail="household expense targets" tone="blue" action={<Link className="text-link" href="/transactions">Review activity</Link>} />
        <FinanceMetric label="Spent so far" value={displayMoney(data.totals.actual, '$0')} detail={`${data.totals.percentageUsed}% of planned`} tone="amber" action={<Link className="text-link" href="/transactions">Review transactions</Link>} />
        <FinanceMetric label="Remaining" value={displayMoney(data.totals.remaining, '$0')} detail="before the month closes" tone="green" action={<Link className="text-link" href="/cash-flow">View cash flow</Link>} />
        <FinanceMetric label="Safe to deploy" value={safe.isLoading ? 'Calculating…' : safe.isError ? 'Unavailable' : displayMoney(safe.data?.safeToDeploy, '$0')} detail={safe.isError ? 'Capital Governor could not be refreshed' : 'Capital Governor limit'} tone="lavender" action={safe.isError ? <button className="text-link" onClick={() => { void safe.refetch(); }} data-testid="button-retry-budget-safe-to-deploy">Try again</button> : <Link className="text-link" href="/cash-flow">See calculation</Link>} />
      </div>

      <BudgetPlanningControlCenter />

      <section className="card card-pad page-section animate-in delay-2" style={{ marginTop: '24px' }}>
        <CardTitle title="Budget performance" subtitle="Projected pace helps surface pressure before it becomes a surprise." action={<Link className="btn btn-secondary" href="/transactions"><ClipboardCheck size={14} /> Review transactions</Link>} />
       {!hasBudgetData && <div className="finance-empty-state"><strong>No monthly budget targets yet</strong><span>Current categories have no monthly expense targets. Review transaction categories now; planning targets can be completed when household estimates are available.</span><Link className="btn btn-secondary" href="/transactions">Review categories</Link></div>}
       <div className="finance-table">
        {data.categories.map((category) => <div className="finance-row" key={category.id}>
          <div><strong>{category.name}</strong><span>{category.essentialStatus === 'essential' ? 'Essential' : category.essentialStatus === 'discretionary' ? 'Flexible' : 'Mixed'}</span></div>
          <div className="finance-bar"><b style={{ width: `${Math.min(category.percentageUsed, 100)}%` }} /></div>
          <div className="finance-amount"><strong>{displayMoney(category.actual, '$0')}</strong><span>of {displayMoney(category.budgeted, '$0')}</span></div>
          <span className={`status ${category.status === 'above_pace' ? 'review' : category.status === 'on_pace' ? 'pending' : ''}`}>{category.status.replace('_', ' ')}</span>
        </div>)}
      </div>
       <div className="finance-note"><ShieldCheck size={16} /><span>{data.notes[0]} {data.notes[2]}</span></div>
      </section>
    </>}
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
    {formOpen && <PlanningFormFrame title={editingId ? 'Edit household bill' : 'Add a household bill'} subtitle="Active bills are included in the Capital Governor’s commitment view." onCancel={() => setFormOpen(false)}><form className="planning-form" onSubmit={submit}><div className="field"><label>Bill name</label><input required value={form.billName} onChange={(event) => setForm({ ...form, billName: event.target.value })} data-testid="input-bill-name" /></div><div className="field"><label>Due date</label><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} data-testid="input-bill-due-date" /></div><div className="field"><label>Expected amount</label><input required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={form.expectedAmount} onChange={(event) => setForm({ ...form, expectedAmount: event.target.value })} data-testid="input-bill-amount" /></div>{editingId && <div className="field"><label>Status</label><select value={form.status ?? 'upcoming'} onChange={(event) => setForm({ ...form, status: event.target.value as BillInput['status'] })}><option value="upcoming">Upcoming</option><option value="due_soon">Due soon</option><option value="estimated">Estimated</option><option value="paid">Paid</option><option value="overdue">Overdue</option><option value="skipped">Skipped</option></select></div>}<label className="planning-check"><input type="checkbox" checked={form.essential ?? true} onChange={(event) => setForm({ ...form, essential: event.target.checked })} /> Essential commitment</label><label className="planning-check"><input type="checkbox" checked={form.autoPay ?? false} onChange={(event) => setForm({ ...form, autoPay: event.target.checked })} /> Autopay enabled</label><div className="modal-actions"><button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}><Check size={14} /> {editingId ? 'Save changes' : 'Add bill'}</button></div></form></PlanningFormFrame>}
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
    {formOpen && <PlanningFormFrame title={editingId ? 'Edit upcoming expense' : 'Add an upcoming expense'} subtitle="Required, unfunded expenses reduce the Capital Governor’s commitment room." onCancel={() => setFormOpen(false)}><form className="planning-form" onSubmit={submit}><div className="field"><label>Expense name</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-upcoming-expense-name" /></div><div className="field"><label>Expected date</label><input required type="date" value={form.expectedDate} onChange={(event) => setForm({ ...form, expectedDate: event.target.value })} data-testid="input-upcoming-expense-date" /></div><div className="field"><label>Estimated amount</label><input required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={form.estimatedAmount} onChange={(event) => setForm({ ...form, estimatedAmount: event.target.value })} data-testid="input-upcoming-expense-amount" /></div><div className="field"><label>Already funded</label><input required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={form.fundedAmount ?? '0.00'} onChange={(event) => setForm({ ...form, fundedAmount: event.target.value })} data-testid="input-upcoming-expense-funded" /></div><div className="field"><label>Priority</label><select value={form.priority ?? 'normal'} onChange={(event) => setForm({ ...form, priority: event.target.value as UpcomingExpenseInput['priority'] })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div><label className="planning-check"><input type="checkbox" checked={form.required ?? false} onChange={(event) => setForm({ ...form, required: event.target.checked })} /> Required commitment</label><div className="modal-actions"><button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}><Check size={14} /> {editingId ? 'Save changes' : 'Add expense'}</button></div></form></PlanningFormFrame>}
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
    {formOpen && <PlanningFormFrame title={editingId ? 'Edit income source' : 'Add an income source'} subtitle="Only active sources are used for forward-looking cash-flow timing." onCancel={() => setFormOpen(false)}><form className="planning-form" onSubmit={submit}><div className="field"><label>Source name</label><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} data-testid="input-income-name" /></div><div className="field"><label>Source type</label><select value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value as IncomeSourceInput['sourceType'] })}><option value="employment">Employment</option><option value="contract">Contract</option><option value="business">Business</option><option value="rental">Rental</option><option value="investment">Investment</option><option value="interest">Interest</option><option value="other">Other</option></select></div><div className="field"><label>Expected monthly</label><input required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={form.expectedMonthly} onChange={(event) => setForm({ ...form, expectedMonthly: event.target.value })} data-testid="input-income-amount" /></div><div className="field"><label>Cadence</label><select value={form.cadence} onChange={(event) => setForm({ ...form, cadence: event.target.value as IncomeSourceInput['cadence'] })}><option value="weekly">Weekly</option><option value="biweekly">Biweekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option></select></div><div className="field"><label>Next pay date</label><input required type="date" value={form.nextPayDate} onChange={(event) => setForm({ ...form, nextPayDate: event.target.value })} data-testid="input-income-pay-date" /></div><div className="modal-actions"><button type="button" className="btn" onClick={() => setFormOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}><Check size={14} /> {editingId ? 'Save changes' : 'Add income'}</button></div></form></PlanningFormFrame>}
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
  const bankingStatus = useGetBankingStatus();
  const bankConnections = useListReadOnlyBankConnections();
  const create = useCreateManualFinancialAccount();
  const importCsv = useImportFinancialAccountCsv();
  const createConnection = useCreateReadOnlyBankConnection();
  const [adding, setAdding] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [form, setForm] = useState({ institution: '', nickname: '', accountType: 'checking', currentBalance: '' });
  const [connectionForm, setConnectionForm] = useState({ provider: '', institutionName: '', providerConnectionRef: '', consent: false });
  const [importingAccountId, setImportingAccountId] = useState<string | null>(null);
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
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
  const loadCsvFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvText(await file.text());
  };
  const submitCsv = async (event: FormEvent) => {
    event.preventDefault();
    if (!importingAccountId || !csvText.trim()) {
      onFeedback('Choose an account and CSV file before importing.');
      return;
    }
    try {
      const result = await importCsv.mutateAsync({ accountId: importingAccountId, data: { csv: csvText } });
      await queryClient.invalidateQueries({ queryKey: ['/api/financial-accounts'] });
      onFeedback(`${result.imported} row${result.imported === 1 ? '' : 's'} imported for review; ${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? '' : 's'} skipped.`);
      setCsvText('');
      setCsvFileName('');
      setImportingAccountId(null);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'CSV could not be imported.');
    }
  };
  const productionProviders = (bankingStatus.data?.adapters ?? []).filter((adapter) => adapter.enabled && !['manual', 'csv_import'].includes(adapter.provider));
  useEffect(() => {
    if (!connectionForm.provider && productionProviders[0]) {
      setConnectionForm((current) => ({ ...current, provider: productionProviders[0].provider }));
    }
  }, [connectionForm.provider, productionProviders]);
  const refreshBanking = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListReadOnlyBankConnectionsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: ['/api/financial-accounts'] }),
    ]);
  };
  const submitConnection = async (event: FormEvent) => {
    event.preventDefault();
    if (!connectionForm.consent) {
      onFeedback('Confirm explicit read-only consent before connecting.');
      return;
    }
    try {
      await createConnection.mutateAsync({ data: { ...connectionForm, consent: true } });
      await refreshBanking();
      setConnectionForm({ provider: productionProviders[0]?.provider ?? '', institutionName: '', providerConnectionRef: '', consent: false });
      setConnecting(false);
      onFeedback('Read-only bank consent recorded. Match each provider account before syncing.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The bank connection could not be created.');
    }
  };
  return <main className="content">
    <PageHeading eyebrow="Household finance / accounts" title={<>Know where the money<br /><em>is held.</em></>} description="Manual, imported, and explicitly consented read-only accounts give the Capital Governor context without allowing Capital OS to move money." actions={<button className="btn btn-primary" onClick={() => setAdding(!adding)} data-testid="button-add-financial-account"><Plus size={15} /> Add manual account</button>} />
    {adding && <section className="card card-pad page-section"><CardTitle title="Add a manual account" subtitle="Balances stay read-only after they are entered." /><form className="account-form" onSubmit={submit}><div className="field"><label>Institution</label><input required value={form.institution} onChange={(event) => setForm({ ...form, institution: event.target.value })} /></div><div className="field"><label>Nickname</label><input required value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></div><div className="field"><label>Account type</label><select value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value })}><option value="checking">Checking</option><option value="savings">Savings</option><option value="credit_card">Credit card</option><option value="loan">Loan</option></select></div><div className="field"><label>Current balance</label><input inputMode="decimal" value={form.currentBalance} onChange={(event) => setForm({ ...form, currentBalance: event.target.value })} placeholder="0.00" /></div><div className="modal-actions"><button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={create.isPending}><Check size={14} /> Save account</button></div></form></section>}
    <section className="card card-pad animate-in delay-1"><CardTitle title="Connected financial accounts" subtitle={`${query.data?.totals.accountCount ?? 0} accounts · read-only by design`} /><div className="table-wrap"><table className="table"><thead><tr><th>Account</th><th>Type</th><th>Balance</th><th>Source</th><th>Status</th><th>History</th></tr></thead><tbody>{(query.data?.accounts ?? []).map((account) => <tr key={account.id}><td><strong>{account.nickname}</strong><br /><span className="table-secondary">{account.institution}</span></td><td>{account.accountType.replace('_', ' ')}</td><td className="font-mono">{account.restricted ? 'Restricted' : displayMoney(account.currentBalance ?? undefined, '$0')}</td><td>{account.dataSource.replace('_', ' ')}</td><td><span className="status">{account.protected ? 'Protected' : 'Read only'}</span></td><td><button className="btn btn-small" onClick={() => { setImportingAccountId(account.id); setCsvText(''); setCsvFileName(''); }}><FileText size={13} /> Import CSV</button></td></tr>)}</tbody></table></div>{!query.isLoading && !(query.data?.accounts.length) && <div className="finance-empty-state"><strong>Add an account before importing history</strong><span>Use a manual account for the current balance, then import a CSV ledger. Imported rows stay in review until you approve them for planning.</span></div>}<div className="finance-note"><LockKeyhole size={16} /><span>Every source is read-only. Capital OS does not expose transfers, bill pay, ACH, trading, or stored bank credentials.</span></div></section>
    <section className="card card-pad page-section bank-connections" data-testid="section-bank-connections">
      <CardTitle title="Read-only bank connections" subtitle={productionProviders.length ? 'Consent, match, review, and revoke provider access.' : 'Unavailable until an approved production provider is configured.'} action={<button className="btn" type="button" disabled={!productionProviders.length} onClick={() => setConnecting((value) => !value)} data-testid="button-connect-bank"><Landmark size={14} /> Connect bank</button>} />
      {bankingStatus.isError && <div className="bank-state-banner critical" role="alert"><ShieldAlert size={17} /><div><strong>Provider status is unavailable</strong><span>New connections, matching, and sync are paused. Existing connections remain available for review, export, consent revocation, and provider-data deletion.</span></div></div>}
      {!bankingStatus.isLoading && !bankingStatus.isError && !productionProviders.length && <div className="bank-state-banner disabled"><Lock size={17} /><div><strong>Production bank sync is off</strong><span>Manual accounts and CSV import are the active paths. Connecting, syncing, and provider consent stay disabled until an approved read-only adapter is configured.</span></div></div>}
      {connecting && productionProviders.length > 0 && <form className="account-form bank-consent-form" onSubmit={submitConnection} data-testid="form-bank-consent"><div className="field"><label>Approved provider</label><select value={connectionForm.provider} onChange={(event) => setConnectionForm({ ...connectionForm, provider: event.target.value })}>{productionProviders.map((adapter) => <option key={adapter.provider} value={adapter.provider}>{humanize(adapter.provider)}</option>)}</select></div><div className="field"><label>Institution name</label><input required maxLength={160} value={connectionForm.institutionName} onChange={(event) => setConnectionForm({ ...connectionForm, institutionName: event.target.value })} /></div><div className="field"><label>Provider connection reference</label><input required maxLength={240} value={connectionForm.providerConnectionRef} onChange={(event) => setConnectionForm({ ...connectionForm, providerConnectionRef: event.target.value })} /><span className="table-secondary">Use the opaque reference returned by the approved provider. Never paste bank credentials here.</span></div><label className="bank-consent-check"><input type="checkbox" checked={connectionForm.consent} onChange={(event) => setConnectionForm({ ...connectionForm, consent: event.target.checked })} /><span><strong>I consent to read-only synchronization</strong>Capital OS may retrieve account and transaction data for review. It cannot move money, and I can revoke this consent at any time.</span></label><div className="modal-actions"><button type="button" className="btn" onClick={() => setConnecting(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={!connectionForm.consent || createConnection.isPending}><ShieldCheck size={14} /> {createConnection.isPending ? 'Recording consent…' : 'Consent and connect'}</button></div></form>}
      {bankConnections.isError && <div className="bank-state-banner critical" role="alert"><AlertTriangle size={17} /><div><strong>Connections could not be loaded</strong><span>Your existing account facts are unchanged. Try again when the household service recovers.</span></div><button className="btn btn-small" onClick={() => { void bankConnections.refetch(); }}>Try again</button></div>}
      {!bankConnections.isLoading && !bankConnections.isError && !(bankConnections.data?.connections.length) && <div className="finance-empty-state"><strong>No bank access granted</strong><span>Connecting is optional. Manual entry and CSV import remain available without provider consent.</span></div>}
      <div className="bank-connection-list">{(bankConnections.data?.connections ?? []).map((connection) => <BankConnectionCard key={connection.id} connection={connection} accounts={query.data?.accounts ?? []} providerAvailable={productionProviders.some((adapter) => adapter.provider === connection.provider)} onChanged={refreshBanking} onFeedback={onFeedback} />)}</div>
    </section>
    {importingAccountId && <section className="card card-pad page-section"><CardTitle title="Import read-only transaction history" subtitle="CSV rows are stored for review and never move money or change a balance automatically." /><form className="account-form" onSubmit={submitCsv}><div className="field"><label htmlFor="finance-csv-file">CSV file</label><input id="finance-csv-file" type="file" accept=".csv,text/csv" onChange={loadCsvFile} /><span className="table-secondary">{csvFileName || 'Expected columns: date, description, amount; merchant and externalId are optional.'}</span></div><div className="field"><label htmlFor="finance-csv-text">Or paste CSV</label><textarea id="finance-csv-text" rows={7} value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder={'date,description,amount\\n2026-09-01,"Household market",-42.50'} /></div><div className="modal-actions"><button type="button" className="btn" onClick={() => { setImportingAccountId(null); setCsvText(''); setCsvFileName(''); }}>Cancel</button><button type="submit" className="btn btn-primary" disabled={importCsv.isPending}><Database size={14} /> {importCsv.isPending ? 'Importing…' : 'Import for review'}</button></div></form></section>}
  </main>;
}

function BankConnectionCard({ connection, accounts, providerAvailable, onChanged, onFeedback }: { connection: BankConnection; accounts: FinancialAccount[]; providerAvailable: boolean; onChanged: () => Promise<void>; onFeedback: (message: string) => void }) {
  const link = useLinkReadOnlyBankAccount();
  const sync = useSyncReadOnlyBankConnection();
  const revoke = useRevokeReadOnlyBankConnection();
  const removeData = useDeleteReadOnlyBankConnectionData();
  const exportQuery = useExportReadOnlyBankConnection(connection.id, { query: { enabled: false, queryKey: getExportReadOnlyBankConnectionQueryKey(connection.id) } });
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '');
  const [providerAccountRef, setProviderAccountRef] = useState('');
  const [confirmAction, setConfirmAction] = useState<'revoke' | 'delete' | null>(null);
  const state = connection.reconciliationStatus;
  const stateTone = ['outage', 'revoked'].includes(state) ? 'critical' : ['review', 'stale', 'rate_limited', 'not_run'].includes(state) ? 'pending' : '';
  const stateCopy: Record<string, string> = {
    not_run: 'Match the provider account to a planning account, then run the first sync.',
    matched: 'The latest provider snapshot reconciled and was applied.',
    review: 'A balance difference or unmatched account needs household review; no disputed data was applied.',
    stale: 'The provider snapshot is too old. No balances or transactions were applied.',
    outage: 'The provider is unavailable. Existing household facts remain unchanged.',
    rate_limited: 'The provider delayed this request. Wait before trying again.',
    revoked: 'Household consent is revoked and synchronization is stopped.',
  };
  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      await onChanged();
      onFeedback(success);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The bank connection action could not be completed.');
    }
  };
  const linkAccount = async (event: FormEvent) => {
    event.preventDefault();
    await run(() => link.mutateAsync({ connectionId: connection.id, data: { accountId, providerAccountRef } }), 'Provider account matched. Run sync to review the latest snapshot.');
    setProviderAccountRef('');
  };
  const exportData = async () => {
    const result = await exportQuery.refetch();
    if (!result.data) {
      onFeedback(result.error instanceof Error ? result.error.message : 'Bank data could not be exported.');
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `capital-os-${connection.institutionName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-bank-data.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    onFeedback('Read-only provider data exported without credentials.');
  };
  const active = connection.consentStatus === 'granted';
  const access = bankConnectionAccess(providerAvailable, active);
  return <article className="bank-connection-card" data-testid={`card-bank-connection-${connection.id}`}>
    <div className="bank-connection-head"><div><span className="mono-label">{humanize(connection.provider)} · read only</span><h3>{connection.institutionName}</h3></div><span className={`status ${stateTone}`}>{humanize(state)}</span></div>
    <div className={`bank-state-banner ${stateTone}`}><Activity size={16} /><div><strong>{active ? humanize(connection.status) : 'Consent revoked'}</strong><span>{connection.errorMessage || stateCopy[state]}</span></div></div>
    <div className="bank-connection-meta"><span><strong>Last successful sync</strong>{displayDate(connection.lastSuccessfulSync ?? undefined, 'Never')}</span><span><strong>Provider data as of</strong>{displayDate(connection.providerAsOf ?? undefined, 'Not received')}</span><span><strong>Reconciliation difference</strong>{displayMoney(connection.reconciliationDifference, '$0')}</span><span><strong>Credential boundary</strong>{connection.credentialStored ? 'Server-side reference active' : 'No active credential reference'}</span></div>
    {active && <form className="bank-match-form" onSubmit={linkAccount}><div className="field"><label>Planning account</label><select required disabled={!access.canMatch} value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="" disabled>Select an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname} · {account.institution}</option>)}</select></div><div className="field"><label>Provider account reference</label><input required disabled={!access.canMatch} value={providerAccountRef} onChange={(event) => setProviderAccountRef(event.target.value)} placeholder="Opaque provider account ID" /></div><button className="btn" type="submit" disabled={!access.canMatch || !accountId || link.isPending}><ArrowRightLeft size={14} /> {link.isPending ? 'Matching…' : 'Match account'}</button></form>}
    <div className="bank-connection-actions"><button className="btn" disabled={!access.canSync || sync.isPending} onClick={() => { void run(() => sync.mutateAsync({ connectionId: connection.id }), 'Sync finished. Review the reconciliation status before relying on new data.'); }}><RotateCcw size={14} /> {sync.isPending ? 'Syncing…' : 'Sync now'}</button><button className="btn" disabled={!access.canExport || exportQuery.isFetching} onClick={() => { void exportData(); }}><ArrowDownLeft size={14} /> {exportQuery.isFetching ? 'Exporting…' : 'Export data'}</button>{access.canRevoke && <button className="btn danger" onClick={() => setConfirmAction('revoke')}>Revoke consent</button>}<button className="btn danger" disabled={!access.canDelete} onClick={() => setConfirmAction('delete')}>Delete provider data</button></div>
    {confirmAction && <div className="bank-confirm" role="alertdialog" aria-label={confirmAction === 'revoke' ? 'Confirm consent revocation' : 'Confirm provider data deletion'}><AlertTriangle size={18} /><div><strong>{confirmAction === 'revoke' ? 'Stop future bank synchronization?' : 'Permanently delete provider-derived data?'}</strong><span>{confirmAction === 'revoke' ? 'Existing imported records remain, but the credential reference is revoked and no future sync can run.' : 'This removes provider transactions, unlinks matched accounts, and deletes the server-side credential reference. This cannot be undone.'}</span></div><div className="modal-actions"><button className="btn" onClick={() => setConfirmAction(null)}>Cancel</button><button className="btn danger" disabled={revoke.isPending || removeData.isPending} onClick={() => { const action = confirmAction; setConfirmAction(null); void run(() => action === 'revoke' ? revoke.mutateAsync({ connectionId: connection.id }) : removeData.mutateAsync({ connectionId: connection.id }), action === 'revoke' ? 'Read-only bank consent revoked.' : 'Provider-derived bank data deleted.'); }}>{confirmAction === 'revoke' ? 'Revoke consent' : 'Delete data'}</button></div></div>}
  </article>;
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
          <form className="scenario-form" onSubmit={runScenario}><div className="field"><label>Proposed weekly duplex contribution</label><div className="scenario-input"><span>$</span><input inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={proposedWeekly} onChange={(event) => setProposedWeekly(event.target.value)} required data-testid="input-intelligence-scenario" /></div></div><button className="btn btn-primary" type="submit" disabled={scenario.isPending} data-testid="button-run-intelligence-scenario"><Sparkles size={14} /> {scenario.isPending ? 'Calculating…' : 'Compare pace'}</button></form>
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

function UtilityPage({ kind, onAction, transactions, dashboard }: { kind: string; onAction: (kind: Exclude<ModalKind, null>) => void; transactions: Transaction[]; dashboard?: DashboardSnapshot }) {
  const meta: Record<string, { eyebrow: string; title: ReactNode; description: string; icon: typeof ReceiptText }> = {
    transactions: { eyebrow: 'Keep track / transactions', title: <>A clean record of<br /><em>the small decisions.</em></>, description: 'Every contribution and transfer has a place, so the plan never depends on memory.', icon: ReceiptText },
    contributions: { eyebrow: 'Keep track / contributions', title: <>Keep the promise<br /><em>visible.</em></>, description: 'The weekly rhythm is simple on purpose. This is where you see it accumulate.', icon: WalletCards },
    reports: { eyebrow: 'Keep track / reports', title: <>A slower read<br /><em>of your progress.</em></>, description: 'Useful snapshots for a monthly check-in or a thoughtful conversation at home.', icon: FileText },
    documents: { eyebrow: 'Keep track / documents', title: <>Keep the paper<br /><em>close, not loud.</em></>, description: 'The few documents that help the future feel less abstract, held in one calm place.', icon: ClipboardList },
    insights: { eyebrow: 'Keep track / insights', title: <>Notice what is<br /><em>already working.</em></>, description: 'Short reflections drawn from your plan, not from market noise.', icon: Lightbulb },
  };
  const item = meta[kind] || meta.transactions; const Icon = item.icon;
  if (kind === 'transactions') return <main className="content"><PageHeading eyebrow={item.eyebrow} title={item.title} description={item.description} actions={<button className="btn btn-primary" data-testid="button-add-transaction" onClick={() => onAction('contribution')}><Plus size={15} /> Add movement</button>} /><TransactionTable transactions={transactions} /></main>;
  if (kind === 'contributions') {
    const contributed = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const weeklyPace = Number(dashboard?.allocation?.totalWeekly ?? 0);
    const allocation = dashboard?.allocation;
    const allocationRows = allocation ? [
      ['Duplex Reserve', allocation.duplexReserve, allocation.totalWeekly],
      ['Capital OS', allocation.capitalOs, allocation.totalWeekly],
      ['Opportunity Reserve', allocation.opportunityReserve, allocation.totalWeekly],
    ] : [];
    return <main className="content"><PageHeading eyebrow={item.eyebrow} title={item.title} description={item.description} actions={<button className="btn btn-primary" data-testid="button-add-contribution-page" onClick={() => onAction('contribution')}><Plus size={15} /> Record contribution</button>} /><section className="card card-pad stat-strip animate-in delay-1">{[[`$${contributed.toFixed(2)}`, 'contributed in loaded history', `${transactions.length} recorded movements`], [`$${weeklyPace.toFixed(2)}`, 'current weekly pace', 'From the active household rule'], ['—', 'on-time rhythm', 'Requires contribution schedule data']].map(([value, label, detail], index) => <div className="stat-cell" key={label}><div className="mono-label">{label}</div><div className="stat-value" data-testid={index === 0 ? 'stat-contributed-loaded-history' : index === 1 ? 'stat-current-weekly-pace' : undefined}>{value}</div><div className="stat-detail">{detail}</div></div>)}</section><section className="card card-pad page-section"><CardTitle title="Allocation rhythm" subtitle="The server applies the active household rule when a contribution is recorded." />{allocationRows.map(([name, amount, total]) => <div className="goal-row" key={name}><div className="goal-label"><i />{name}</div><div className="goal-progress"><b style={{ width: `${total && Number(total) > 0 ? (Number(amount) / Number(total)) * 100 : 0}%`, background:name === 'Duplex Reserve' ? 'var(--color-protected)' : name === 'Capital OS' ? 'var(--color-primary)' : 'var(--color-opportunity)' }} /></div><div className="goal-pct" data-testid={`text-allocation-${name.toLowerCase().replaceAll(' ', '-')}`}>${Number(amount).toFixed(2)}</div></div>)}</section></main>;
  }
  return <main className="content"><PageHeading eyebrow={item.eyebrow} title={item.title} description={item.description} actions={<button className="btn btn-primary" data-testid={`button-add-${kind}`} onClick={() => onAction(kind === 'documents' ? 'property' : 'strategy')}><Plus size={15} /> {kind === 'documents' ? 'Add document note' : kind === 'reports' ? 'Build a report' : 'Save an insight'}</button>} /><section className="empty-state animate-in delay-1"><Icon size={25} /><h3>{kind === 'documents' ? 'Your future self will thank you.' : kind === 'reports' ? 'A report worth opening.' : 'A little perspective helps.'}</h3><p>{kind === 'documents' ? 'Add a note about a statement, inspection checklist, or lender conversation when it becomes useful.' : kind === 'reports' ? 'Your first monthly capital report will appear after the next contribution cycle.' : 'Insights will become more personal as your weekly rhythm builds a longer story.'}</p><button className="btn btn-gold" data-testid={`button-create-${kind}`} onClick={() => onAction(kind === 'documents' ? 'property' : 'strategy')}><FilePlus2 size={14} /> Create the first one</button></section></main>;
}

function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  const [filter, setFilter] = useState('All');
  const filtered = filter === 'All' ? transactions : transactions.filter((item) => item.category === filter);
  return <section className="card card-pad animate-in delay-1"><div className="filter-bar"><SlidersHorizontal size={14} color="var(--ink-soft)" />{['All', 'Duplex Reserve', 'Opportunity Reserve', 'Capital OS'].map((label) => <button className={`filter-chip ${filter === label ? 'active' : ''}`} key={label} onClick={() => setFilter(label)} data-testid={`button-filter-transactions-${label.replaceAll(' ', '-').toLowerCase()}`}>{label}</button>)}</div><div className="table-wrap"><table className="table"><thead><tr><th>Date</th><th>Movement</th><th>Category</th><th>Status</th><th>Amount</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td className="font-mono">{item.date}</td><td><strong>{item.name}</strong></td><td>{item.category}</td><td><span className={`status ${item.status === 'Scheduled' ? 'pending' : ''}`}>{item.status}</span></td><td className="font-mono">+${item.amount}</td></tr>)}</tbody></table></div>{filtered.length === 0 && <div className="empty-state" style={{ marginTop:15 }}><Search size={20} /><h3>Nothing in this sleeve yet</h3><p>Try another category to see your complete capital record.</p></div>}</section>;
}

type ReviewQueueRecord = Record<string, unknown>;

type ReviewDraft = { categoryId: string; note: string };

function reviewRecord(value: unknown): ReviewQueueRecord {
  return value && typeof value === 'object' ? value as ReviewQueueRecord : {};
}

function firstString(record: ReviewQueueRecord, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return fallback;
}

function normalizeReviewRows(value: unknown): ReviewQueueRecord[] {
  if (Array.isArray(value)) return value.map(reviewRecord);
  const root = reviewRecord(value);
  for (const key of ['transactions', 'items', 'queue', 'reviewQueue', 'rows']) {
    if (Array.isArray(root[key])) return root[key].map(reviewRecord);
  }
  return [];
}

function normalizeReviewRow(value: ReviewQueueRecord) {
  const id = firstString(value, ['transactionId', 'id'], 'unknown');
  const amount = value.amount;
  return {
    id,
    date: firstString(value, ['transactionDate', 'date', 'createdAt'], 'Date not supplied'),
    merchant: firstString(value, ['merchant', 'description'], 'Imported transaction'),
    description: firstString(value, ['description', 'merchant'], 'No description supplied'),
    amount: typeof amount === 'number' || typeof amount === 'string' ? amount : '0',
    account: firstString(value, ['accountName', 'account', 'financialAccountName'], 'Account not supplied'),
    categoryId: firstString(value, ['categoryId', 'suggestedCategoryId']),
    categoryName: firstString(value, ['categoryName', 'category', 'suggestedCategory']),
    source: firstString(value, ['dataSource', 'source'], 'unknown'),
    status: firstString(value, ['reviewStatus', 'status'], 'needs_review'),
    weeklyGuidanceExclusionReason: firstString(value, ['weeklyGuidanceExclusionReason']),
    weeklyGuidanceActionable: value.weeklyGuidanceActionable === true,
    reason: firstString(value, ['reviewReason', 'reason', 'queueReason'], 'Rows stay outside planning until reviewed.'),
    note: firstString(value, ['note', 'reviewNote']),
  };
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatReviewAmount(value: string | number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Amount unavailable';
  return `${amount < 0 ? '−' : '+'}$${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function reviewStatusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function reviewSourceLabel(source: string) {
  if (source === 'manual') return 'Manual entry';
  if (source === 'csv_import') return 'CSV import';
  if (source === 'plaid') return 'Plaid';
  return humanize(source, 'Unknown source');
}

function TransactionReviewPage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [location] = useLocation();
  const reviewContext = useMemo(() => {
    const query = location.includes('?') ? location.slice(location.indexOf('?') + 1) : window.location.search.slice(1);
    const params = new URLSearchParams(query);
    return {
      periodId: params.get('periodId') ?? '',
      reason: params.get('reason') ?? '',
      month: params.get('month') ?? '',
    };
  }, [location]);
  const queueParams = reviewContext.periodId ? { periodId: reviewContext.periodId } : undefined;
  const queue = useListTransactionReviewQueue(queueParams, {
    query: {
      queryKey: getListTransactionReviewQueueQueryKey(queueParams),
      staleTime: 30 * 1000,
    },
  });
  const review = useReviewFinancialTransaction();
  const reviewWithReverification = useProviderProtectedAction(
    (input: Parameters<typeof review.mutateAsync>[0]) =>
      review.mutateAsync(input),
  );
  const budget = useGetBudget();
  const [filter, setFilter] = useState<'all' | 'needs_category' | 'guidance_reason'>(() => reviewContext.reason ? 'guidance_reason' : 'all');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});

  const rows = useMemo(() => normalizeReviewRows(queue.data).map(normalizeReviewRow), [queue.data]);
  const categoryOptions = useMemo(() => {
    const root = reviewRecord(queue.data);
    const supplied = Array.isArray(root.categories) ? root.categories.map(reviewRecord) : [];
    const budgetCategories = (budget.data?.categories ?? []).map((category) => ({ id: category.id, name: category.name }));
    const merged = [...budgetCategories, ...supplied.map((category) => ({
      id: firstString(category, ['id', 'categoryId']),
      name: firstString(category, ['name', 'categoryName']),
    }))].filter((category) => category.id && category.name);
    return Array.from(new Map(merged.map((category) => [category.id, category])).values());
  }, [budget.data?.categories, queue.data]);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const needsCategory = !row.categoryId && !row.categoryName;
      if (filter === 'needs_category' && !needsCategory) return false;
      if (filter === 'guidance_reason' && row.weeklyGuidanceExclusionReason !== reviewContext.reason) return false;
      if (!query) return true;
      return [row.merchant, row.description, row.account, row.categoryName].some((value) => value.toLowerCase().includes(query));
    });
  }, [filter, reviewContext.reason, rows, search]);
  const heldAmount = useMemo(() => rows.reduce((sum, row) => {
    const amount = Number(row.amount);
    return Number.isFinite(amount) ? sum + Math.abs(amount) : sum;
  }, 0), [rows]);
  const needsCategory = rows.filter((row) => !row.categoryId && !row.categoryName).length;

  const draftFor = (row: ReturnType<typeof normalizeReviewRow>): ReviewDraft =>
    drafts[row.id] ?? { categoryId: row.categoryId, note: row.note };
  const updateDraft = (id: string, next: Partial<ReviewDraft>) => {
    const row = rows.find((item) => item.id === id) ?? normalizeReviewRow({ id });
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(row), ...next } }));
  };
  const submitReview = async (row: ReturnType<typeof normalizeReviewRow>, status: TransactionReviewInput['status']) => {
    const draft = draftFor(row);
    try {
      const payload: TransactionReviewInput = { status };
      if (draft.categoryId) payload.categoryId = draft.categoryId;
      if (draft.note.trim()) payload.note = draft.note.trim();
      await reviewWithReverification({ transactionId: row.id, data: payload });
      setDrafts((current) => {
        const next = { ...current };
        delete next[row.id];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListTransactionReviewQueueQueryKey(queueParams) }),
        reviewContext.periodId
          ? queryClient.invalidateQueries({ queryKey: getGetWeeklyBudgetGuidanceQueryKey(reviewContext.periodId) })
          : Promise.resolve(),
      ]);
      await queue.refetch();
      onFeedback(`${row.merchant} was ${status === 'approved' ? 'approved and added to the household record' : status === 'needs_review' ? 'categorized and kept outside planning' : status === 'excluded' ? 'rejected and excluded from planning' : status === 'possible_transfer' ? 'marked as a transfer and kept outside planning' : 'marked as a business item and kept outside planning'}.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'This transaction could not be reviewed.');
    }
  };

  return <main className="content">
    <style>{`
      .review-intro { max-width: 650px; }
      .review-summary { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:1px; background:var(--line); overflow:hidden; }
      .review-summary-cell { background:rgba(255,253,248,.8); padding:20px 22px; }
      .review-summary-value { font:400 29px var(--app-font-serif); letter-spacing:-.045em; margin-top:7px; }
      .review-summary-detail { color:var(--ink-soft); font-size:11px; margin-top:3px; }
      .review-governance { display:flex; gap:12px; align-items:flex-start; padding:16px 18px; background:#e3ece4; border:1px solid #cfddd1; color:var(--ink); }
      .review-governance svg { flex:0 0 auto; margin-top:1px; color:#9b742e; }
      .review-governance strong { display:block; font-size:12px; }
      .review-governance span { display:block; margin-top:4px; color:#4e6b5e; font-size:11px; line-height:1.5; }
      .review-toolbar { display:flex; align-items:center; justify-content:space-between; gap:15px; margin-bottom:16px; flex-wrap:wrap; }
      .review-search { position:relative; min-width:235px; flex:1; max-width:360px; }
      .review-search svg { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--ink-soft); }
      .review-search input { width:100%; height:37px; border:1px solid var(--line); border-radius:7px; background:var(--paper); color:var(--ink); padding:0 12px 0 35px; outline:none; font-size:12px; }
      .review-search input:focus { border-color:var(--marigold); box-shadow:0 0 0 3px rgba(226,189,103,.16); }
      .review-list { display:grid; gap:11px; }
      .review-item { border:1px solid var(--line); background:rgba(255,253,248,.78); padding:19px; display:grid; grid-template-columns:minmax(0,1fr) minmax(250px,.72fr); gap:22px; }
      .review-item:hover { border-color:#cfc4b2; }
      .review-item-head { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
      .review-item-title { font-size:14px; font-weight:700; letter-spacing:-.02em; }
      .review-item-description { color:var(--ink-soft); font-size:11px; line-height:1.5; margin:6px 0 0; }
      .review-item-amount { font:400 24px var(--app-font-serif); letter-spacing:-.04em; white-space:nowrap; }
      .review-item-amount.negative { color:#9e5d47; }
      .review-item-meta { display:flex; gap:18px; flex-wrap:wrap; padding:18px 0 0; margin-top:17px; border-top:1px solid #eee9df; }
      .review-item-meta span { color:var(--ink-soft); display:block; font-size:10px; }
      .review-item-meta strong { color:var(--ink); display:block; font-size:11px; font-weight:600; margin-top:4px; }
      .review-item-reason { color:#785f32; background:#f7f0df; padding:9px 11px; margin-top:16px; font-size:10px; line-height:1.45; }
      .review-item-form { background:rgba(240,237,227,.55); padding:15px; border:1px solid #e7e0d4; }
      .review-form-label { display:block; color:var(--ink-soft); font:10px var(--app-font-mono); text-transform:uppercase; letter-spacing:.08em; margin-bottom:7px; }
      .review-item-form select, .review-item-form textarea { width:100%; border:1px solid var(--line); border-radius:6px; background:var(--paper); color:var(--ink); font-size:12px; padding:9px 10px; outline:none; }
      .review-item-form select:focus, .review-item-form textarea:focus { border-color:var(--marigold); }
      .review-item-form textarea { min-height:64px; resize:vertical; line-height:1.4; }
      .review-form-field + .review-form-field { margin-top:13px; }
      .review-form-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; }
      .review-form-foot span { color:var(--ink-soft); font-size:10px; line-height:1.35; }
      .review-action-group { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
      .review-action-secondary { display:flex; gap:15px; justify-content:flex-end; margin-top:13px; padding-top:11px; border-top:1px solid #e7e0d4; }
      .review-action-secondary .text-link { font-size:10px; }
      .review-empty { text-align:center; padding:46px 22px; border:1px dashed #cfc8b9; background:rgba(255,253,248,.48); }
      .review-empty svg { color:var(--marigold); }
      .review-empty h3 { font:400 25px var(--app-font-serif); margin:12px 0 7px; }
      .review-empty p { color:var(--ink-soft); font-size:12px; margin:0 auto; max-width:390px; line-height:1.55; }
      .review-error { display:flex; align-items:flex-start; gap:12px; }
      .review-error p { margin:4px 0 0; color:var(--ink-soft); font-size:11px; line-height:1.5; }
      @media (max-width: 700px) {
        .review-summary { grid-template-columns:1fr; }
        .review-item { grid-template-columns:1fr; gap:16px; }
        .review-toolbar { align-items:stretch; }
        .review-search { max-width:none; min-width:0; }
      }
    `}</style>
    <PageHeading
      eyebrow="Household finance / review queue"
      title={reviewContext.periodId ? <>Restore a verified<br /><em>guidance basis.</em></> : <>Give every row<br /><em>a clear place.</em></>}
      description={reviewContext.periodId ? `These ${reviewContext.month || 'monthly'} transactions are excluded from weekly guidance. The reason on each row comes from the same calculation used on Budget.` : 'Manual and imported transactions stay outside the plan until a household member reviews them. Approve a row with its category, or leave it here for a later pass.'}
      actions={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{reviewContext.periodId && <Link className="btn btn-primary" href={`/budget${reviewContext.month ? `?month=${encodeURIComponent(reviewContext.month)}` : ''}`} data-testid="link-return-to-budget">Return to Budget</Link>}<button className="btn" onClick={() => { void queue.refetch(); }} disabled={queue.isLoading} data-testid="button-refresh-transaction-review"><RotateCcw size={14} /> {queue.isLoading ? 'Refreshing…' : 'Refresh queue'}</button></div>}
    />
    <section className="review-governance animate-in delay-1" data-testid="banner-transaction-review-governance">
      <ShieldCheck size={17} />
       <div><strong>Planning stays conservative while this queue is open.</strong><span>Source records are read-only. Reviewing a row records a household decision; it does not move money or change the original transaction details.</span></div>
    </section>
    <section className="card review-summary page-section animate-in delay-1" data-testid="summary-transaction-review">
       <div className="review-summary-cell"><div className="mono-label">Awaiting review</div><div className="review-summary-value" data-testid="stat-transactions-awaiting-review">{rows.length}</div><div className="review-summary-detail">rows held outside planning</div></div>
      <div className="review-summary-cell"><div className="mono-label">Needs a category</div><div className="review-summary-value" data-testid="stat-transactions-needing-category">{needsCategory}</div><div className="review-summary-detail">rows without a household category</div></div>
      <div className="review-summary-cell"><div className="mono-label">Value held</div><div className="review-summary-value" data-testid="stat-transactions-value-held">{formatReviewAmount(heldAmount).replace('+', '')}</div><div className="review-summary-detail">absolute value of queued rows</div></div>
    </section>
    <section className="card card-pad page-section animate-in delay-2">
      <div className="review-toolbar">
        <div className="review-search"><Search size={14} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant, account, or category" aria-label="Search transaction review queue" data-testid="input-search-transaction-review" /></div>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className={`filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')} data-testid="button-filter-transaction-review-all">All rows</button>
          <button className={`filter-chip ${filter === 'needs_category' ? 'active' : ''}`} onClick={() => setFilter('needs_category')} data-testid="button-filter-transaction-review-needs-category">Needs category <span>({needsCategory})</span></button>
           {reviewContext.reason && <button className={`filter-chip ${filter === 'guidance_reason' ? 'active' : ''}`} onClick={() => setFilter('guidance_reason')} data-testid="button-filter-transaction-review-guidance-reason">{humanize(reviewContext.reason, reviewContext.reason)} <span>({rows.filter((row) => row.weeklyGuidanceExclusionReason === reviewContext.reason).length})</span></button>}
        </div>
      </div>
      {queue.isLoading && <div className="review-list" aria-label="Loading transaction review queue" data-testid="loading-transaction-review"><div className="review-item" style={{ minHeight: 155, opacity: .55 }} /><div className="review-item" style={{ minHeight: 155, opacity: .35 }} /></div>}
      {queue.isError && <div className="review-empty review-error" role="alert" data-testid="error-transaction-review"><ShieldAlert size={19} /><div><strong>Review queue unavailable</strong><p>{queue.error instanceof Error ? queue.error.message : 'The household review service could not be reached.'}</p><button className="btn btn-primary" style={{ marginTop: 15 }} onClick={() => { void queue.refetch(); }} data-testid="button-retry-transaction-review"><RotateCcw size={14} /> Try again</button></div></div>}
       {!queue.isLoading && !queue.isError && visibleRows.length === 0 && <div className="review-empty" data-testid="empty-transaction-review"><ClipboardCheck size={22} /><h3>{rows.length === 0 ? 'The ledger is caught up.' : 'No rows match this view.'}</h3><p>{rows.length === 0 ? 'New manual or imported transactions will appear here before they can influence household planning.' : 'Clear the search or choose All rows to see the rest of the queue.'}</p>{rows.length > 0 && <button className="btn" style={{ marginTop: 17 }} onClick={() => { setSearch(''); setFilter('all'); }} data-testid="button-clear-transaction-review-filters">Show all rows</button>}</div>}
      {!queue.isLoading && !queue.isError && visibleRows.length > 0 && <div className="review-list" data-testid="list-transaction-review">
        {visibleRows.map((row) => {
          const draft = draftFor(row);
          const amount = Number(row.amount);
          const eligibleForHouseholdReview = !reviewContext.periodId || row.weeklyGuidanceActionable;
          return <article className="review-item" key={row.id} data-testid={`card-transaction-review-${row.id}`}>
            <div>
              <div className="review-item-head">
                <div><div className="review-item-title" data-testid={`text-transaction-merchant-${row.id}`}>{row.merchant}</div><p className="review-item-description">{row.description}</p></div>
                <div className={`review-item-amount ${amount < 0 ? 'negative' : ''}`} data-testid={`text-transaction-amount-${row.id}`}>{formatReviewAmount(row.amount)}</div>
              </div>
              <div className="review-item-meta">
                <div><span>Date</span><strong>{formatReviewDate(row.date)}</strong></div>
                <div><span>Account</span><strong>{row.account}</strong></div>
                <div><span>Source</span><strong>{reviewSourceLabel(row.source)}</strong></div>
                <div><span>Status</span><strong><span className="status pending">{reviewStatusLabel(row.status)}</span></strong></div>
              </div>
              <div className="review-item-reason"><strong>{reviewContext.periodId ? 'Why weekly guidance excludes it' : 'Why it is here'}</strong> · {row.reason}</div>
            </div>
            <div className="review-item-form">
              <div className="review-form-field"><label className="review-form-label" htmlFor={`transaction-category-${row.id}`}>Household category</label><select id={`transaction-category-${row.id}`} value={draft.categoryId} disabled={!eligibleForHouseholdReview} onChange={(event) => updateDraft(row.id, { categoryId: event.target.value })} data-testid={`select-transaction-category-${row.id}`}><option value="">Leave uncategorized</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{categoryOptions.length === 0 && <span className="table-secondary">Categories will appear when household budget data is available.</span>}</div>
              <div className="review-form-field"><label className="review-form-label" htmlFor={`transaction-note-${row.id}`}>Review note <span>(optional)</span></label><textarea id={`transaction-note-${row.id}`} value={draft.note} onChange={(event) => updateDraft(row.id, { note: event.target.value })} maxLength={500} placeholder="What should the household remember?" data-testid={`textarea-transaction-note-${row.id}`} /></div>
              <div className="review-form-foot">
                <span>{eligibleForHouseholdReview ? 'Only approved rows can inform planning.' : 'This classification is read-only here and remains outside guidance.'}</span>
                <div className="review-action-group">
                  <button className="btn" onClick={() => { void submitReview(row, 'needs_review'); }} disabled={review.isPending || !eligibleForHouseholdReview} data-testid={`button-categorize-transaction-${row.id}`}><ClipboardCheck size={14} /> Save category</button>
                  <button className="btn btn-primary" onClick={() => { void submitReview(row, 'approved'); }} disabled={review.isPending || !draft.categoryId || !eligibleForHouseholdReview} data-testid={`button-approve-transaction-${row.id}`}><Check size={14} /> {review.isPending ? 'Saving…' : 'Approve & include'}</button>
                </div>
              </div>
              {!reviewContext.periodId && <div className="review-action-secondary">
                <button className="text-link danger" onClick={() => { void submitReview(row, 'excluded'); }} disabled={review.isPending} data-testid={`button-reject-transaction-${row.id}`}>Reject</button>
                <button className="text-link" onClick={() => { void submitReview(row, 'possible_transfer'); }} disabled={review.isPending} data-testid={`button-transfer-transaction-${row.id}`}>Mark transfer</button>
                <button className="text-link" onClick={() => { void submitReview(row, 'possible_business'); }} disabled={review.isPending} data-testid={`button-business-transaction-${row.id}`}>Mark business</button>
              </div>}
            </div>
          </article>;
        })}
      </div>}
    </section>
  </main>;
}

function MicroLivePage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const queryClient = useQueryClient();
  const household = useGetHousehold();
  const query = useGetMicroLive();
  const executionControl = useGetExecutionControl();
  const rehearsal = useRunMicroLiveRehearsal();
  const reconciliationRun = useRunMicroLiveReconciliation();
  const review = useReviewMicroLiveEnablement();
  const approveVenue = useApproveMicroLiveVenue();
  const armSession = useArmMicroLive();
  const incidentReview = useCreateMicroLiveIncidentReview();
  const completeRequirement = useCompleteMicroLiveReactivationRequirement();
  const runRehearsalWithReverification = useProviderProtectedAction(() => rehearsal.mutateAsync());
  const runReconciliationWithReverification = useProviderProtectedAction(() => reconciliationRun.mutateAsync());
  const reviewWithReverification = useProviderProtectedAction(() => review.mutateAsync());
  const approveVenueWithReverification = useProviderProtectedAction((input: MicroLiveVenueApprovalRequest & { venueId: string }) =>
    approveVenue.mutateAsync({ venueId: input.venueId, data: input }),
  );
  const armSessionWithReverification = useProviderProtectedAction((venueId: string) =>
    armSession.mutateAsync({ data: { venueId } }),
  );
  const incidentReviewWithReverification = useProviderProtectedAction((input: MicroLiveIncidentReviewInput & { incidentId: string }) =>
    incidentReview.mutateAsync({ incidentId: input.incidentId, data: input }),
  );
  const completeRequirementWithReverification = useProviderProtectedAction((requirementId: string) =>
    completeRequirement.mutateAsync({ requirementId }),
  );
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
      await approveVenueWithReverification({ ...venueApprovalDraft, marketPermissions, venueId: reviewingVenueId });
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
      const result = await armSessionWithReverification(armingVenueId);
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
      await incidentReviewWithReverification({ ...data, incidentId: reviewingIncidentId });
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
    <PageHeading eyebrow="Execution / Micro-Live" title={<>Containment before <span className="accent-text">connectivity.</span></>} description="A small, reviewable control plane for future Micro-Live experiments. This workspace transmits no orders and cannot access household capital." actions={<button className="btn btn-primary" onClick={async () => { await runRehearsalWithReverification(); await refresh(); onFeedback('Live rehearsal completed without transmitting an order.'); }} disabled={rehearsal.isPending}><RotateCcw size={14} /> {rehearsal.isPending ? 'Running…' : 'Run live rehearsal'}</button>} />
    <section className="micro-live-banner"><div className="micro-live-banner-icon"><Lock size={19} /></div><div><strong>Live execution is disabled</strong><span>Rehearsal mode only · credential values never displayed · no order transmission</span></div><span className="status review">DISABLED</span></section>
    <section className="card card-pad page-section"><CardTitle title="Authoritative execution control" subtitle="This state is persisted per household and evaluated before OMS order-intent creation." action={<span className={`status ${executionControl.data?.state === 'STOP' ? 'blocked' : 'review'}`}>{executionControl.isLoading ? 'Checking…' : executionControl.data?.state ?? 'Unavailable'}</span>} /><div className="protection-grid"><div><span>Server state</span><strong>{executionControl.data?.state ?? 'UNAVAILABLE'}</strong></div><div><span>Version</span><strong>{executionControl.data?.version ?? '—'}</strong></div><div><span>New order intents</span><strong>{executionControl.data?.executionPermitted ? 'Permitted only with Guardian + risk checks' : 'Denied'}</strong></div><div><span>Recovery</span><strong>Owner + recent verification</strong></div></div></section>
    <section className="micro-live-grid">
      <div className="card card-pad micro-live-status-card"><CardTitle title="Execution status" subtitle="Global fail-closed state" action={<Activity size={17} color="var(--blue)" />} /><div className="micro-live-status-value"><span className="status-pill">{snapshot.status}</span><strong>0</strong><small>open orders</small></div><div className="micro-live-stat-row"><span>Capital allocated</span><b>{money(snapshot.session.capitalAllocated)}</b></div><div className="micro-live-stat-row"><span>Current position</span><b>{snapshot.session.currentPosition}</b></div><div className="micro-live-stat-row"><span>Net P&amp;L</span><b>{money(snapshot.session.netPnl)}</b></div></div>
      <div className="card card-pad"><CardTitle title="Micro-Live sandbox" subtitle="Configurable policy · no leverage" action={<Gauge size={17} color="var(--green)" />} /><div className="micro-live-limit-grid"><div><span>Max venue</span><strong>{money(String(Number(snapshot.policy.limits.maxVenueCapitalCents ?? 1000) / 100))}</strong></div><div><span>Max strategy</span><strong>{money(String(Number(snapshot.policy.limits.maxStrategyCapitalCents ?? 1000) / 100))}</strong></div><div><span>Max order</span><strong>{money(String(Number(snapshot.policy.limits.maxIndividualOrderCents ?? 100) / 100))}</strong></div><div><span>Hard daily loss</span><strong>{money(String(Number(snapshot.policy.limits.hardDailyLossCents ?? 150) / 100))}</strong></div></div><div className="safety-inline"><CheckCircle2 size={15} /> Leverage, margin, borrowing, and auto-scale are off</div></div>
    </section>
    <section className="card card-pad page-section"><CardTitle title="Readiness gates" subtitle={`Live readiness ${snapshot.readiness.score}/100 · a high score never guarantees profitability`} action={<button className="btn" onClick={async () => { await reviewWithReverification(); onFeedback('Enablement review recorded. Live execution remains disabled.'); }} disabled={review.isPending}>{review.isPending ? 'Reviewing…' : 'Review gates'}</button>} /><div className="readiness-grid">{snapshot.readiness.checks.map((check) => <div className={`readiness-check ${check.passed ? 'passed' : 'blocked'}`} key={check.name}><span>{check.passed ? <CheckCircle2 size={15} /> : <ShieldAlert size={15} />}</span><span>{check.name}</span><b>{check.passed ? 'Pass' : 'Blocked'}</b></div>)}</div></section>
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
         <CardTitle title="Persistent reconciliation" subtitle={`Latest venue-authoritative run · ${latestRun ? new Date(latestRun.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not recorded'}`} action={<button className="btn" onClick={async () => { try { await runReconciliationWithReverification(); await refresh(); onFeedback('Reconciliation run persisted. No order transmission occurred.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'Reconciliation could not be recorded.'); } }} disabled={reconciliationRun.isPending}><RotateCcw size={13} /> {reconciliationRun.isPending ? 'Running…' : 'Run reconciliation'}</button>} />
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
       <div className="incident-list">{snapshot.incidents.map((incident) => <article className="incident-card" key={incident.id}><div className="incident-card-header"><div><span className={`status ${incident.severity === 'CRITICAL' ? 'critical' : 'pending'}`}>{incident.severity}</span><h3>{incident.title}</h3></div>{!incident.hasReview && <button className="btn btn-primary" onClick={() => startIncidentReview(incident.id)}>Record human review</button>}</div><p>{incident.timeline[0]}</p><div className="incident-meta"><span>{incident.incidentType.replaceAll('_', ' ')}</span><span>Capital impact {money(incident.capitalImpact)}</span><span>{incident.openRequirementCount} requirements open</span></div>{reviewingIncidentId === incident.id && <form className="incident-review-form" onSubmit={submitIncidentReview}><div className="field"><label>Root cause</label><textarea required rows={3} value={reviewDraft.rootCause} onChange={(event) => setReviewDraft({ ...reviewDraft, rootCause: event.target.value })} /></div><div className="field"><label>Capital impact</label><input required inputMode="decimal" pattern="-?[0-9]+([.][0-9]{1,2})?" value={reviewDraft.capitalImpact} data-testid="input-incident-review-capital-impact" onChange={(event) => setReviewDraft({ ...reviewDraft, capitalImpact: event.target.value })} /></div><div className="field"><label>Safeguards that worked <span>(one per line)</span></label><textarea rows={2} value={reviewText.safeguardsWorked} onChange={(event) => setReviewText({ ...reviewText, safeguardsWorked: event.target.value })} /></div><div className="field"><label>Required fixes <span>(one per line)</span></label><textarea required rows={2} value={reviewText.requiredFixes} onChange={(event) => setReviewText({ ...reviewText, requiredFixes: event.target.value })} /></div><div className="field"><label>Reactivation requirements <span>(one per line)</span></label><textarea required rows={3} value={reviewText.reactivationRequirements} onChange={(event) => setReviewText({ ...reviewText, reactivationRequirements: event.target.value })} /></div><div className="field"><label>Review notes <span>(optional)</span></label><textarea rows={2} value={reviewDraft.notes ?? ''} onChange={(event) => setReviewDraft({ ...reviewDraft, notes: event.target.value })} /></div><div className="modal-actions"><button type="button" className="btn" onClick={() => setReviewingIncidentId(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={incidentReview.isPending}><Check size={14} /> {incidentReview.isPending ? 'Saving…' : 'Save review'}</button></div></form>}</article>)}</div>
     </section>
     <section className="micro-live-columns page-section">
       <div className="card card-pad"><CardTitle title="Post-incident reviews" subtitle="A review records what happened without granting permission to trade" action={<ScrollText size={17} color="var(--ink-soft)" />} />{snapshot.incidentReviews.length === 0 && <div className="micro-live-empty">No post-incident reviews recorded.</div>}<div className="review-list">{snapshot.incidentReviews.map((item) => <div className="review-row" key={item.id}><div><strong>{item.rootCause}</strong><span>{new Date(item.reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {item.requiredFixes.length} fixes recorded</span></div><span className="status review">Human review</span></div>)}</div></div>
       <div className="card card-pad"><CardTitle title="Human reactivation requirements" subtitle="Completing these records does not arm or enable live execution" action={<ShieldAlert size={17} color="var(--amber)" />} />{openRequirements.length === 0 && <div className="micro-live-empty"><CheckCircle2 size={17} /><div><strong>No open requirements</strong><span>Any future reactivation still requires a separate human arming review.</span></div></div>}<div className="requirement-list">{snapshot.reactivationRequirements.map((requirement) => <div className="requirement-row" key={requirement.id}><div><strong>{requirement.requirement}</strong><span className={`status ${requirement.status === 'COMPLETE' ? '' : 'pending'}`}>{requirement.status}</span></div>{requirement.status !== 'COMPLETE' && <button className="text-link" onClick={async () => { try { await completeRequirementWithReverification(requirement.id); await refresh(); onFeedback('Reactivation requirement marked complete. Live execution remains disabled.'); } catch (error) { onFeedback(error instanceof Error ? error.message : 'The requirement could not be completed.'); } }} disabled={completeRequirement.isPending}>Mark complete</button>}</div>)}</div></div>
     </section>
    <section className="card card-pad page-section"><CardTitle title="Rehearsal timeline" subtitle="Production-shaped flow with no order transmission" action={<History size={17} color="var(--ink-soft)" />} /><div className="execution-timeline">{snapshot.rehearsal.sequence.map((event, index) => <div className="timeline-step" key={event}><span>{String(index + 1).padStart(2, '0')}</span><strong>{event.replaceAll(/([A-Z])/g, ' $1').trim()}</strong>{index < snapshot.rehearsal.sequence.length - 1 && <ChevronRight size={14} />}</div>)}</div><div className="rehearsal-note"><CheckCircle2 size={16} /> {snapshot.rehearsal.note}</div></section>
    <section className="card card-pad page-section"><CardTitle title="Protection summary" subtitle="The order of priorities remains containment, state accuracy, risk, reliability, execution, then return." /><div className="protection-grid">{[['Household capital', snapshot.safety.householdCapitalAccessible ? 'Accessible' : 'Inaccessible'], ['Protected capital', snapshot.safety.protectedCapitalAccessible ? 'Accessible' : 'Inaccessible'], ['AI order authority', snapshot.safety.aiCanPlaceOrders ? 'Allowed' : 'Not allowed'], ['Risk rule changes', snapshot.safety.aiCanChangeRisk ? 'Allowed' : 'Not allowed'], ['Auto scaling', snapshot.safety.autoScale ? 'Enabled' : 'Disabled'], ['Order transmission', snapshot.safety.liveOrderTransmissionEnabled ? 'Enabled' : 'Disabled']].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
  </main>;
}

function ActionModal({ kind, close, onComplete }: { kind: Exclude<ModalKind, null>; close: () => void; onComplete: (kind: Exclude<ModalKind, null>, values: { amount?: number; name?: string; note?: string; idempotencyKey?: string }) => void | Promise<void> }) {
  const copy = {
    contribution: { title: 'Record a contribution', desc: 'Add a movement to your weekly capital rhythm.', submit: 'Save contribution' },
    transfer: { title: 'Move capital with purpose', desc: 'A transfer is just a change of job—not a change of plan.', submit: 'Save transfer' },
    strategy: { title: 'Make space for a strategy', desc: 'Prepare a note for the next useful conversation or review. This quick action is local-only.', submit: 'Prepare note' },
    property: { title: 'Add a property note', desc: 'Prepare a local note; no property record will be changed by this quick action.', submit: 'Prepare note' },
  }[kind];
  const [amount, setAmount] = useState(kind === 'contribution' ? '250' : '');
  const [name, setName] = useState(kind === 'property' ? 'Separate utilities' : kind === 'strategy' ? 'Review duplex criteria' : '');
  const [note, setNote] = useState('');
  const idempotencyKey = useRef(kind === 'contribution' ? `web-${crypto.randomUUID()}` : '');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    if ((kind === 'contribution' || kind === 'transfer') && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) return;
    setSubmitting(true);
    try {
      await onComplete(kind, { amount: amount ? Number(amount) : undefined, name, note, idempotencyKey: idempotencyKey.current || undefined });
    } finally {
      setSubmitting(false);
    }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !submitting) close(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="eyebrow">Capital OS / quick action</div><h2 id="modal-title">{copy.title}</h2><p>{copy.desc}</p></div><button className="icon-btn" aria-label="Close dialog" data-testid="button-close-modal" onClick={close} disabled={submitting}><X size={17} /></button></div><form className="modal-form" onSubmit={(event) => { void submit(event); }}>{(kind === 'contribution' || kind === 'transfer') && <div className="field"><label>Amount</label><input autoFocus required inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} data-testid="input-action-amount" placeholder="250" /></div>}{kind === 'contribution' && <div className="field"><label>Allocation rule</label><div className="field-help">The active household allocation rule applies server-side; this contribution is not manually routed to a sleeve.</div></div>}{(kind === 'strategy' || kind === 'property') && <div className="field"><label>{kind === 'property' ? 'Note title' : 'Strategy title'}</label><input autoFocus required value={name} onChange={(event) => setName(event.target.value)} data-testid="input-action-name" /></div>}<div className="field"><label>Note <span style={{ textTransform:'none', letterSpacing:0 }}>(optional)</span></label><textarea value={note} onChange={(event) => setNote(event.target.value)} data-testid="textarea-action-note" placeholder="A little context for later..." /></div><div className="modal-actions"><button type="button" className="btn" data-testid="button-cancel-modal" onClick={close} disabled={submitting}>Cancel</button><button type="submit" className="btn btn-primary" data-testid="button-submit-modal" disabled={submitting}><Check size={14} /> {submitting ? 'Saving…' : copy.submit}</button></div></form></div></div>;
}

function FamilyOfficePage({ onFeedback }: { onFeedback: (message: string) => void }) {
  const query = useGetFamilyOffice();
  const research = useCreateFamilyOfficeResearch();
  const decide = useDecideFamilyOfficeProposal();
  const createPortfolio = useCreateShadowPortfolio();
  const createIntent = useCreateShadowIntent();
  const [researchDraft, setResearchDraft] = useState({ scope: 'family office intelligence', prompt: '', analyst: 'CIO analyst' });
  const [portfolioDraft, setPortfolioDraft] = useState({ name: '', benchmark: 'SPY', strategy: '' });
  const [intentDraft, setIntentDraft] = useState({ proposalId: '', shadowPortfolioId: '', symbol: '', direction: 'neutral' as ShadowIntentInputDirection, hypotheticalQuantity: '1', hypotheticalNotional: '1000.00', referencePrice: '100', timeHorizon: '12 months' });
  const snapshot = query.data;
  const proposals = snapshot?.proposals ?? [];
  const shadowPortfolios = snapshot?.shadowPortfolios ?? [];
  const activeProposal = proposals.find((proposal) => proposal.id === intentDraft.proposalId) ?? proposals[0];
  const activePortfolio = shadowPortfolios.find((portfolio) => portfolio.id === intentDraft.shadowPortfolioId) ?? shadowPortfolios[0];

  useEffect(() => {
    if (activeProposal && !intentDraft.proposalId) setIntentDraft((draft) => ({ ...draft, proposalId: activeProposal.id }));
    if (activePortfolio && !intentDraft.shadowPortfolioId) setIntentDraft((draft) => ({ ...draft, shadowPortfolioId: activePortfolio.id }));
  }, [activeProposal, activePortfolio, intentDraft.proposalId, intentDraft.shadowPortfolioId]);

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: getGetFamilyOfficeQueryKey() }); };
  const runResearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!researchDraft.prompt.trim()) return;
    try {
      await research.mutateAsync({ data: researchDraft });
      setResearchDraft({ ...researchDraft, prompt: '' });
      await refresh();
      onFeedback('Research completed as advisory evidence. No order or capital action was created.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'Family Office research is unavailable. No research was recorded.');
    }
  };
  const decideWithReverification = useProviderProtectedAction((proposalId: string, decision: FamilyOfficeProposalDecisionInputDecision) =>
    decide.mutateAsync({ proposalId, data: { decision, reason: `Human Family Office review: ${decision.replaceAll('_', ' ')}.` } }),
  );
  const recordDecision = async (proposalId: string, decision: FamilyOfficeProposalDecisionInputDecision) => {
    try {
      await decideWithReverification(proposalId, decision);
      await refresh();
      onFeedback(`Proposal marked ${decision.replaceAll('_', ' ')}. It remains Shadow-only.`);
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The proposal decision could not be recorded.');
    }
  };
  const submitPortfolio = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const portfolio = await createPortfolio.mutateAsync({ data: portfolioDraft });
      setPortfolioDraft({ name: '', benchmark: 'SPY', strategy: '' });
      setIntentDraft((draft) => ({ ...draft, shadowPortfolioId: portfolio.id }));
      await refresh();
      onFeedback('Hypothetical Shadow portfolio created. It is not a household asset.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The Shadow portfolio could not be created.');
    }
  };
  const submitIntent = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeProposal || !activePortfolio) {
      onFeedback('Create a Shadow portfolio and review a proposal before recording an intent.');
      return;
    }
    try {
      await createIntent.mutateAsync({
        data: {
          ...intentDraft,
          proposalId: activeProposal.id,
          shadowPortfolioId: activePortfolio.id,
          hypotheticalQuantity: Number(intentDraft.hypotheticalQuantity),
          referencePrice: Number(intentDraft.referencePrice),
        },
      });
      await refresh();
      onFeedback('Hypothetical intent recorded. It was not transmitted and cannot reach OMS or household capital.');
    } catch (error) {
      onFeedback(error instanceof Error ? error.message : 'The Shadow intent could not be recorded.');
    }
  };

  if (query.isLoading) return <main className="content"><PageHeading eyebrow="Family Office / intelligence" title={<>Research before<br /><em>exposure.</em></>} description="Loading the household-scoped intelligence workspace." /><div className="card card-pad">Reading provider status and advisory records…</div></main>;
  if (query.isError || !snapshot) return <main className="content"><PageHeading eyebrow="Family Office / intelligence" title={<>Research before<br /><em>exposure.</em></>} description="Grok intelligence is subordinate to Capital OS and fails closed when unavailable." /><section className="card card-pad dashboard-data-state unavailable" role="alert"><ShieldAlert size={22} /><h2>Family Office unavailable</h2><p>No advisory records are shown because the household service did not respond.</p><button className="btn btn-primary" onClick={() => { void query.refetch(); }}>Try again</button></section></main>;

  return <main className="content">
    <PageHeading eyebrow="Family Office / intelligence gateway" title={<>Research before<br /><em>exposure.</em></>} description="A household-scoped analyst room for research, explanation, and Shadow-only review. Capital OS remains the authority for financial facts, readiness, risk, and execution." actions={<span className="status"><ShieldCheck size={13} /> Advisory only</span>} />
    <section className="card card-pad animate-in delay-1">
      <CardTitle title="Provider boundary" subtitle="xAI/Grok is server-side, optional, and fail-closed." action={<span className={`status ${snapshot.provider.state === 'ready' ? '' : 'pending'}`}>{snapshot.provider.state}</span>} />
      <div className="protection-grid">
        <div><span>Provider model</span><strong>{snapshot.provider.model}</strong></div>
        <div><span>Live execution</span><strong>Disabled</strong></div>
        <div><span>Real orders sent</span><strong>{snapshot.summary.realOrdersSent}</strong></div>
        <div><span>Money moved</span><strong>{snapshot.summary.moneyMovedCents}¢</strong></div>
      </div>
      {snapshot.provider.state === 'disabled' && <div className="lab-disabled-note"><Lock size={13} /> Provider is disabled or not configured. No synthetic research is shown; deterministic Capital OS intelligence remains available elsewhere.</div>}
      <div className="safety-inline"><ShieldCheck size={15} /> {snapshot.guardrails[0] ?? 'Research may not move money, place orders, alter risk, or unlock protected capital.'}</div>
    </section>

    <section className="section-grid page-section">
      <section className="card card-pad animate-in delay-2">
        <CardTitle title="Commission an analyst" subtitle="Prompts are sanitized server-side and stored without credentials." action={<Sparkles size={17} color="var(--ink-soft)" />} />
        <form className="account-form" onSubmit={runResearch}>
          <div className="field"><label>Scope</label><input required maxLength={120} value={researchDraft.scope} onChange={(event) => setResearchDraft({ ...researchDraft, scope: event.target.value })} /></div>
          <div className="field"><label>Analyst</label><input maxLength={80} value={researchDraft.analyst} onChange={(event) => setResearchDraft({ ...researchDraft, analyst: event.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Research question</label><textarea required maxLength={4000} rows={5} value={researchDraft.prompt} onChange={(event) => setResearchDraft({ ...researchDraft, prompt: event.target.value })} placeholder="Compare current Florida tax-lien market signals with this household's property buy box. Separate facts, assumptions, and unknowns." /></div>
          <button className="btn btn-primary" type="submit" disabled={research.isPending || snapshot.provider.state === 'disabled'}><Sparkles size={14} /> {research.isPending ? 'Researching…' : 'Run advisory research'}</button>
        </form>
      </section>
      <section className="card card-pad animate-in delay-2">
        <CardTitle title="Safety contract" subtitle="These boundaries are not configurable from the intelligence workspace." />
        <div className="logic-grid">{snapshot.guardrails.map((guardrail) => <div key={guardrail}><span><Lock size={12} /> Guardrail</span><p>{guardrail}</p></div>)}</div>
      </section>
    </section>

    <section className="card card-pad page-section animate-in delay-3">
      <CardTitle title="Analyst proposals" subtitle={`${proposals.length} household-scoped proposal${proposals.length === 1 ? '' : 's'} · facts and uncertainty remain visible`} action={<span className="mono-label">Human review required</span>} />
      {proposals.length === 0 ? <div className="empty-state"><BookOpen size={19} /><strong>No proposals yet</strong><span>Run a research question to create an advisory proposal when the provider is available.</span></div> : <div className="journal-list">{proposals.map((proposal) => <article key={proposal.id}><div className="journal-date"><span className={`status ${proposal.status === 'proposed' ? 'pending' : ''}`}>{proposal.status}</span><br />{new Date(proposal.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div><div><div className="card-title-row"><div><h3>{proposal.title}</h3><span className="intelligence-confidence">{proposal.label} · {proposal.analyticalDirection} · {proposal.confidence.toFixed(0)}% confidence</span></div><span className="status">No execution authority</span></div><p>{proposal.thesis}</p><div className="logic-grid"><div><span>Facts</span><p>{proposal.facts.join(' · ') || 'None recorded'}</p></div><div><span>Assumptions</span><p>{proposal.assumptions.join(' · ') || 'None recorded'}</p></div><div><span>Risks</span><p>{proposal.risks.join(' · ') || 'None recorded'}</p></div></div>{proposal.status === 'proposed' && <div className="heading-actions"><button className="btn" onClick={() => { void recordDecision(proposal.id, 'watch'); }} disabled={decide.isPending}>Watch</button><button className="btn" onClick={() => { void recordDecision(proposal.id, 'request_more_research'); }} disabled={decide.isPending}>Request more research</button><button className="btn btn-primary" onClick={() => { void recordDecision(proposal.id, 'approve_shadow'); }} disabled={decide.isPending}>Approve Shadow review</button></div>}</div></article>)}</div>}
    </section>

    <section className="section-grid page-section">
      <section className="card card-pad">
        <CardTitle title="Shadow portfolio" subtitle="Hypothetical tracking only · never a household asset" action={<BarChart3 size={17} color="var(--ink-soft)" />} />
        <form className="account-form" onSubmit={submitPortfolio}>
          <div className="field"><label>Name</label><input required maxLength={120} value={portfolioDraft.name} onChange={(event) => setPortfolioDraft({ ...portfolioDraft, name: event.target.value })} placeholder="Florida tax-lien watchlist" /></div>
          <div className="field"><label>Benchmark</label><input maxLength={120} value={portfolioDraft.benchmark} onChange={(event) => setPortfolioDraft({ ...portfolioDraft, benchmark: event.target.value })} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Strategy note</label><textarea maxLength={500} rows={3} value={portfolioDraft.strategy} onChange={(event) => setPortfolioDraft({ ...portfolioDraft, strategy: event.target.value })} /></div>
          <button className="btn btn-primary" type="submit" disabled={createPortfolio.isPending}>{createPortfolio.isPending ? 'Creating…' : 'Create Shadow portfolio'}</button>
        </form>
        <div className="review-list">{shadowPortfolios.map((portfolio) => <div className="review-row" key={portfolio.id}><div><strong>{portfolio.name}</strong><span>{portfolio.strategy || 'No strategy note'} · benchmark {portfolio.benchmark}</span></div><span className="status">{portfolio.liveExecutionEnabled ? 'Blocked by policy' : 'Shadow only'}</span></div>)}</div>
      </section>
      <section className="card card-pad">
        <CardTitle title="Hypothetical intent" subtitle="Records a research scenario; it is never transmitted." action={<Activity size={17} color="var(--ink-soft)" />} />
        <form className="account-form" onSubmit={submitIntent}>
          <div className="field"><label>Proposal</label><select value={intentDraft.proposalId} onChange={(event) => setIntentDraft({ ...intentDraft, proposalId: event.target.value })}>{proposals.filter((proposal) => proposal.status !== 'rejected').map((proposal) => <option key={proposal.id} value={proposal.id}>{proposal.title}</option>)}</select></div>
          <div className="field"><label>Shadow portfolio</label><select value={intentDraft.shadowPortfolioId} onChange={(event) => setIntentDraft({ ...intentDraft, shadowPortfolioId: event.target.value })}>{shadowPortfolios.map((portfolio) => <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>)}</select></div>
          <div className="field"><label>Symbol</label><input required maxLength={32} value={intentDraft.symbol} onChange={(event) => setIntentDraft({ ...intentDraft, symbol: event.target.value.toUpperCase() })} placeholder="T-BILL" /></div>
          <div className="field"><label>Direction</label><select value={intentDraft.direction} onChange={(event) => setIntentDraft({ ...intentDraft, direction: event.target.value as ShadowIntentInputDirection })}><option value="neutral">Neutral</option><option value="long">Long</option><option value="short">Short</option></select></div>
          <div className="field"><label>Notional</label><input required inputMode="decimal" value={intentDraft.hypotheticalNotional} onChange={(event) => setIntentDraft({ ...intentDraft, hypotheticalNotional: event.target.value })} /></div>
          <div className="field"><label>Reference price</label><input required inputMode="decimal" value={intentDraft.referencePrice} onChange={(event) => setIntentDraft({ ...intentDraft, referencePrice: event.target.value })} /></div>
          <div className="field"><label>Quantity</label><input required inputMode="decimal" value={intentDraft.hypotheticalQuantity} onChange={(event) => setIntentDraft({ ...intentDraft, hypotheticalQuantity: event.target.value })} /></div>
          <div className="field"><label>Time horizon</label><input required maxLength={120} value={intentDraft.timeHorizon} onChange={(event) => setIntentDraft({ ...intentDraft, timeHorizon: event.target.value })} /></div>
          <button className="btn btn-primary" type="submit" disabled={createIntent.isPending || !activeProposal || !activePortfolio}>{createIntent.isPending ? 'Recording…' : 'Record Shadow intent'}</button>
        </form>
        <div className="review-list">{snapshot.shadowIntents.slice(0, 5).map((intent) => <div className="review-row" key={intent.id}><div><strong>{intent.direction.toUpperCase()} {intent.symbol}</strong><span>{intent.hypotheticalNotional} · {intent.timeHorizon}</span></div><span className="status">{intent.transmitted ? 'Blocked' : 'Not transmitted'}</span></div>)}</div>
      </section>
    </section>
  </main>;
}

function AppRouter({ onAction, onFeedback, transactions, dashboard, dashboardState, contributionsLoading, contributionsUnavailable, onRetry }: { onAction: (kind: Exclude<ModalKind, null>) => void; onFeedback: (message: string) => void; transactions: Transaction[]; dashboard?: DashboardSnapshot; dashboardState: 'loading' | 'unavailable' | 'empty' | 'ready'; contributionsLoading: boolean; contributionsUnavailable: boolean; onRetry: () => void }) {
  return <Switch>
    <Route path="/" component={() => <Dashboard onAction={onAction} onFeedback={onFeedback} transactions={transactions} dashboard={dashboard} dashboardState={dashboardState} contributionsLoading={contributionsLoading} contributionsUnavailable={contributionsUnavailable} onRetry={onRetry} />} />
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
    <Route path="/financing" component={() => <FinancingPage onFeedback={onFeedback} />} />
    <Route path="/risk" component={() => <RiskPage onFeedback={onFeedback} />} />
    <Route path="/settings" component={() => <SettingsPage onFeedback={onFeedback} />} />
     <Route path="/transactions" component={() => <TransactionReviewPage onFeedback={onFeedback} />} />
     <Route path="/contributions" component={() => <UtilityPage kind="contributions" onAction={onAction} transactions={transactions} dashboard={dashboard} />} />
    <Route path="/reports" component={() => <UtilityPage kind="reports" onAction={onAction} transactions={transactions} />} />
    <Route path="/documents" component={() => <UtilityPage kind="documents" onAction={onAction} transactions={transactions} />} />
     <Route path="/insights" component={() => <IntelligencePage onFeedback={onFeedback} />} />
     <Route path="/family-office" component={() => <FamilyOfficePage onFeedback={onFeedback} />} />
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
  const apiTransactions = useMemo(() => {
    return (contributionsQuery.data ?? []).flatMap((item, index) => {
      const split = item.metadata?.split as Record<string, number | string> | undefined;
      const destinations: Array<[string, number | string | undefined]> = [
        ['Duplex Reserve', split?.duplex] as [string, number | string | undefined],
        ['Capital OS', split?.capitalOs] as [string, number | string | undefined],
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
  }, [contributionsQuery.data]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(''), 3200); return () => window.clearTimeout(timeout); }, [toast]);
  const notify = (message: string) => setToast(message);
  const complete = async (kind: Exclude<ModalKind, null>, values: { amount?: number; name?: string; note?: string; idempotencyKey?: string }) => {
    const labels = { contribution: 'Contribution recorded', transfer: 'Transfer draft prepared', strategy: 'Strategy note prepared', property: 'Property note prepared' };
    if (kind === 'contribution') {
      try {
        await createContribution(
          { amount: (values.amount || 0).toFixed(2) },
          { headers: { 'Idempotency-Key': values.idempotencyKey || `web-${crypto.randomUUID()}` } },
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
  const state = dashboardDataState(dashboardQuery.data, dashboardQuery.isLoading, dashboardQuery.isError);
  return <TooltipProvider><RoutedErrorBoundary><AppShell onAction={setModal} onFeedback={notify} menuOpen={menuOpen} setMenuOpen={setMenuOpen}><AppRouter onAction={setModal} onFeedback={notify} transactions={apiTransactions} dashboard={dashboardQuery.data} dashboardState={state} contributionsLoading={contributionsQuery.isLoading} contributionsUnavailable={contributionsQuery.isError} onRetry={() => { void dashboardQuery.refetch(); }} /></AppShell></RoutedErrorBoundary>{modal && <ActionModal kind={modal} close={() => setModal(null)} onComplete={complete} />}{toast && <div className="toast-note" role="status" data-testid="status-action-feedback">{toast}</div>}</TooltipProvider>;
}

function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /><Toaster /></WouterRouter>;
}

export default App;