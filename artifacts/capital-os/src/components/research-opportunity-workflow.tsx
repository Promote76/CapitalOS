import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  Eye,
  FileSearch,
  Filter,
  LockKeyhole,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

export type ResearchView = "Income" | "Compounders" | "Balanced";

export type FactorSubScores = {
  quality: number;
  valuation: number;
  momentum: number;
  resilience: number;
};

export type ResearchOpportunity = {
  ticker: string;
  companyName: string;
  platinumScore: number;
  category: string;
  thesis: string;
  whyNow: string;
  redFlags: string[];
  evidenceFreshness: string;
  portfolioFit: string;
  concentrationImpact: string;
  maximumExposure: string;
  bullCase: string;
  baseCase: string;
  bearCase: string;
  invalidationConditions: string[];
  protectedCapitalStatus: string;
  humanReviewStatus: string;
  factorSubScores: FactorSubScores;
  sourceCount: number;
  advisoryOnly: boolean;
  noExecution: boolean;
  evidence: ResearchOpportunityEvidence[];
};

export type ResearchOpportunityEvidence = {
  id: string;
  title: string;
  sourceKind: string;
  reviewedAt: string | Date;
  freshness: string;
  reviewStatus: string;
  canonicalSha256?: string;
  provider?: string | null;
  sourceUrl?: string | null;
  retrievedAt?: string | Date | null;
  filingDate?: string | Date | null;
};

function formatEvidenceDate(value: string | Date | null | undefined) {
  if (!value) return "Unknown";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}

export type ResearchWorkflowState = "idle" | "loading" | "error" | "ready" | "stale" | "empty";

export type ResearchManualAction = "Skip" | "Watch" | "Review" | "Shadow" | "Open in Schwab";
export type ResearchRefine = {
  minScore?: number;
  portfolioFit?: "Constructive" | "Review" | "Caution";
};

export type ResearchDiscoverySummary = {
  status: "COMPLETED" | "LIMITED";
  universe: string;
  universeLabel: string;
  cursorVersion: string;
  domesticOnly: true;
  classificationUnknownExcluded: true;
  progress: {
    phase: "COMPLETED";
    completed: number;
    total: number;
    message: string;
  };
  knownUniverseCount: number;
  source: {
    provider: string;
    title: string;
    url: string;
    version: string;
    retrievedAt: string;
    sourceSha256: string;
    classificationPolicyVersion: string;
    issuerClassificationSource: string;
  };
  rawSourceRowCount: number;
  availableSymbolCount: number;
  sourceExclusions: {
    total: number;
    counts: Record<string, number>;
  };
  runOffset: number;
  runCap: number;
  selected: number;
  screened: number;
  symbolsSelected: number;
  symbolsScreened: number;
  symbolsEligible: number;
  symbolsExcluded: number;
  successfulSchwabEnrichments: number;
  providerFailures: number;
  schwabFailures: number;
  secFailures: number;
  providerOmissions: number;
  pendingReview: number;
  approvedEligible: number;
  finalCandidates: number;
  nextOffset: number | null;
  limitations: string[];
  finalCandidateCount: number;
  marketDraftsCreated: number;
  secDraftsCreated: number;
  secSnapshotsReused: number;
  exclusionReasons: Array<{ code: string; count: number; message: string }>;
  provider: {
    schwabConnectionStatus: "LIVE_CONNECTED";
    schwabTokenStatus: "CURRENT";
    schwabLastSuccessfulReadAt: string | null;
    schwabFreshness: "REFRESHED" | "NOT_REFRESHED";
    secStatus: "REFRESHED" | "CURRENT" | "LIMITED";
    coverageStatus: "COMPLETE_BOUNDED_RUN" | "LIMITED";
    providerWideDiscovery: false;
    universeProvider: "SEC";
    schwabSuppliedUniverse: false;
    symbolLimit: number;
    rateLimit: {
      limit: number | null;
      remaining: number | null;
      resetAt: string | null;
      retryAfterSeconds: number | null;
    } | null;
  };
};

export type ResearchOpportunityWorkflowProps = {
  universe: string;
  customSymbols?: string;
  onUniverseChange: (universe: string) => void;
  onCustomSymbolsChange: (symbols: string) => void;
  activeView: ResearchView;
  opportunities: ResearchOpportunity[];
  selectedTickers: string[];
  state?: ResearchWorkflowState;
  errorMessage?: string;
  lastUpdated?: string;
  onViewSelect: (view: ResearchView) => void;
  onSelectCandidate: (ticker: string, selected: boolean) => void;
  onCompare: (tickers: string[]) => void;
  onManualAction: (action: ResearchManualAction, opportunity: ResearchOpportunity) => void;
  onRetry?: () => void;
  onDiscoveryChange?: (query: string) => void;
  onRefineChange?: (refine: ResearchRefine) => void;
  refine?: ResearchRefine;
  onDiscover?: () => void;
  discoverPending?: boolean;
  discoverySummary?: ResearchDiscoverySummary | null;
  discoveryError?: string | null;
  totalEligible?: number;
  diagnostics?: {
    currentMarketEvidence: number;
    currentSecEvidence: number;
    excludedStale: number;
    excludedMissingSource: number;
    excludedUnapproved: number;
    excludedTickerMismatch: number;
    duplicateEvidence: number;
  };
  className?: string;
};

type MetricProps = {
  label: string;
  value: string;
  tone?: "quiet" | "positive" | "caution";
};

const views: ResearchView[] = ["Income", "Compounders", "Balanced"];

function scoreTone(score: number) {
  if (score >= 85) return "text-[#236b59] bg-[#e8f3ed]";
  if (score >= 70) return "text-[#956b1f] bg-[#fbf4df]";
  return "text-[#a14438] bg-[#f9ece8]";
}

function compactScore(score: number) {
  return Math.round(score);
}

function Metric({ label, value, tone = "quiet" }: MetricProps) {
  const toneClass =
    tone === "positive"
      ? "text-[#236b59]"
      : tone === "caution"
        ? "text-[#9a6e23]"
        : "text-[#23463e]";
  return (
    <div className="min-w-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.13em] text-[#71877f]">{label}</div>
      <div className={`mt-1 truncate text-[12px] font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "safe" | "caution" | "alert" }) {
  const toneClass = {
    neutral: "border-[#d8e1da] bg-[#f6f8f4] text-[#58716a]",
    safe: "border-[#c3dccc] bg-[#edf6ef] text-[#236b59]",
    caution: "border-[#ead6a4] bg-[#fff8e7] text-[#906722]",
    alert: "border-[#ebc9c3] bg-[#fdf0ed] text-[#a14438]",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium leading-none ${toneClass}`}>{children}</span>;
}

function FactorBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[72px_1fr_28px] items-center gap-2">
      <span className="text-[10px] text-[#58716a]">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e7eee7]" aria-label={`${label} score ${value} out of 100`}>
        <div className="h-full rounded-full bg-[#b99345] transition-[width] duration-500 ease-out" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
      </div>
      <span className="font-mono text-[10px] text-[#23463e]">{value}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-[#e3ded1] bg-[#fffdfa] p-4" aria-label="Loading opportunity">
      <div className="flex justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-16 rounded bg-[#e7eee7]" />
          <div className="h-3 w-32 rounded bg-[#edf1eb]" />
        </div>
        <div className="h-10 w-12 rounded-lg bg-[#edf1eb]" />
      </div>
      <div className="mt-5 h-3 w-full rounded bg-[#edf1eb]" />
      <div className="mt-2 h-3 w-4/5 rounded bg-[#edf1eb]" />
      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="h-8 rounded bg-[#f1f4ef]" />
        <div className="h-8 rounded bg-[#f1f4ef]" />
        <div className="h-8 rounded bg-[#f1f4ef]" />
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  selected,
  onSelect,
  onOpen,
}: {
  opportunity: ResearchOpportunity;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onOpen: () => void;
}) {
  const score = compactScore(opportunity.platinumScore);
  return (
    <article
      className={`group relative flex min-h-[286px] cursor-pointer flex-col rounded-xl border bg-[#fffdfa] p-4 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#b9cdbd] hover:shadow-[0_14px_30px_rgba(35,70,62,0.08)] ${
        selected ? "border-[#236b59] ring-1 ring-[#236b59]/20" : "border-[#e3ded1]"
      }`}
      onClick={onOpen}
      data-testid={`card-opportunity-${opportunity.ticker}`}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex cursor-pointer items-start gap-3" onClick={(event) => event.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            className="mt-1 h-4 w-4 accent-[#236b59]"
            aria-label={`Select ${opportunity.ticker} for comparison`}
            data-testid={`checkbox-opportunity-${opportunity.ticker}`}
          />
          <span>
            <span className="block font-mono text-[15px] font-bold tracking-[0.04em] text-[#23463e]">{opportunity.ticker}</span>
            <span className="mt-0.5 block max-w-[145px] truncate text-[11px] text-[#71877f]">{opportunity.companyName}</span>
          </span>
        </label>
        <div className={`flex h-11 min-w-[48px] flex-col items-center justify-center rounded-lg ${scoreTone(score)}`}>
          <span className="font-mono text-[16px] font-bold leading-none">{score}</span>
          <span className="mt-1 text-[8px] uppercase tracking-[0.12em]">platinum</span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <StatusPill tone="safe">{opportunity.category}</StatusPill>
        {opportunity.protectedCapitalStatus && <StatusPill><ShieldCheck size={11} /> {opportunity.protectedCapitalStatus}</StatusPill>}
      </div>
      <p className="mt-4 line-clamp-3 text-[12px] leading-[1.55] text-[#36584f]">{opportunity.thesis}</p>

      <div className="mt-auto grid grid-cols-3 gap-3 border-t border-[#eee9dd] pt-4">
        <Metric label="Portfolio fit" value={opportunity.portfolioFit} tone="positive" />
        <Metric label="Illustrative review guardrail" value={opportunity.maximumExposure} />
        <Metric label="Evidence" value={opportunity.evidenceFreshness} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-[#71877f]">
        <span className="inline-flex items-center gap-1"><FileSearch size={11} /> {opportunity.sourceCount} sources</span>
        <button type="button" className="inline-flex items-center gap-1 transition-colors group-hover:text-[#236b59]" onClick={(event) => { event.stopPropagation(); onOpen(); }} data-testid={`button-review-brief-${opportunity.ticker}`}>Review brief <ChevronRight size={12} /></button>
      </div>
    </article>
  );
}

function DetailPanel({
  opportunity,
  onManualAction,
  onClose,
}: {
  opportunity: ResearchOpportunity;
  onManualAction: (action: ResearchManualAction, opportunity: ResearchOpportunity) => void;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState<"why" | "cases" | "risk" | null>("why");
  const toggle = (section: "why" | "cases" | "risk") => setExpanded((current) => (current === section ? null : section));
  return (
    <aside className="fixed inset-x-3 bottom-3 z-30 max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl border border-[#d5dfd5] bg-[#fffdfa] p-5 shadow-[0_24px_80px_rgba(35,70,62,0.18)] md:absolute md:inset-y-0 md:right-0 md:left-auto md:w-[410px] md:rounded-none md:rounded-l-2xl md:border-y-0 md:border-r-0 md:border-l md:shadow-[-18px_0_50px_rgba(35,70,62,0.08)]"
      data-testid={`panel-decision-card-${opportunity.ticker}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[#e9e5da] pb-4">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#b38b3d]">Decision card</div>
          <div className="mt-2 flex items-baseline gap-2">
            <h2 className="font-mono text-2xl font-bold tracking-tight text-[#23463e]">{opportunity.ticker}</h2>
            <span className="text-[12px] text-[#71877f]">{opportunity.companyName}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusPill tone="safe"><ShieldCheck size={11} /> Protected-capital screen</StatusPill>
            <StatusPill><FileSearch size={11} /> {opportunity.sourceCount} evidence sources</StatusPill>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#71877f] transition-colors hover:bg-[#eef3ed] hover:text-[#23463e]" aria-label="Close decision card" data-testid="button-close-decision-card">
          <X size={17} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 border-b border-[#e9e5da] py-4">
        <div className="rounded-lg bg-[#f5f7f1] p-2.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#71877f]">Platinum</div>
          <div className="mt-1 text-xl font-semibold text-[#236b59]">{compactScore(opportunity.platinumScore)}</div>
        </div>
        <div className="rounded-lg bg-[#f5f7f1] p-2.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#71877f]">Fit</div>
          <div className="mt-1 truncate text-[12px] font-semibold text-[#23463e]">{opportunity.portfolioFit}</div>
        </div>
        <div className="rounded-lg bg-[#f5f7f1] p-2.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#71877f]">Guardrail</div>
          <div className="mt-1 truncate text-[12px] font-semibold text-[#23463e]">{opportunity.maximumExposure}</div>
        </div>
      </div>

      <div className="space-y-2 py-4">
        <div className="rounded-xl border border-[#e9e5da]">
          <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => toggle("why")} data-testid="button-toggle-why-now">
            <span className="text-[12px] font-semibold text-[#23463e]">Why this is on the list now</span>
            <ChevronDown size={15} className={`text-[#71877f] transition-transform ${expanded === "why" ? "rotate-180" : ""}`} />
          </button>
          {expanded === "why" && <div className="border-t border-[#eee9dd] px-3 pb-3 pt-2 text-[12px] leading-[1.55] text-[#58716a]">{opportunity.whyNow}</div>}
        </div>
        <div className="rounded-xl border border-[#e9e5da]">
          <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => toggle("cases")} data-testid="button-toggle-cases">
            <span className="text-[12px] font-semibold text-[#23463e]">Case range</span>
            <ChevronDown size={15} className={`text-[#71877f] transition-transform ${expanded === "cases" ? "rotate-180" : ""}`} />
          </button>
          {expanded === "cases" && (
            <div className="space-y-3 border-t border-[#eee9dd] px-3 pb-3 pt-3">
              <div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#236b59]">Bull</div><p className="mt-1 text-[11px] leading-[1.45] text-[#58716a]">{opportunity.bullCase}</p></div>
              <div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#9a6e23]">Base</div><p className="mt-1 text-[11px] leading-[1.45] text-[#58716a]">{opportunity.baseCase}</p></div>
              <div><div className="font-mono text-[9px] uppercase tracking-[0.12em] text-[#a14438]">Bear</div><p className="mt-1 text-[11px] leading-[1.45] text-[#58716a]">{opportunity.bearCase}</p></div>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[#e9e5da]">
          <button type="button" className="flex w-full items-center justify-between gap-3 p-3 text-left" onClick={() => toggle("risk")} data-testid="button-toggle-risk">
            <span className="text-[12px] font-semibold text-[#23463e]">Risk & invalidation</span>
            <ChevronDown size={15} className={`text-[#71877f] transition-transform ${expanded === "risk" ? "rotate-180" : ""}`} />
          </button>
          {expanded === "risk" && (
            <div className="border-t border-[#eee9dd] px-3 pb-3 pt-3">
              {opportunity.redFlags.length > 0 && <div className="mb-3 rounded-lg bg-[#fff6e9] p-2.5 text-[11px] leading-[1.45] text-[#8d672b]"><div className="mb-1 font-semibold">Red flags</div>{opportunity.redFlags.join(" · ")}</div>}
              <div className="text-[11px] leading-[1.45] text-[#58716a]"><div className="mb-1 font-semibold text-[#23463e]">We would change our mind if…</div>{opportunity.invalidationConditions.join(" · ")}</div>
              <div className="mt-3 flex items-center justify-between border-t border-[#eee9dd] pt-3 text-[10px]"><span className="text-[#71877f]">Concentration impact</span><span className="font-semibold text-[#23463e]">{opportunity.concentrationImpact}</span></div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[#e9e5da] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#23463e]">Factor read-through</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#71877f]">0–100</span>
        </div>
        <div className="space-y-2.5">
          <FactorBar label="Quality" value={opportunity.factorSubScores.quality} />
          <FactorBar label="Valuation" value={opportunity.factorSubScores.valuation} />
          <FactorBar label="Momentum" value={opportunity.factorSubScores.momentum} />
          <FactorBar label="Resilience" value={opportunity.factorSubScores.resilience} />
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#d9e6df] bg-[#fbfcf8] p-3" data-testid={`decision-card-evidence-${opportunity.ticker}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold text-[#23463e]">Reviewed evidence & provenance</div>
            <p className="mt-1 text-[10px] leading-[1.45] text-[#71877f]">The source rows captured for this decision are shown here for human review.</p>
          </div>
          <FileSearch size={14} className="mt-0.5 shrink-0 text-[#236b59]" />
        </div>
        <div className="mt-3 space-y-2">
          {opportunity.evidence.map((evidence) => (
            <div key={evidence.id} className="rounded-lg border border-[#e3e9e1] bg-[#fffdfa] p-2.5" data-testid={`decision-card-evidence-row-${evidence.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold text-[#23463e]">{evidence.title}</div>
                  <div className="mt-1 text-[9px] uppercase tracking-[0.08em] text-[#71877f]">{evidence.sourceKind.replaceAll("_", " ")}</div>
                </div>
                <StatusPill tone="safe">{evidence.reviewStatus}</StatusPill>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-[#58716a]">
                <span><strong>Freshness:</strong> {evidence.freshness}</span>
                <span><strong>Reviewed:</strong> {formatEvidenceDate(evidence.reviewedAt)}</span>
                <span><strong>Provider:</strong> {evidence.provider ?? "Not stated"}</span>
                <span><strong>Retrieved:</strong> {formatEvidenceDate(evidence.retrievedAt)}</span>
              </div>
              {evidence.sourceUrl && <a className="mt-2 block truncate text-[9px] font-semibold text-[#236b59] underline underline-offset-2" href={evidence.sourceUrl} target="_blank" rel="noreferrer">Open source provenance</a>}
              {evidence.canonicalSha256 && <div className="mt-2 truncate font-mono text-[8px] text-[#8a9a92]">Evidence digest: {evidence.canonicalSha256}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-[#d9e6df] bg-[#f3f8f3] p-3">
        <div className="flex items-start gap-2">
          <LockKeyhole size={14} className="mt-0.5 shrink-0 text-[#236b59]" />
          <div><div className="text-[11px] font-semibold text-[#236b59]">Manual-only safety boundary</div><p className="mt-1 text-[10px] leading-[1.5] text-[#58716a]">Research can inform a decision, never place one. Every next step requires a human review and an explicit manual action.</p></div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="rounded-lg border border-[#d8e1da] bg-[#fffdfa] px-3 py-2 text-[11px] font-semibold text-[#58716a]" onClick={() => onManualAction("Skip", opportunity)} data-testid={`button-skip-${opportunity.ticker}`}>Skip</button>
        <button type="button" className="rounded-lg border border-[#d8e1da] bg-[#fffdfa] px-3 py-2 text-[11px] font-semibold text-[#58716a]" onClick={() => onManualAction("Watch", opportunity)} data-testid={`button-watch-${opportunity.ticker}`}><Eye size={13} className="mr-1 inline" /> Watch</button>
        <button type="button" className="rounded-lg border border-[#d8e1da] bg-[#fffdfa] px-3 py-2 text-[11px] font-semibold text-[#58716a]" onClick={() => onManualAction("Review", opportunity)} data-testid={`button-review-${opportunity.ticker}`}>Review</button>
        <button type="button" className="rounded-lg border border-[#b9cdbd] bg-[#edf6ef] px-3 py-2 text-[11px] font-semibold text-[#236b59]" onClick={() => onManualAction("Shadow", opportunity)} data-testid={`button-shadow-${opportunity.ticker}`}>Shadow</button>
        <button type="button" className="col-span-2 rounded-lg bg-[#236b59] px-3 py-2 text-[11px] font-semibold text-[#f8fbf7]" onClick={() => onManualAction("Open in Schwab", opportunity)} data-testid={`button-open-schwab-${opportunity.ticker}`}><ExternalLink size={13} className="mr-1 inline" /> Open in Schwab</button>
      </div>
    </aside>
  );
}

export function ResearchOpportunityWorkflow({
  universe,
  customSymbols,
  onUniverseChange,
  onCustomSymbolsChange,
  activeView,
  opportunities,
  selectedTickers,
  state = "ready",
  errorMessage = "The research feed could not be loaded.",
  lastUpdated = "Evidence checked moments ago",
  onViewSelect,
  onSelectCandidate,
  onCompare,
  onManualAction,
  onRetry,
  onDiscoveryChange,
  onRefineChange,
  refine,
  onDiscover,
  discoverPending = false,
  discoverySummary,
  discoveryError,
  totalEligible,
  diagnostics,
  className = "",
}: ResearchOpportunityWorkflowProps) {
  const [query, setQuery] = useState("");
  const [selectedView, setSelectedView] = useState<ResearchView | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [selectedOpportunitySnapshot, setSelectedOpportunitySnapshot] = useState<ResearchOpportunity | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [localRefine, setLocalRefine] = useState<ResearchRefine>({});
  const effectiveView = selectedView ?? activeView;
  const activeRefine = refine ?? localRefine;
  const lensOpportunities = useMemo(
    () => effectiveView === "Balanced"
      ? opportunities
      : opportunities.filter((opportunity) => opportunity.category === effectiveView),
    [effectiveView, opportunities],
  );
  const filteredOpportunities = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return lensOpportunities;
    return lensOpportunities.filter((opportunity) => `${opportunity.ticker} ${opportunity.companyName} ${opportunity.category}`.toLowerCase().includes(normalized));
  }, [lensOpportunities, query]);
  const selectedOpportunities = opportunities.filter((opportunity) => selectedTickers.includes(opportunity.ticker));
  const detailOpportunity = selectedTicker
    ? opportunities.find((opportunity) => opportunity.ticker === selectedTicker) ?? selectedOpportunitySnapshot
    : undefined;

  const updateQuery = (value: string) => {
    setQuery(value);
    onDiscoveryChange?.(value);
  };
  const updateRefine = (next: ResearchRefine) => {
    setLocalRefine(next);
    onRefineChange?.(next);
  };

  return (
    <section className={`relative min-w-0 ${className}`} data-testid="research-opportunity-workflow">
      <div className="overflow-hidden rounded-2xl border border-[#dfe6dd] bg-[#f7f8f2] shadow-[0_18px_50px_rgba(35,70,62,0.06)]">
        <div className="relative border-b border-[#dfe6dd] px-4 pb-5 pt-5 sm:px-6 sm:pt-6">
          <div className="pointer-events-none absolute right-[-70px] top-[-110px] h-64 w-64 rounded-full border border-[#d8c89c]/40" />
          <div className="pointer-events-none absolute right-[-25px] top-[-65px] h-36 w-36 rounded-full border border-[#d8c89c]/40" />
          <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#b38b3d]"><Sparkles size={13} /> Research committee / 01</div>
              <h1 className="mt-2 max-w-[700px] font-display text-3xl leading-[1.05] text-[#23463e] sm:text-[40px]">Bounded batch.</h1>
              <p className="mt-3 max-w-[640px] text-[12px] leading-[1.6] text-[#58716a] sm:text-[13px]">A read-only opportunity set for family capital. Eligible from approved/current evidence, illustrative review guardrail, and a human decision at every turn.</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  value={universe}
                  onChange={(e) => onUniverseChange(e.target.value)}
                  className="rounded-lg border border-[#dfe6dd] bg-[#fbfcf8] px-3 py-1.5 text-[11px] font-semibold text-[#23463e] outline-none"
                  data-testid="select-research-universe"
                >
                  <option value="BROAD_US_MARKET">Broad U.S. Market</option>
                  <option value="COMMON_STOCKS">Common Stocks</option>
                  <option value="INCOME">Income</option>
                  <option value="GROWTH_COMPOUNDERS">Growth / Compounders</option>
                  <option value="ETFS_FUNDS">ETFs & Funds</option>
                  <option value="PREFERRED_INCOME">Preferreds &amp; Income Securities</option>
                  <option value="SMALL_CAP">Small Cap</option>
                  <option value="MID_CAP">Mid Cap</option>
                  <option value="LARGE_CAP">Large Cap</option>
                  <option value="CUSTOM">Custom</option>
                </select>
                {universe === "CUSTOM" && (
                  <input
                    type="text"
                    value={customSymbols ?? ""}
                    onChange={(e) => onCustomSymbolsChange(e.target.value)}
                    placeholder="AAPL, MSFT, BRK-B"
                    aria-label="Custom domestic symbols"
                    className="rounded-lg border border-[#dfe6dd] bg-[#fbfcf8] px-3 py-1.5 text-[11px] font-semibold text-[#23463e] outline-none"
                    data-testid="input-research-custom-symbols"
                  />
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-[#d9e2d8] bg-[#fbfcf8] px-3 py-2 text-[10px] text-[#58716a]">
              <ShieldCheck size={14} className="text-[#236b59]" />
              <span><strong className="font-semibold text-[#23463e]">Advisory only</strong><br />No trading authority</span>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex w-full gap-1 rounded-lg border border-[#dfe6dd] bg-[#eef3ed] p-1 sm:w-auto" role="tablist" aria-label="Research lens">
              {views.map((view) => (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={effectiveView === view}
                  className={`flex-1 rounded-md px-3 py-2 text-[11px] font-semibold transition-[background-color,color,box-shadow] duration-200 sm:flex-none ${effectiveView === view ? "bg-[#fffdfa] text-[#236b59] shadow-sm" : "text-[#71877f] hover:text-[#36584f]"}`}
                  onClick={() => {
                    setSelectedView(view);
                    onViewSelect(view);
                  }}
                  data-testid={`tab-research-${view.toLowerCase()}`}
                >
                  {view}
                </button>
              ))}
            </div>
             <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#71877f]">
               <div className="inline-flex items-center gap-2"><Clock3 size={12} /> {lastUpdated}</div>
               {onDiscover && <button type="button" onClick={onDiscover} disabled={discoverPending} className="inline-flex items-center gap-2 rounded-lg bg-[#236b59] px-3 py-2 font-semibold text-[#f8fbf7] transition-colors hover:bg-[#1b594a] disabled:cursor-wait disabled:opacity-60" data-testid="button-find-opportunities">
                 <Sparkles size={13} /> {discoverPending ? "Screening…" : "Find Opportunities"}
               </button>}
             </div>
          </div>
        </div>

        {discoverPending && (
          <div className="border-b border-[#dfe6dd] bg-[#f3f8f3] px-4 py-4 sm:px-6" data-testid="status-research-discovery-progress" role="status">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-4 w-4 animate-spin rounded-full border-2 border-[#a8c3b4] border-t-[#236b59]" />
              <div>
                <div className="text-[12px] font-semibold text-[#23463e]">Running read-only discovery</div>
                <p className="mt-1 text-[11px] leading-[1.5] text-[#58716a]">Verifying the household connection, collecting permitted symbol-targeted Schwab observations and SEC sources, staging new evidence for human review, then ranking current approved evidence.</p>
              </div>
            </div>
          </div>
        )}
        {discoveryError && !discoverPending && (
          <div className="border-b border-[#ebd3ce] bg-[#fff7f4] px-4 py-4 sm:px-6" data-testid="status-research-discovery-error" role="alert">
            <div className="flex items-start gap-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#a14438]" />
              <div><div className="text-[12px] font-semibold text-[#a14438]">Discovery could not run</div><p className="mt-1 text-[11px] leading-[1.5] text-[#7b625d]">{discoveryError}</p></div>
            </div>
          </div>
        )}
        {discoverySummary && !discoverPending && (
          <div className="border-b border-[#dfe6dd] bg-[#fbfcf8] px-4 py-4 sm:px-6" data-testid="research-discovery-summary">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-[#23463e]">{discoverySummary.universeLabel} bounded-batch summary</span>
                  <StatusPill tone={discoverySummary.status === "LIMITED" ? "caution" : "safe"}>{discoverySummary.status === "LIMITED" ? "Bounded coverage" : "Bounded traversal complete"}</StatusPill>
                  <StatusPill tone="safe">Schwab {discoverySummary.provider.schwabConnectionStatus.replaceAll("_", " ").toLowerCase()}</StatusPill>
                </div>
                <p className="mt-2 max-w-2xl text-[10px] leading-[1.5] text-[#71877f]">
                  SEC supplied and classified the verified-domestic directory; Schwab did not. Foreign issuers and unknown domicile classifications are excluded rather than inferred from exchange. Schwab was used only for targeted, read-only fundamentals, quotes, and 93-day daily history. Provider-wide screener unavailable through the authorized API. Schwab freshness: {discoverySummary.provider.schwabFreshness.toLowerCase().replaceAll("_", " ")} · SEC status: {discoverySummary.provider.secStatus.toLowerCase()}. New evidence stays pending until human approval.
                </p>
                <div className="mt-3 rounded-lg border border-[#d9e2d8] bg-[#f3f8f3] px-3 py-2 text-[10px] leading-[1.5] text-[#58716a]" data-testid="research-discovery-source">
                  <div className="font-semibold text-[#23463e]">SEC universe source</div>
                  <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                    <span data-testid="text-research-sec-source-title"><strong>Title:</strong> {discoverySummary.source.title}</span>
                    <span data-testid="text-research-sec-source-version"><strong>Version:</strong> {discoverySummary.source.version}</span>
                    <span data-testid="text-research-sec-source-retrieved"><strong>Retrieved:</strong> {formatEvidenceDate(discoverySummary.source.retrievedAt)}</span>
                    <span><strong>Provider:</strong> {discoverySummary.source.provider}</span>
                  </div>
                  <a
                    href={discoverySummary.source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 truncate font-semibold text-[#236b59] underline underline-offset-2"
                    data-testid="link-research-sec-source"
                  >
                    <ExternalLink size={11} /> Open SEC source
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                <Metric label="Selected domestic universe" value={String(discoverySummary.availableSymbolCount)} />
                <Metric label="Raw SEC rows" value={String(discoverySummary.rawSourceRowCount)} />
                <Metric label="Verified domestic symbols" value={String(discoverySummary.availableSymbolCount)} />
                <Metric label="Run offset / cap" value={`${discoverySummary.runOffset} / ${discoverySummary.runCap}`} />
                <Metric label="Selected / screened" value={`${discoverySummary.selected} / ${discoverySummary.screened}`} />
                <Metric label="Eligible from approved evidence" value={String(discoverySummary.approvedEligible)} tone="positive" />
                <Metric label="Final candidates" value={String(discoverySummary.finalCandidates)} tone="positive" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#e9eee6] pt-3 sm:grid-cols-4 lg:grid-cols-10" data-testid="research-discovery-accounting">
              <Metric label="Source exclusions" value={String(discoverySummary.sourceExclusions.total)} tone={discoverySummary.sourceExclusions.total ? "caution" : "quiet"} />
              <Metric label="Successful Schwab" value={String(discoverySummary.successfulSchwabEnrichments)} tone="positive" />
              <Metric label="Provider failures" value={String(discoverySummary.providerFailures)} tone={discoverySummary.providerFailures ? "caution" : "quiet"} />
              <Metric label="Schwab failures" value={String(discoverySummary.schwabFailures)} tone={discoverySummary.schwabFailures ? "caution" : "quiet"} />
              <Metric label="SEC failures" value={String(discoverySummary.secFailures)} tone={discoverySummary.secFailures ? "caution" : "quiet"} />
              <Metric label="Provider omissions" value={String(discoverySummary.providerOmissions)} tone={discoverySummary.providerOmissions ? "caution" : "quiet"} />
              <Metric label="Pending review" value={String(discoverySummary.pendingReview)} tone={discoverySummary.pendingReview ? "caution" : "quiet"} />
              <Metric label="Symbols eligible" value={String(discoverySummary.symbolsEligible)} tone="positive" />
              <Metric label="Symbols excluded" value={String(discoverySummary.symbolsExcluded)} tone={discoverySummary.symbolsExcluded ? "caution" : "quiet"} />
              <Metric label="Next offset" value={discoverySummary.nextOffset === null ? "Wrap to 0" : String(discoverySummary.nextOffset)} />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-[#e7dfc8] bg-[#fffaf0] px-3 py-2 text-[10px] leading-[1.45] text-[#7d672f]" data-testid="research-discovery-source-exclusions">
                <strong className="font-mono text-[9px] uppercase tracking-[0.08em]">SEC source exclusions</strong>
                <div className="mt-1">
                  {Object.entries(discoverySummary.sourceExclusions.counts).length > 0
                    ? Object.entries(discoverySummary.sourceExclusions.counts).map(([code, count]) => <span key={code} className="mr-3 inline-block">{code.replaceAll("_", " ")}: {count}</span>)
                    : "None recorded"}
                </div>
              </div>
              <div className="rounded-lg border border-[#d9e2d8] bg-[#f3f8f3] px-3 py-2 text-[10px] leading-[1.45] text-[#58716a]" data-testid="research-discovery-boundary">
                <strong className="font-semibold text-[#23463e]">Evidence boundary</strong>
                <div className="mt-1">
                  Eligible from approved/current evidence: {discoverySummary.approvedEligible} · Final candidates: {discoverySummary.finalCandidates} · Pending review: {discoverySummary.pendingReview}.{" "}
                  {discoverySummary.pendingReview > 0 && discoverySummary.finalCandidates === 0 && <strong>Pending review only: no approved candidates are shown. </strong>}
                  Evidence remains pending until approval; no execution or account action is available.
                </div>
              </div>
            </div>
            {discoverySummary.exclusionReasons.length > 0 && (
              <div className="mt-3 grid gap-2 md:grid-cols-2" data-testid="research-discovery-limitations">
                {discoverySummary.exclusionReasons.map((issue) => (
                  <div key={issue.code} className="rounded-lg border border-[#e7dfc8] bg-[#fffaf0] px-3 py-2 text-[10px] leading-[1.45] text-[#7d672f]">
                    <strong className="font-mono text-[9px] uppercase tracking-[0.08em]">{issue.code.replaceAll("_", " ")}</strong>
                    <span className="ml-2">{issue.message}{issue.count > 1 ? ` (${issue.count})` : ""}</span>
                  </div>
                ))}
              </div>
            )}
            {discoverySummary.limitations.length > 0 && (
              <div className="mt-3 text-[10px] leading-[1.45] text-[#71877f]" data-testid="research-discovery-limitation-text">
                <strong className="text-[#58716a]">Run limitations:</strong> {discoverySummary.limitations.join(" · ")}
              </div>
            )}
          </div>
        )}

        <div className="border-b border-[#dfe6dd] bg-[#fbfcf8] px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8ba098]" />
              <input
                type="search"
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Search ticker, company, or category"
                className="h-10 w-full rounded-lg border border-[#dfe6dd] bg-[#fffdfa] pl-9 pr-9 text-[12px] text-[#23463e] outline-none transition-[border-color,box-shadow] placeholder:text-[#9aa9a2] focus:border-[#7da28f] focus:ring-2 focus:ring-[#236b59]/10"
                aria-label="Search research opportunities"
                data-testid="input-research-discovery"
              />
              {query && <button type="button" onClick={() => updateQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#8ba098] hover:bg-[#edf3ed] hover:text-[#23463e]" aria-label="Clear search" data-testid="button-clear-research-search"><X size={14} /></button>}
            </label>
            <button type="button" onClick={() => setFiltersOpen((open) => !open)} className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3 text-[11px] font-semibold transition-colors ${filtersOpen ? "border-[#adc6b5] bg-[#edf6ef] text-[#236b59]" : "border-[#dfe6dd] bg-[#fffdfa] text-[#58716a] hover:border-[#b9cdbd]"}`} aria-expanded={filtersOpen} data-testid="button-toggle-research-filters">
              <SlidersHorizontal size={14} /> Refine <ChevronDown size={13} className={filtersOpen ? "rotate-180" : ""} />
            </button>
            <div className="flex items-center justify-between gap-3 text-[10px] text-[#71877f] md:justify-end">
               <span className="inline-flex items-center gap-1.5"><Target size={12} className="text-[#b38b3d]" /> Top 25 / {totalEligible ?? filteredOpportunities.length} eligible from approved/current evidence</span>
              {selectedOpportunities.length > 0 && <button type="button" onClick={() => { onCompare(selectedTickers); setComparisonOpen(true); }} className="inline-flex items-center gap-1.5 rounded-md bg-[#23463e] px-3 py-2 font-semibold text-[#f8fbf7] transition-colors hover:bg-[#1b594a]" data-testid="button-compare-selected"><BarChart3 size={13} /> Compare ({selectedOpportunities.length})</button>}
            </div>
          </div>
          {filtersOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e9eee6] pt-3 text-[10px] text-[#58716a]" data-testid="research-filter-panel">
               <span className="inline-flex items-center gap-1 font-semibold text-[#23463e]"><Filter size={12} /> Server screening</span>
               <label className="inline-flex items-center gap-2">
                 Minimum score
                 <select value={activeRefine.minScore ?? 0} onChange={(event) => updateRefine({ ...activeRefine, minScore: Number(event.target.value) || undefined })} className="rounded border border-[#d8e1da] bg-[#fffdfa] px-2 py-1" aria-label="Minimum Platinum score">
                   <option value={0}>Any</option><option value={70}>70+</option><option value={80}>80+</option><option value={90}>90+</option>
                 </select>
               </label>
               <label className="inline-flex items-center gap-2">
                 Portfolio fit
                 <select value={activeRefine.portfolioFit ?? ""} onChange={(event) => updateRefine({ ...activeRefine, portfolioFit: (event.target.value || undefined) as ResearchRefine["portfolioFit"] })} className="rounded border border-[#d8e1da] bg-[#fffdfa] px-2 py-1" aria-label="Portfolio fit">
                   <option value="">Any fit</option><option value="Constructive">Constructive</option><option value="Review">Review</option><option value="Caution">Caution</option>
                 </select>
               </label>
              <StatusPill tone="safe"><Check size={10} /> Protected capital first</StatusPill>
              <StatusPill tone="safe"><Check size={10} /> Read-only sources</StatusPill>
              <StatusPill><CircleHelp size={10} /> Human review required</StatusPill>
            </div>
          )}
          {comparisonOpen && selectedOpportunities.length > 1 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-[#d5dfd5] bg-[#fffdfa]" data-testid="research-comparison">
              <div className="flex items-center justify-between gap-3 border-b border-[#e9e5da] px-4 py-3">
                <div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#b38b3d]">Side-by-side review</div>
                  <h2 className="mt-1 text-[13px] font-semibold text-[#23463e]">Compare the selected research cases</h2>
                </div>
                <button type="button" onClick={() => setComparisonOpen(false)} className="rounded-md p-1.5 text-[#71877f] hover:bg-[#eef3ed] hover:text-[#23463e]" aria-label="Close comparison" data-testid="button-close-comparison"><X size={14} /></button>
              </div>
              <div className="grid gap-px bg-[#e9e5da] md:grid-cols-2 xl:grid-cols-3">
                {selectedOpportunities.map((opportunity) => (
                  <button key={opportunity.ticker} type="button" className="bg-[#fffdfa] p-4 text-left transition-colors hover:bg-[#f8faf5]" onClick={() => setSelectedTicker(opportunity.ticker)} data-testid={`comparison-${opportunity.ticker}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div><div className="font-mono text-[13px] font-bold text-[#23463e]">{opportunity.ticker}</div><div className="mt-1 text-[10px] text-[#71877f]">{opportunity.companyName}</div></div>
                      <div className={`rounded-md px-2 py-1 font-mono text-[13px] font-bold ${scoreTone(compactScore(opportunity.platinumScore))}`}>{compactScore(opportunity.platinumScore)}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#eee9dd] pt-3">
                      <Metric label="Portfolio fit" value={opportunity.portfolioFit} />
                      <Metric label="Evidence" value={opportunity.evidenceFreshness} />
                      <Metric label="Illustrative review guardrail" value={opportunity.maximumExposure} />
                      <Metric label="Sources" value={String(opportunity.sourceCount)} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-5 sm:px-6">
          {state === "ready" && (
            <div className="mb-4 rounded-xl border border-[#c3dccc] bg-[#edf6ef] p-3 text-[11px] leading-[1.5] text-[#236b59]" data-testid="status-research-current" role="status">
              <strong className="font-semibold">Current approved evidence.</strong> Research results are advisory and ready for manual committee review only.
            </div>
          )}
          {state === "loading" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="status-research-loading">{[1, 2, 3, 4, 5, 6].map((item) => <SkeletonCard key={item} />)}</div>}
          {state === "error" && (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-[#ebd3ce] bg-[#fff7f4] p-8 text-center" data-testid="status-research-error">
              <AlertCircle size={23} className="text-[#a14438]" />
              <h2 className="mt-3 text-[14px] font-semibold text-[#23463e]">The committee feed is unavailable</h2>
              <p className="mt-2 max-w-sm text-[12px] leading-[1.5] text-[#71877f]">{errorMessage}</p>
              {onRetry && <button type="button" onClick={onRetry} className="mt-4 rounded-lg border border-[#d5b6ae] bg-[#fffdfa] px-4 py-2 text-[11px] font-semibold text-[#a14438] transition-colors hover:bg-[#fdf0ed]" data-testid="button-retry-research"><ArrowUpRight size={13} className="mr-1 inline" /> Retry review</button>}
            </div>
          )}
          {state === "stale" && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#ead6a4] bg-[#fff8e7] p-3 text-[11px] leading-[1.5] text-[#906722]" data-testid="status-research-stale" role="status">
              <Clock3 size={14} className="mt-0.5 shrink-0" />
              <span><strong className="font-semibold">Some evidence was excluded as stale or unreviewed.</strong> The cards below use only the current, approved evidence that remains eligible for manual review.</span>
            </div>
          )}
          {state === "empty" && !query.trim() && (
            <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-[#cfdccf] bg-[#fbfcf8] p-8 text-center" data-testid="status-research-empty">
              <div className="grid h-11 w-11 place-items-center rounded-full bg-[#e8f1e9] text-[#236b59]"><FileSearch size={20} /></div>
              <h2 className="mt-3 text-[14px] font-semibold text-[#23463e]">No opportunities meet this lens yet</h2>
              <p className="mt-2 max-w-sm text-[12px] leading-[1.5] text-[#71877f]">The screen stays quiet when evidence or portfolio fit is not strong enough. Try another research lens or check back after the next evidence refresh.</p>
            </div>
          )}
          {(state === "empty" || state === "ready" || state === "stale") && query.trim() && filteredOpportunities.length === 0 && (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-[#cfdccf] bg-[#fbfcf8] p-8 text-center" data-testid="status-research-no-match">
              <Search size={21} className="text-[#8ba098]" />
              <h2 className="mt-3 text-[14px] font-semibold text-[#23463e]">Nothing matches “{query}”</h2>
              <button type="button" onClick={() => updateQuery("")} className="mt-3 text-[11px] font-semibold text-[#236b59] underline underline-offset-4" data-testid="button-clear-no-match">Clear search</button>
            </div>
          )}
          {(state === "ready" || state === "stale") && filteredOpportunities.length > 0 && (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="research-opportunity-grid">
              {filteredOpportunities.slice(0, 25).map((opportunity) => (
                <OpportunityCard
                  key={opportunity.ticker}
                  opportunity={opportunity}
                  selected={selectedTickers.includes(opportunity.ticker)}
                  onSelect={(selected) => onSelectCandidate(opportunity.ticker, selected)}
                  onOpen={() => {
                    setSelectedTicker(opportunity.ticker);
                    setSelectedOpportunitySnapshot(opportunity);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#dfe6dd] bg-[#edf3ed] px-4 py-3 text-[10px] text-[#58716a] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-start gap-2"><LockKeyhole size={13} className="mt-0.5 shrink-0 text-[#236b59]" /><span><strong className="font-semibold text-[#23463e]">Manual-only by design.</strong> Schwab and SEC connections are read-only; Capital OS cannot submit trades or move protected capital.</span></div>
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.1em] text-[#71877f]">Audit trail ready</span>
        </div>
      </div>
      {detailOpportunity && <DetailPanel opportunity={detailOpportunity} onClose={() => { setSelectedTicker(null); setSelectedOpportunitySnapshot(null); }} onManualAction={onManualAction} />}
    </section>
  );
}

export default ResearchOpportunityWorkflow;