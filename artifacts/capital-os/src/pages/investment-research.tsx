import { type ReactNode, useEffect, useState, useRef } from "react";
import {
  useListResearchDossiers,
  useRequestResearchEvidenceUpload,
  useRegisterResearchEvidence,
  useReviewResearchEvidence,
  useCreateResearchDossier,
  useGetSchwabResearchCertification,
  useRunSchwabResearchCertification,
  useRefreshSchwabMarketDataConnection,
  getGetSchwabResearchCertificationQueryKey,
  getListResearchDossiersQueryKey,
  getListResearchOpportunitiesQueryKey,
  useListMarketSnapshots,
  useCreateMarketSnapshot,
  useReviewMarketSnapshot,
  getListMarketSnapshotsQueryKey,
  type ResearchEvidence,
   type ResearchDossierPrefill,
  type SchwabResearchCertification,
  useListSecFilings,
  useRetrieveSecFiling,
  useReviewSecFiling,
  getListSecFilingsQueryKey,
  useListResearchOpportunities,
  type ResearchOpportunity as ApiResearchOpportunity,
} from "@workspace/api-client-react";
import { AlertCircle, AlertTriangle, FilePlus2, X, FileText, CheckCircle2, FlaskConical, Clock, Beaker, FileSearch, Database, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProviderProtectedAction } from "@/lib/reverification";
import { useQueryClient } from "@tanstack/react-query";
import {
  ResearchOpportunityWorkflow,
  type ResearchOpportunity as WorkflowOpportunity,
  type ResearchManualAction,
  type ResearchView,
} from "@/components/research-opportunity-workflow";

export const isDossierEligibleEvidence = (evidence: ResearchEvidence) =>
  (evidence.reviewStatus === "REVIEWED" || evidence.reviewStatus === "APPROVED")
  && evidence.extractionStatus === "complete";

export const isResearchContentReady = (
  researchText: string,
  placeholderTemplate: string,
  hasReviewedPrefill: boolean,
) => Boolean(researchText.trim())
  && (researchText !== placeholderTemplate || hasReviewedPrefill);

const RESEARCH_SELECTION_KEY = "capital-os:research:selected-evidence";

/** Keep selection stable across query updates while removing IDs no longer usable. */
export function reconcileSelectedEvidenceIds(selected: Iterable<string>, eligibleIds: Iterable<string>) {
  const eligible = new Set(eligibleIds);
  return new Set(Array.from(selected).filter((id) => eligible.has(id)));
}

export function loadResearchSelection(storage: Storage | undefined = typeof window === "undefined" ? undefined : window.sessionStorage) {
  if (!storage) return new Set<string>();
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RESEARCH_SELECTION_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

export function stableEvidenceIds(selected: Iterable<string>, eligibleIds?: Iterable<string>) {
  const ids = eligibleIds ? reconcileSelectedEvidenceIds(selected, eligibleIds) : new Set(selected);
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

type PersistedSource = { id: string; title: string; sourceKind: string; provenanceClass: string };
type DossierLike = { ticker: string; createdAt: Date | string; id: string; reportStatus: string; evidenceIds?: string[]; sources?: PersistedSource[] };

export function dossierEvidenceIds(dossier: DossierLike) {
  return dossier.sources?.map((source) => source.id) ?? dossier.evidenceIds ?? [];
}

export function hasExactDossierEvidenceSet(dossiers: DossierLike[], ticker: string, evidenceIds: Iterable<string>) {
  const wanted = stableEvidenceIds(evidenceIds);
  return dossiers.some((dossier) =>
    dossier.reportStatus.toLowerCase() === "completed"
    && dossier.ticker.toUpperCase() === ticker.trim().toUpperCase()
    && stableEvidenceIds(dossierEvidenceIds(dossier)).join("\u0000") === wanted.join("\u0000"),
  );
}

export function groupDossiersByTicker<T extends DossierLike>(dossiers: T[]) {
  const groups = new Map<string, { latest: T; history: T[] }>();
  for (const dossier of dossiers) {
    const key = dossier.ticker.toUpperCase();
    const current = groups.get(key);
    if (!current) groups.set(key, { latest: dossier, history: [] });
    else if (new Date(dossier.createdAt).getTime() > new Date(current.latest.createdAt).getTime()) {
      current.history.push(current.latest);
      current.latest = dossier;
    } else current.history.push(dossier);
  }
  return Array.from(groups.entries()).map(([ticker, group]) => ({
    ticker,
    latest: group.latest,
    history: group.history.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
  }));
}

const present = (value: string | null) => value ?? "not supplied";

export function buildReviewedPrefillText(
  title: string,
  ticker: string,
  prefills: ResearchDossierPrefill[],
) {
  const primary = prefills[0];
  const company = primary?.instrument.description ?? title;
  const allSources = `[${prefills.map((_, index) => `source-${index + 1}`).join(",")}]`;
  const sources = prefills.map((prefill, index) =>
    `- [source-${index + 1}] ${prefill.source.title}`,
  ).join("\n");
  const facts = prefills.flatMap((prefill, index) => {
    const source = `[source-${index + 1}]`;
    const fundamental = prefill.fundamentals;
    const quote = prefill.quote;
    const history = prefill.priceHistory;
    const recentCloses = history.recentCloses.length > 0
      ? history.recentCloses.map((candle) => `${present(candle.marketDate)} close ${present(candle.close)} volume ${present(candle.volume)}`).join("; ")
      : "none supplied";
    const missing = prefill.warnings.missingFields.length > 0
      ? prefill.warnings.missingFields.join(", ")
      : "none reported";
    const quality = prefill.warnings.qualityFlags.length > 0
      ? prefill.warnings.qualityFlags.join(", ")
      : "none reported";
    const sourceFacts = (prefill.sourceFacts ?? []).map((fact) =>
      `- ${source} SEC fact ${fact.field}: ${fact.value}${fact.unit ? ` ${fact.unit}` : ""}; form ${present(fact.filingType)}; filed ${present(fact.filingDate)}; period ${present(fact.periodStart)} through ${present(fact.periodEnd)}; accession ${present(fact.accession)}; XBRL tag ${present(fact.tag)}; source ${present(fact.sourceUrl)}; evidence ID ${fact.evidenceId}.`,
    );
    return [
      `- ${source} Provenance: provider ${prefill.source.provider}; class ${prefill.source.provenanceClass}; requested ${present(prefill.source.requestedAt)}; retrieved ${present(prefill.source.retrievedAt)}; reviewed ${prefill.source.reviewedAt}; content digest ${prefill.source.contentDigest}.`,
      `- ${source} Instrument identity: ${prefill.instrument.symbol}; ${present(prefill.instrument.description)}; asset type ${present(prefill.instrument.assetType)}; exchange ${present(prefill.instrument.exchange)}.`,
      `- ${source} Fundamentals${fundamental.asOf ? ` as of ${fundamental.asOf}` : ""}: market cap ${present(fundamental.marketCap)}; shares outstanding ${present(fundamental.sharesOutstanding)}; trailing EPS ${present(fundamental.epsTrailingTwelveMonths)}; P/E ${present(fundamental.peRatio)}; dividend amount ${present(fundamental.dividendAmount)}; dividend yield ${present(fundamental.dividendYield)}; dividend pay date ${present(fundamental.dividendPayDate)}; beta ${present(fundamental.beta)}; 52-week high ${present(fundamental.high52Week)}; 52-week low ${present(fundamental.low52Week)}.`,
      `- ${source} Current quote${quote.asOf ? ` as of ${quote.asOf}` : ""}: bid ${present(quote.bidPrice)}; ask ${present(quote.askPrice)}; last ${present(quote.lastPrice)}; mark ${present(quote.markPrice)}; open ${present(quote.openPrice)}; high ${present(quote.highPrice)}; low ${present(quote.lowPrice)}; close ${present(quote.closePrice)}; net change ${present(quote.netChange)}; net percent change ${present(quote.netPercentChange)}; volume ${present(quote.totalVolume)}.`,
      `- ${source} Bounded ${history.frequency.toLowerCase()} history: ${history.candleCount} candles from ${present(history.firstMarketDate)} through ${present(history.lastMarketDate)}; period open ${present(history.periodOpen)}; high ${present(history.periodHigh)}; low ${present(history.periodLow)}; close ${present(history.periodClose)}. Recent closes: ${recentCloses}.`,
      `- ${source} Freshness: ${prefill.freshness.label}; market date ${present(prefill.freshness.marketDate)}; provider as of ${present(prefill.freshness.providerAsOf)}; realtime ${prefill.freshness.realtime === null ? "unknown" : String(prefill.freshness.realtime)}; delayed ${prefill.freshness.delayed === null ? "unknown" : String(prefill.freshness.delayed)}.`,
      `- ${source} Data warnings: missing fields ${missing}; quality flags ${quality}.`,
      ...sourceFacts,
      `- ${source} Safety boundary: reviewed normalized evidence only; advisory-only; read-only; trading disabled; execution authority none; no trading or money movement.`,
    ];
  }).join("\n");

  return `Company: ${company}
Ticker: ${ticker}
Sources:
${sources}

Source Facts:
${facts}
External Verification:
Fundamentals: ${allSources} Reviewed normalized evidence; missing values remain explicit.
Valuation: ${allSources} Human interpretation required.
Risks: ${allSources} Review freshness, delayed status, and missing-data warnings before relying on observations.
Bull Case:
Base Case:
Bear Case:
Evidence Quality: ${allSources} Exact reviewed content digests and freshness labels are cited above.
Research Notes:
- ${allSources} Advisory only. Human approval remains required. No execution or capital authority.`;
}

const PageHeading = ({ eyebrow, title, description, actions }: { eyebrow: string; title: ReactNode; description?: string; actions?: ReactNode }) => (
  <div className="page-heading animate-in">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1 data-testid="text-page-title">{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-heading-actions">{actions}</div>}
  </div>
);

const CardTitle = ({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) => (
  <div className="card-title-row">
    <div>
      <div className="card-title">{title}</div>
      {subtitle && <div className="card-subtitle">{subtitle}</div>}
    </div>
  </div>
);

function certificationCapabilityLabel(capability: string) {
  if (capability === "INSTRUMENT_FUNDAMENTAL") return "Instrument fundamentals";
  if (capability === "CURRENT_QUOTE") return "Current quote";
  return "Daily price history";
}

function CertificationCapability({ item }: { item: SchwabResearchCertification["capabilities"][number] }) {
  const hasRateLimit = Object.values(item.rateLimit).some((value) => value !== null);
  return (
    <article className="forecast-row" style={{ padding: 14 }}>
      <div className="flex items-center justify-between gap-3">
        <strong>{certificationCapabilityLabel(item.capability)}</strong>
        <span className={item.status === "CONFIRMED" ? "status text-green-500 bg-green-500/10" : "status pending"}>
          {item.status === "CONFIRMED" ? "Confirmed" : "Pending"}
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
        <div><span className="text-[var(--ink-light)] block">Provider HTTP</span><strong>{item.providerHttpStatus ?? "Not reached"}</strong></div>
        <div><span className="text-[var(--ink-light)] block">Request ID</span><strong className="font-mono">{item.providerRequestId ?? "Not supplied"}</strong></div>
        <div><span className="text-[var(--ink-light)] block">Realtime / delayed</span><strong>{item.realtime === null ? "—" : item.realtime ? "Yes" : "No"} / {item.delayed === null ? "—" : item.delayed ? "Yes" : "No"}</strong></div>
        <div><span className="text-[var(--ink-light)] block">Freshness</span><strong>{item.freshness ?? "Not available"}</strong></div>
      </div>
      {item.capability === "DAILY_PRICE_HISTORY" && (
        <div className="mt-3 text-xs">
          <span className="text-[var(--ink-light)]">Candles: </span>
          <strong>{item.candlesReturned ?? "Not reached"}</strong>
          {item.candleDateRange && <span> · {new Date(item.candleDateRange.start).toLocaleDateString()} – {new Date(item.candleDateRange.end).toLocaleDateString()}</span>}
        </div>
      )}
      <div className="mt-3 text-xs">
        <span className="text-[var(--ink-light)] block">Fields returned</span>
        <span>{item.fieldInventory.length ? item.fieldInventory.join(", ") : "None"}</span>
      </div>
      <div className="mt-2 text-xs">
        <span className="text-[var(--ink-light)] block">Missing / null fields</span>
        <span>{item.nullFields.length ? item.nullFields.join(", ") : "None observed"}</span>
      </div>
      {(item.entitlementError || item.tokenRefreshRequired || item.errorCode) && (
        <div className="mt-3 text-xs" style={{ color: item.tokenRefreshRequired ? "#9b6b18" : "#a43a2e" }}>
          {item.entitlementError && <span className="block">Entitlement error returned.</span>}
          {item.tokenRefreshRequired && <span className="block">Token refresh required.</span>}
          {item.errorCode && <span className="block">State: {item.errorCode}</span>}
        </div>
      )}
      {hasRateLimit && (
        <div className="mt-3 text-xs text-[var(--ink-light)]">
          Rate limit: {item.rateLimit.remaining ?? "—"} remaining of {item.rateLimit.limit ?? "—"}
          {item.rateLimit.retryAfterSeconds !== null && ` · retry after ${item.rateLimit.retryAfterSeconds}s`}
        </div>
      )}
    </article>
  );
}

export default function InvestmentResearchPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const dossiersQuery = useListResearchDossiers();
  const certificationQuery = useGetSchwabResearchCertification();
  const runCertification = useRunSchwabResearchCertification();
  const marketDataRefresh = useRefreshSchwabMarketDataConnection();
  const protectedMarketDataRefresh = useProviderProtectedAction(() => marketDataRefresh.mutateAsync());

  const requestUpload = useRequestResearchEvidenceUpload();
  const registerEvidence = useRegisterResearchEvidence();
  const reviewEvidence = useReviewResearchEvidence();
  const createDossier = useCreateResearchDossier();
  
  const marketSnapshotsQuery = useListMarketSnapshots();
  const createSnapshot = useCreateMarketSnapshot();
  const reviewSnapshot = useReviewMarketSnapshot();
  const secQuery = useListSecFilings();
  const retrieveSec = useRetrieveSecFiling();
  const reviewSec = useReviewSecFiling();
  const opportunitiesQuery = useListResearchOpportunities();

  const [snapshotTicker, setSnapshotTicker] = useState("");
  const [snapshotReasons, setSnapshotReasons] = useState<Record<string, string>>({});
  const [secTicker, setSecTicker] = useState("");
  const [researchView, setResearchView] = useState<ResearchView>("Balanced");
  const [selectedOpportunityTickers, setSelectedOpportunityTickers] = useState<string[]>([]);

  const handleSnapshotReasonChange = (id: string, val: string) => setSnapshotReasons(p => ({...p, [id]: val}));

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotTicker.toUpperCase().startsWith("BKSC")) {
      toast({ title: "Invalid ticker", description: "Only BKSC and its variations are allowed for this test.", variant: "destructive" });
      return;
    }
    try {
      const endDate = Date.now();
      const startDate = endDate - 30 * 24 * 60 * 60 * 1000;
      await createSnapshot.mutateAsync({
        data: {
          ticker: snapshotTicker.toUpperCase(),
          startDate: String(startDate),
          endDate: String(endDate),
        }
      });
      toast({ title: "Draft collected", description: "Market Snapshot created and pending review." });
      setSnapshotTicker("");
      void marketSnapshotsQuery.refetch();
    } catch (e) {
      toast({ title: "Snapshot failed", description: e instanceof Error ? e.message : "Failed to create snapshot.", variant: "destructive" });
    }
  };

  const handleReviewSnapshot = async (snapshotId: string, disposition: "APPROVE" | "REJECT") => {
    try {
      await reviewSnapshot.mutateAsync({
        snapshotId,
        data: { disposition, reason: snapshotReasons[snapshotId] || undefined }
      });
      toast({ title: "Snapshot reviewed", description: `Market Snapshot was ${disposition.toLowerCase()}d.` });
      setSnapshotReasons(p => { const next = {...p}; delete next[snapshotId]; return next; });
      await queryClient.invalidateQueries({ queryKey: getListMarketSnapshotsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListResearchDossiersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListResearchOpportunitiesQueryKey() });
    } catch (e) {
       toast({ title: "Review failed", description: e instanceof Error ? e.message : "Failed to review snapshot.", variant: "destructive" });
    }
  };

  const handleSecRetrieve = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const result = await retrieveSec.mutateAsync({ data: { ticker: secTicker } });
      setSecTicker("");
      await queryClient.invalidateQueries({ queryKey: getListSecFilingsQueryKey() });
      toast({
        title: result.alreadyCollected ? "SEC filing already collected" : "SEC filing draft collected",
        description: result.alreadyCollected
          ? "The existing household-scoped filing and reviewed evidence were returned unchanged."
          : "Latest 10-Q prioritized; unsupported fields remain explicitly missing.",
      });
    } catch (error) {
      toast({ title: "SEC retrieval failed", description: error instanceof Error ? error.message : "Official SEC evidence was not collected.", variant: "destructive" });
    }
  };
  const handleSecReview = async (filingId: string, disposition: "APPROVE" | "REJECT") => {
    try {
      await reviewSec.mutateAsync({ filingId, data: { disposition } });
      await queryClient.invalidateQueries({ queryKey: getListSecFilingsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListResearchDossiersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListResearchOpportunitiesQueryKey() });
    } catch (error) {
      toast({ title: "SEC review failed", description: error instanceof Error ? error.message : "Review could not be recorded.", variant: "destructive" });
    }
  };

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProvenance, setUploadProvenance] = useState<"UPLOADED_LICENSED_RESEARCH" | "PRIMARY_SOURCE">("PRIMARY_SOURCE");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dossierTitle, setDossierTitle] = useState("");
  const [dossierTicker, setDossierTicker] = useState("");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<Set<string>>(() => loadResearchSelection());
  const [researchText, setResearchText] = useState("");
  const lastTemplateRef = useRef("");
  const lastReviewedPrefillRef = useRef("");
  const lastAutoTickerRef = useRef("");
  const lastAutoTitleRef = useRef("");
  const [isRefreshingForCertification, setIsRefreshingForCertification] = useState(false);

  const handleRunCertification = async () => {
    try {
      let result = await runCertification.mutateAsync();
      if (result.capabilities.some((item) => item.tokenRefreshRequired)) {
        setIsRefreshingForCertification(true);
        await protectedMarketDataRefresh();
        result = await runCertification.mutateAsync();
      }
      await queryClient.invalidateQueries({ queryKey: getGetSchwabResearchCertificationQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListResearchDossiersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListResearchOpportunitiesQueryKey() });
      toast({
        title: result.result === "PASS" ? "BKSC certification confirmed" : "BKSC certification remains pending",
        description: result.result === "PASS"
          ? "All three read-only Schwab Market Data schemas passed validation."
          : "No trading or money movement occurred. Review the capability results below.",
      });
    } catch (error) {
      toast({
        title: "BKSC certification failed",
        description: error instanceof Error ? error.message : "The read-only certification could not complete.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshingForCertification(false);
    }
  };

  const generateTemplate = (title: string, ticker: string, evIds: Set<string>, evList: ResearchEvidence[]) => {
    const selectedList = evList.filter(ev => evIds.has(ev.id));
    const sources = selectedList.length === 1
      ? `Source Title: ${selectedList[0].title}`
      : `Sources:\n${selectedList.map((e, index) => `- [source-${index + 1}] ${e.title}`).join('\n')}`;
    const factLines = selectedList.length === 1
      ? "- "
      : selectedList.map((_e, index) => `- [source-${index + 1}] `).join('\n');
    return `Company: ${title}
Ticker: ${ticker}
${sources}

Source Facts:
${factLines}
External Verification:
Fundamentals:
Valuation:
Risks:
Bull Case:
Base Case:
Bear Case:
Evidence Quality:
Research Notes:
- Advisory only. Human approval remains required.`;
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Research evidence must be <= 10MiB", variant: "destructive" });
      return;
    }
    if (file.type !== "application/pdf" && file.type !== "text/plain") {
      toast({ title: "Invalid file type", description: "Research evidence must be PDF or plain text", variant: "destructive" });
      return;
    }
    const mimeType: "application/pdf" | "text/plain" = file.type;

    setIsUploading(true);
    try {
      // 1. Request URL
      const { uploadURL, objectPath, uploadGrant } = await requestUpload.mutateAsync({
        data: { contentType: mimeType, size: file.size }
      });
      
      // 2. PUT bytes
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: file,
      });
      if (!putRes.ok) throw new Error("Upload to object storage failed");
      
      // 3. Register
      await registerEvidence.mutateAsync({
        data: {
          title: file.name,
          objectPath,
          byteLength: file.size,
          mimeType,
          uploadGrant,
          provenanceClass: uploadProvenance,
        }
      });
      
      toast({ title: "Evidence registered", description: "The file was uploaded successfully and is being extracted." });
      void dossiersQuery.refetch();
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : "Failed to upload file", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReviewEvidence = async (evidenceId: string, status: "REVIEWED" | "REJECTED") => {
    try {
      await reviewEvidence.mutateAsync({ evidenceId, data: { status } });
      toast({ title: `Evidence ${status.toLowerCase()}`, description: "Review status updated." });
      void dossiersQuery.refetch();
    } catch (e) {
      toast({ title: "Review failed", description: "Failed to update review status", variant: "destructive" });
    }
  };

  const toggleEvidenceSelection = (id: string) => {
    setSelectedEvidenceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data, isLoading, isError } = dossiersQuery;

  useEffect(() => {
    if (!data?.evidence) return;
    const eligibleIds = data.evidence.filter(isDossierEligibleEvidence).map((item) => item.id);
    setSelectedEvidenceIds((previous) => {
      const reconciled = reconcileSelectedEvidenceIds(previous, eligibleIds);
      try {
        window.sessionStorage.setItem(RESEARCH_SELECTION_KEY, JSON.stringify(Array.from(reconciled).sort()));
      } catch {
        // Session storage can be unavailable in privacy-restricted browsers.
      }
      return reconciled;
    });
  }, [data?.evidence]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(RESEARCH_SELECTION_KEY, JSON.stringify(Array.from(selectedEvidenceIds).sort()));
    } catch {
      // Selection still works in memory when storage is unavailable.
    }
  }, [selectedEvidenceIds]);

  useEffect(() => {
    const available = new Set(opportunitiesQuery.data?.opportunities.map((item) => item.ticker) ?? []);
    setSelectedOpportunityTickers((current) => current.filter((ticker) => available.has(ticker)));
  }, [opportunitiesQuery.data?.opportunities]);

  const handleCreateDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasReviewedPrefill = dossiersQuery.data?.evidence.some((item) =>
      selectedEvidenceIds.has(item.id) && Boolean(item.dossierPrefill),
    ) ?? false;
    if (!dossierTicker || !dossierTitle || selectedEvidenceIds.size === 0 || !isResearchContentReady(researchText, lastTemplateRef.current, hasReviewedPrefill)) {
      toast({ title: "Research facts required", description: "Add source-linked facts or observations to the research text before compiling.", variant: "destructive" });
      return;
    }
    if (hasExactDossierEvidenceSet(dossiersQuery.data?.dossiers ?? [], dossierTicker, selectedEvidenceIds)) {
      toast({ title: "Duplicate evidence set", description: "A completed dossier already contains these exact sources.", variant: "destructive" });
      return;
    }

    try {
      await createDossier.mutateAsync({
        data: {
          ticker: dossierTicker,
          title: dossierTitle,
          evidenceIds: stableEvidenceIds(selectedEvidenceIds, eligibleEvidence.map((item) => item.id)),
          digestionPayload: researchText
        }
      });
      toast({ title: "Dossier created", description: "Research dossier is pending provider synthesis." });
      setDossierTicker("");
      setDossierTitle("");
      setResearchText("");
      void dossiersQuery.refetch();
    } catch (e) {
      toast({ title: "Dossier creation failed", description: e instanceof Error ? e.message : "Failed to create dossier", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (data?.evidence) {
      const selectedPrefills = data.evidence
        .filter((item) => selectedEvidenceIds.has(item.id))
        .flatMap((item) => item.dossierPrefill ? [item.dossierPrefill] : []);
      if (selectedPrefills.length > 0) {
        const primary = selectedPrefills[0]!;
        const canAutoTicker = dossierTicker === "" || dossierTicker === lastAutoTickerRef.current;
        const canAutoTitle = dossierTitle === "" || dossierTitle === lastAutoTitleRef.current;
        const nextTicker = canAutoTicker ? primary.ticker : dossierTicker;
        const nextTitle = canAutoTitle ? primary.suggestedTitle : dossierTitle;
        if (canAutoTicker && dossierTicker !== nextTicker) {
          lastAutoTickerRef.current = nextTicker;
          setDossierTicker(nextTicker);
        }
        if (canAutoTitle && dossierTitle !== nextTitle) {
          lastAutoTitleRef.current = nextTitle;
          setDossierTitle(nextTitle);
        }
        const reviewedPrefill = buildReviewedPrefillText(nextTitle, nextTicker, selectedPrefills);
        if (researchText === "" || researchText === lastTemplateRef.current || researchText === lastReviewedPrefillRef.current) {
          setResearchText(reviewedPrefill);
          lastReviewedPrefillRef.current = reviewedPrefill;
        }
        return;
      }
      const clearAutoTicker = dossierTicker !== "" && dossierTicker === lastAutoTickerRef.current;
      const clearAutoTitle = dossierTitle !== "" && dossierTitle === lastAutoTitleRef.current;
      const nextTicker = clearAutoTicker ? "" : dossierTicker;
      const nextTitle = clearAutoTitle ? "" : dossierTitle;
      if (clearAutoTicker) {
        setDossierTicker("");
        lastAutoTickerRef.current = "";
      }
      if (clearAutoTitle) {
        setDossierTitle("");
        lastAutoTitleRef.current = "";
      }
      const newTemplate = generateTemplate(nextTitle, nextTicker, selectedEvidenceIds, data.evidence);
      if (researchText === "" || researchText === lastTemplateRef.current || researchText === lastReviewedPrefillRef.current) {
        setResearchText(newTemplate);
        lastTemplateRef.current = newTemplate;
        lastReviewedPrefillRef.current = "";
      }
    }
  }, [dossierTitle, dossierTicker, selectedEvidenceIds, data?.evidence]);

  if (isLoading) return <main className="content"><PageHeading eyebrow="Investment Research" title={<>Loading<br/><em>dossiers.</em></>} description="Initializing the research workspace." /><div className="loading-skeleton" style={{ height: 200 }} /></main>;
  
  if (isError || !data) return <main className="content"><PageHeading eyebrow="Investment Research" title={<>Workspace<br/><em>unavailable.</em></>} description="Could not load the research workspace." /><section className="card card-pad empty-state"><AlertCircle size={19} /><div><strong>Data unavailable</strong><p>Please try again later.</p></div></section></main>;

  const { dossiers, evidence, capabilityReadiness } = data;
  const workflowOpportunities: WorkflowOpportunity[] = (opportunitiesQuery.data?.opportunities ?? []).map((item: ApiResearchOpportunity) => ({
    ticker: item.ticker,
    companyName: item.companyName,
    platinumScore: item.platinumScore,
    category: item.category,
    thesis: item.thesis,
    whyNow: item.whyNow,
    redFlags: item.redFlags,
    evidenceFreshness: item.evidenceFreshness,
    portfolioFit: item.portfolioFit,
    concentrationImpact: item.concentrationImpact,
    maximumExposure: item.maximumExposure,
    bullCase: item.bullCase,
    baseCase: item.baseCase,
    bearCase: item.bearCase,
    invalidationConditions: item.invalidationConditions,
    protectedCapitalStatus: item.protectedCapitalStatus,
    humanReviewStatus: item.humanReviewStatus,
    factorSubScores: {
      quality: item.factorSubScores.earningsQuality,
      valuation: item.factorSubScores.valuation,
      momentum: item.factorSubScores.growthQuality,
      resilience: item.factorSubScores.balanceSheet,
    },
    sourceCount: item.sourceCount,
    advisoryOnly: item.advisoryOnly,
    noExecution: item.noExecution,
  }));
  const eligibleEvidence = evidence.filter(isDossierEligibleEvidence);
  const selectedEvidence = eligibleEvidence.filter((item) => selectedEvidenceIds.has(item.id));
  const duplicateEvidenceSet = hasExactDossierEvidenceSet(dossiers, dossierTicker, selectedEvidenceIds);
  const dossierGroups = groupDossiersByTicker(dossiers);
  const hasSelectedReviewedPrefill = evidence.some((item) =>
    selectedEvidenceIds.has(item.id) && Boolean(item.dossierPrefill),
  );
  const researchContentReady = isResearchContentReady(
    researchText,
    lastTemplateRef.current,
    hasSelectedReviewedPrefill,
  );
  const certification = certificationQuery.data?.certification;
  const certificationBusy = runCertification.isPending || isRefreshingForCertification || marketDataRefresh.isPending;
  const workflowState = opportunitiesQuery.isLoading
    ? "loading"
    : opportunitiesQuery.isError
      ? "error"
      : workflowOpportunities.length > 0
        ? "ready"
        : "empty";
  const handleOpportunityAction = (action: ResearchManualAction, opportunity: WorkflowOpportunity) => {
    toast({
      title: `${action} queued for review`,
      description: action === "Open in Schwab"
        ? `${opportunity.ticker} is ready for manual review in your Schwab session. No order or account action was sent.`
        : `${opportunity.ticker} remains advisory-only. Capital OS did not change a position or create an order.`,
    });
  };

  const getCapabilityClass = (status: string) => {
    if (status === "implemented") return "status text-green-500 bg-green-500/10";
    if (status === "PENDING_PROVIDER_CONFIRMATION") return "status pending";
    return "status text-red-500 bg-red-500/10 opacity-70";
  };

  return (
    <main className="content">
      <PageHeading 
        eyebrow="Investment Research" 
        title={<>Research<br/><em>committee.</em></>} 
        description="A fast discovery layer above the reviewed evidence console. Every result is household-scoped, source-linked, and advisory-only."
      />

      <ResearchOpportunityWorkflow
        activeView={researchView}
        opportunities={workflowOpportunities}
        selectedTickers={selectedOpportunityTickers}
        state={workflowState}
        errorMessage="Approved research evidence could not be screened right now."
        lastUpdated={opportunitiesQuery.data?.generatedAt ? `Evidence checked ${new Date(opportunitiesQuery.data.generatedAt).toLocaleString()}` : "Evidence check pending"}
        onViewSelect={setResearchView}
        onSelectCandidate={(ticker, selected) => setSelectedOpportunityTickers((current) => selected
          ? current.includes(ticker) ? current : [...current, ticker]
          : current.filter((item) => item !== ticker))}
        onCompare={(tickers) => toast({
          title: "Comparison ready",
          description: `${tickers.join(", ")} selected for side-by-side review. No capital or account state changed.`,
        })}
        onManualAction={handleOpportunityAction}
        onRetry={() => { void opportunitiesQuery.refetch(); }}
      />
      
      <section className="card card-pad animate-in delay-1">
        <CardTitle title="Provider capabilities" subtitle="Status of research capabilities" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <div className="flex flex-col gap-3">
            <h3 className="font-medium text-sm">Implemented</h3>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Quote</span><span className={getCapabilityClass(capabilityReadiness.quote)}>Implemented</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Market Hours</span><span className={getCapabilityClass(capabilityReadiness.market_hours)}>Implemented</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Positions</span><span className={getCapabilityClass(capabilityReadiness.portfolio_position)}>Sanitized</span></div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-medium text-sm">Pending Confirmation</h3>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Fundamentals</span><span className={getCapabilityClass(capabilityReadiness.fundamentals)}>{capabilityReadiness.fundamentals === "CONFIRMED" ? "Confirmed" : "Pending"}</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Instrument Metadata</span><span className={getCapabilityClass(capabilityReadiness.instrument_metadata)}>{capabilityReadiness.instrument_metadata === "CONFIRMED" ? "Confirmed" : "Pending"}</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Price History</span><span className={getCapabilityClass(capabilityReadiness.price_history)}>{capabilityReadiness.price_history === "CONFIRMED" ? "Confirmed" : "Pending"}</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Movers</span><span className={getCapabilityClass(capabilityReadiness.movers)}>Pending</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Options</span><span className={getCapabilityClass(capabilityReadiness.options)}>Pending</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Streaming</span><span className={getCapabilityClass(capabilityReadiness.streaming)}>Pending</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">News</span><span className={getCapabilityClass(capabilityReadiness.news)}>Pending</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Tax Data</span><span className={getCapabilityClass(capabilityReadiness.tax_data)}>Pending</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Schwab Reports</span><span className={getCapabilityClass(capabilityReadiness.schwab_reports)}>Pending</span></div>
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-medium text-sm">Not in Scope</h3>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Micro-Live</span><span className={getCapabilityClass(capabilityReadiness.micro_live)}>Disabled</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Execution</span><span className={getCapabilityClass(capabilityReadiness.execution)}>Disabled</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Orders</span><span className={getCapabilityClass(capabilityReadiness.order)}>Disabled</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Transfers</span><span className={getCapabilityClass(capabilityReadiness.transfer)}>Disabled</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Withdrawals</span><span className={getCapabilityClass(capabilityReadiness.withdrawal)}>Disabled</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Capital Allocation</span><span className={getCapabilityClass(capabilityReadiness.capital_allocation)}>Disabled</span></div>
          </div>
        </div>
      </section>

      <section className="card card-pad animate-in delay-2 mt-8" data-testid="sec-research">
        <CardTitle title="SEC EDGAR / Primary evidence" subtitle="Official normalized filing facts; drafts require human approval" />
        <form onSubmit={(event) => { void handleSecRetrieve(event); }} className="flex gap-3 mt-5">
          <input className="input uppercase" value={secTicker} onChange={(event) => setSecTicker(event.target.value.toUpperCase())} placeholder="Ticker (e.g. BKSC)" required />
          <button className="btn btn-primary" disabled={retrieveSec.isPending}>Retrieve latest 10-Q</button>
        </form>
        <div className="mt-5 space-y-3">
          {secQuery.data?.drafts.map((draft) => (
            <article key={draft.id} className="forecast-row p-4">
              <div className="flex justify-between gap-3"><strong>{draft.ticker} · {draft.filingForm}</strong><span className="status pending">{draft.reviewStatus}</span></div>
              <div className="text-xs mt-2">Accession {draft.accession} · latest filing date {draft.filingDate} · filing age {draft.filingAgeStatus} · quality {draft.evidenceQuality}</div>
              {draft.filingAgeStatus === "STALE" && (
                <div className="document-boundary mt-3" role="alert" style={{ marginBottom: 0 }}>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>Stale SEC evidence</strong>
                    <span>The latest filing date is more than one year old. Confirm whether a newer SEC filing exists before approving this historical evidence.</span>
                  </div>
                </div>
              )}
              {draft.filingAgeStatus === "UNKNOWN" && (
                <div className="document-boundary mt-3" role="alert" style={{ marginBottom: 0 }}>
                  <AlertTriangle size={16} />
                  <div>
                    <strong>SEC filing age is unknown</strong>
                    <span>The filing date was not supplied. Verify the source before approving this evidence.</span>
                  </div>
                </div>
              )}
              <div className="text-xs mt-1">Missing: {draft.missingFields.length ? draft.missingFields.join(", ") : "none reported"}</div>
              {draft.reviewStatus === "PENDING_HUMAN_REVIEW" && <div className="flex gap-2 mt-3"><button className="btn btn-primary" onClick={() => { void handleSecReview(draft.id, "APPROVE"); }}>Approve evidence</button><button className="btn" onClick={() => { void handleSecReview(draft.id, "REJECT"); }}>Reject</button></div>}
            </article>
          ))}
          {secQuery.data?.approved.map((item) => <article key={item.id} className="forecast-row p-4"><strong>{item.ticker} · approved SEC evidence</strong><div className="text-xs mt-1">Digest {item.canonicalSha256}</div></article>)}
        </div>
      </section>

      <section className="card card-pad animate-in delay-2 mt-8" data-testid="schwab-research-certification">
        <CardTitle
          title="Schwab / Research"
          subtitle="Controlled BKSC provider certification using the current household connection"
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-5">
          <p className="text-sm" style={{ color: 'var(--ink-light)', maxWidth: 680 }}>
            Runs one instrument fundamentals request, one current quote, and one bounded daily history request.
            Schwab Market Data is read-only; this action cannot trade, transfer, withdraw, allocate, or change Micro-Live state.
          </p>
          <button className="btn btn-primary" onClick={() => { void handleRunCertification(); }} disabled={certificationBusy}>
            <FlaskConical size={16} />
            {isRefreshingForCertification ? "Refreshing token..." : runCertification.isPending ? "Certifying..." : "Run BKSC Research Certification"}
          </button>
        </div>
        {certificationQuery.isLoading && <div className="loading-skeleton mt-5" style={{ height: 120 }} />}
        {certification && (
          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
              <span className={certification.result === "PASS" ? "status text-green-500 bg-green-500/10" : "status pending"}>{certification.result}</span>
              <span>Provider GETs: {certification.providerGetCount} / 3</span>
              <span className="text-[var(--ink-light)]">Completed {new Date(certification.completedAt).toLocaleString()}</span>
            </div>
            <div className="flex flex-col gap-3">
              {certification.capabilities.map((item) => <CertificationCapability key={item.capability} item={item} />)}
            </div>
            <div className="document-boundary mt-4" style={{ marginBottom: 0 }}>
              <CheckCircle2 size={16} />
              <div>
                <strong>No trading or money movement occurred</strong>
                <span>readOnly=true · tradingEnabled=false · executionAuthority=none</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="card card-pad animate-in delay-2 mt-8" data-testid="market-snapshots">
        <CardTitle title="Market Snapshots" subtitle="Inspect and collect primary provider data before digesting" />

        <form onSubmit={handleCreateSnapshot} className="flex flex-col sm:flex-row gap-4 mt-5 items-end">
          <div className="field flex-1" style={{ maxWidth: 320 }}>
            <label>Ticker (e.g. BKSC)</label>
            <input type="text" className="input uppercase" value={snapshotTicker} onChange={e => setSnapshotTicker(e.target.value.toUpperCase())} placeholder="BKSC" required />
          </div>
          <button className="btn btn-primary h-[38px]" type="submit" disabled={createSnapshot.isPending}>
            <Activity size={16} /> {createSnapshot.isPending ? "Collecting..." : "Collect Draft"}
          </button>
        </form>

        {marketSnapshotsQuery.isLoading && <div className="loading-skeleton mt-6" style={{ height: 120 }} />}

        {!marketSnapshotsQuery.isLoading && marketSnapshotsQuery.data?.snapshots.length === 0 && (
          <div className="empty-state mt-6" style={{ padding: '2rem 1rem' }}>
            <Database size={19} />
            <strong className="block">No snapshot drafts</strong>
            <span className="block mt-1">Collect a snapshot to review primary market data.</span>
          </div>
        )}

        {marketSnapshotsQuery.data && marketSnapshotsQuery.data.snapshots.length > 0 && (
          <div className="flex flex-col gap-6 mt-6">
            {marketSnapshotsQuery.data.snapshots.map(snapshot => (
              <article key={snapshot.id} className="document-boundary flex-col items-stretch" style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 8, padding: '16px', margin: 0 }}>
                <div className="flex justify-between items-start mb-3">
                   <div>
                      <strong className="text-sm">Market Snapshot: {snapshot.ticker}</strong>
                      <span className="text-xs text-[var(--ink-light)] block mt-1">Requested: {new Date(snapshot.requestedAt).toLocaleString()}</span>
                   </div>
                   <span className={`status ${snapshot.reviewStatus === 'PENDING_HUMAN_REVIEW' ? 'pending' : snapshot.reviewStatus === 'APPROVED' ? 'text-green-500 bg-green-500/10' : 'text-red-500 bg-red-500/10'}`}>
                      {snapshot.reviewStatus.replaceAll("_", " ")} {snapshot.nonAuthoritative ? "(Non-Authoritative)" : ""}
                   </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs mb-4">
                   <div><span className="text-[var(--ink-light)] block mb-1">Market Date</span><strong className="font-mono">{snapshot.marketDate ?? "Unknown"}</strong></div>
                   <div><span className="text-[var(--ink-light)] block mb-1">Freshness</span><strong>{snapshot.freshness}</strong></div>
                   <div><span className="text-[var(--ink-light)] block mb-1">Provider As Of</span><strong>{snapshot.providerAsOf ? new Date(snapshot.providerAsOf).toLocaleString() : "Unknown"}</strong></div>
                   <div><span className="text-[var(--ink-light)] block mb-1">Capabilities</span><strong>{snapshot.content.capabilities.length} included</strong></div>
                </div>

                {(snapshot.qualityFlags.length > 0 || snapshot.missingFlags.length > 0) && (
                  <div className="document-boundary mb-4" style={{ marginBottom: 16 }}>
                    <AlertTriangle size={16} />
                    <div>
                      <strong>Data quality requires review</strong>
                      {snapshot.qualityFlags.length > 0 && (
                        <span>Quality: {snapshot.qualityFlags.join(" · ")}</span>
                      )}
                      {snapshot.missingFlags.length > 0 && (
                        <span>Null or missing: {snapshot.missingFlags.join(" · ")}</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-3 mb-4">
                   {snapshot.content.capabilities.map(cap => (
                     <div key={cap.capability} className="p-3 border rounded bg-white/50 text-xs">
                       <div className="flex justify-between items-center mb-2">
                         <strong>{certificationCapabilityLabel(cap.capability)}</strong>
                         <span className="status">{cap.freshness}</span>
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[var(--ink-light)]">
                         <span>Req ID: <span className="font-mono text-black">{cap.providerRequestId || "N/A"}</span></span>
                         <span>Realtime: {cap.realtime ? "Yes" : cap.realtime === false ? "No" : "—"}</span>
                         <span>Delayed: {cap.delayed ? "Yes" : cap.delayed === false ? "No" : "—"}</span>
                         <span className="truncate" title={cap.payloadSha256}>Digest: {cap.payloadSha256.substring(0, 8)}...</span>
                       </div>
                     </div>
                   ))}
                </div>

                {(snapshot.content.instrument || snapshot.content.quote || snapshot.content.dailyHistory) && (
                  <div className="mb-4">
                    <details className="text-xs group">
                      <summary className="cursor-pointer font-medium text-[var(--ink)] mb-2 select-none">Inspect Content Digest Observations</summary>
                      <div className="p-3 rounded bg-black/5 overflow-x-auto max-h-[300px]">
                        <pre className="font-mono text-[10px]">
                          {JSON.stringify({
                            instrument: snapshot.content.instrument,
                            quote: snapshot.content.quote,
                            dailyHistory: snapshot.content.dailyHistory
                          }, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}

                <div className="mb-4">
                  <details className="text-xs group">
                    <summary className="cursor-pointer font-medium text-[var(--ink)] mb-2 select-none">Inspect Provider Provenance</summary>
                    <div className="p-3 rounded bg-black/5 overflow-x-auto max-h-[300px]">
                      <pre className="font-mono text-[10px]">
                        {JSON.stringify(snapshot.provenance, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>

                {snapshot.reviewStatus === "PENDING_HUMAN_REVIEW" && (
                   <div className="mt-4 pt-4 border-t border-[var(--line)] flex flex-col sm:flex-row items-center gap-3">
                     <input type="text" className="input text-sm flex-1" placeholder="Optional reason for approval/rejection..." value={snapshotReasons[snapshot.id] || ""} onChange={e => handleSnapshotReasonChange(snapshot.id, e.target.value)} />
                     <div className="flex gap-2 w-full sm:w-auto">
                       <button className="btn flex-1 sm:flex-none justify-center h-[36px]" style={{ background: '#edf4ee', color: '#2e594f', borderColor: '#cfddd1' }} onClick={() => handleReviewSnapshot(snapshot.id, "APPROVE")} disabled={reviewSnapshot.isPending}>Approve</button>
                       <button className="btn flex-1 sm:flex-none justify-center h-[36px]" style={{ background: '#fbebe9', color: '#a43a2e', borderColor: '#e4c2be' }} onClick={() => handleReviewSnapshot(snapshot.id, "REJECT")} disabled={reviewSnapshot.isPending}>Reject</button>
                     </div>
                   </div>
                )}

                {snapshot.reviewStatus !== "PENDING_HUMAN_REVIEW" && (
                  <div className="text-xs text-[var(--ink-light)] mt-2">
                    Reviewed {snapshot.reviewedAt ? new Date(snapshot.reviewedAt).toLocaleString() : "at an unknown time"}
                    {snapshot.reviewReason ? ` · ${snapshot.reviewReason}` : ""}
                  </div>
                )}

                <div className="mt-4 pt-3 flex flex-wrap gap-4 text-[10px] text-[var(--ink-light)] uppercase tracking-wider border-t border-dashed border-[var(--line)]">
                  <span className="flex items-center gap-1"><CheckCircle2 size={12} /> readOnly={snapshot.content.readOnly ? "true" : "false"}</span>
                  <span className="flex items-center gap-1"><CheckCircle2 size={12} /> tradingEnabled={snapshot.content.tradingEnabled ? "true" : "false"}</span>
                  <span className="flex items-center gap-1"><CheckCircle2 size={12} /> executionAuthority={snapshot.content.executionAuthority}</span>
                   <span className="flex items-center gap-1"><CheckCircle2 size={12} /> noTradingOrMoneyMovement={snapshot.noTradingOrMoneyMovement ? "true" : "false"}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card card-pad animate-in delay-2 mt-8">
        <CardTitle title="Evidence Library" subtitle="Upload and review primary sources" />
        <div className="flex flex-col sm:flex-row gap-4 mb-6 items-center">
          <select 
            value={uploadProvenance} 
            onChange={e => setUploadProvenance(e.target.value as "UPLOADED_LICENSED_RESEARCH" | "PRIMARY_SOURCE")}
            aria-label="Evidence provenance class"
            className="input" 
            style={{ width: 'auto', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)' }}
          >
            <option value="PRIMARY_SOURCE">Primary Source</option>
            <option value="UPLOADED_LICENSED_RESEARCH">Licensed Research</option>
          </select>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileSelected} 
            accept="application/pdf,text/plain" 
            className="hidden" 
          />
          <button 
            className="btn btn-primary" 
            onClick={() => fileInputRef.current?.click()} 
            disabled={isUploading}
          >
            <FilePlus2 size={16} /> {isUploading ? "Uploading..." : "Upload evidence (PDF/TXT)"}
          </button>
        </div>

        {evidence.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 1rem' }}>
            <FileSearch size={19} />
            <strong>No evidence recorded</strong>
            <span>Upload primary sources to begin research.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Class</th>
                  <th>Extraction</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((item) => (
                  <tr key={item.id}>
                    <td><div className="flex items-center gap-2"><FileText size={14} style={{ color: 'var(--ink-light)' }} /> {item.title}</div></td>
                    <td><span className="status">{item.provenanceClass.replaceAll("_", " ")}</span></td>
                    <td>
                      <span className={`status ${item.extractionStatus === "complete" ? "" : item.extractionStatus === "failed" ? "pending" : ""}`}>
                        {item.extractionStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`status ${item.reviewStatus === "REVIEWED" ? "" : item.reviewStatus === "PENDING_HUMAN_REVIEW" ? "pending" : ""}`}>
                        {item.reviewStatus}
                      </span>
                    </td>
                    <td>
                      {item.reviewStatus === "PENDING_HUMAN_REVIEW" && (
                        <div className="flex items-center justify-end gap-2">
                          {item.extractionStatus === "complete" && (
                            <button className="btn btn-small" onClick={() => handleReviewEvidence(item.id, "REVIEWED")}><CheckCircle2 size={12} /> Review</button>
                          )}
                          <button className="btn btn-small text-red-500" onClick={() => handleReviewEvidence(item.id, "REJECTED")}><X size={12} /> Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card card-pad animate-in delay-3 mt-8">
        <CardTitle title="Compile Dossier" subtitle="Synthesize reviewed evidence into decision-ready advisory research" />
        <form onSubmit={handleCreateDossier} className="flex flex-col gap-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="field">
              <label>Ticker symbol</label>
              <input 
                type="text" 
                value={dossierTicker} 
                onChange={e => setDossierTicker(e.target.value.toUpperCase())} 
                placeholder="AAPL" 
                maxLength={15}
                required
              />
            </div>
            <div className="field">
              <label>Dossier title</label>
              <input 
                type="text" 
                value={dossierTitle} 
                onChange={e => setDossierTitle(e.target.value)} 
                placeholder="Q3 Earnings Analysis" 
                required
              />
            </div>
          </div>
          
          <div className="field">
            <label>Select reviewed evidence (max 25)</label>
            <div className="document-boundary mt-3" role="status" aria-live="polite">
              <FileSearch size={16} />
              <div>
                <strong>{selectedEvidence.length} source{selectedEvidence.length === 1 ? "" : "s"} selected</strong>
                {selectedEvidence.length > 0 && (
                  <span>
                    {selectedEvidence.map((item) => `${item.title} (${item.evidenceKind.replaceAll("_", " ")} · ${item.provenanceClass.replaceAll("_", " ")})`).join(" · ")}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {eligibleEvidence.map((item) => (
                <label key={item.id} className="flex items-start gap-3 p-3 border rounded-md cursor-pointer transition-colors" style={{ backgroundColor: selectedEvidenceIds.has(item.id) ? 'var(--bg-active)' : 'var(--bg)', borderColor: selectedEvidenceIds.has(item.id) ? 'var(--ink)' : 'var(--border)' }}>
                  <input 
                    type="checkbox" 
                    className="mt-1"
                    checked={selectedEvidenceIds.has(item.id)} 
                    onChange={() => toggleEvidenceSelection(item.id)}
                    disabled={!selectedEvidenceIds.has(item.id) && selectedEvidenceIds.size >= 25}
                  />
                  <div className="flex flex-col">
                    <strong className="text-sm font-medium">{item.title}</strong>
                    <span className="text-xs" style={{ color: 'var(--ink-light)' }}>{item.provenanceClass.replaceAll("_", " ")}</span>
                  </div>
                </label>
              ))}
              {eligibleEvidence.length === 0 && (
                <div className="text-sm italic col-span-2" style={{ color: 'var(--ink-light)' }}>No reviewed and fully extracted evidence available.</div>
              )}
            </div>
          </div>

          <div className="field mt-4">
            <label>Investment Research</label>
            <textarea
              className="input mt-2 font-mono text-sm"
              rows={12}
              value={researchText}
              onChange={(e) => setResearchText(e.target.value)}
              placeholder="Company: Apple Inc..."
              required
            />
            <span className="field-help">Replace the blank source-fact lines with exact facts. With multiple sources, keep each fact linked to its source ID.</span>
          </div>

          {duplicateEvidenceSet && (
            <div className="document-boundary" role="alert">
              <AlertTriangle size={16} />
              <div>
                <strong>Exact evidence set already completed</strong>
                <span>A completed dossier for {dossierTicker.toUpperCase()} already uses these exact evidence IDs. The backend will reject duplicate content; select different evidence before compiling.</span>
              </div>
            </div>
          )}

          <div className="flex justify-end mt-4">
            <button type="submit" className="btn btn-primary" disabled={createDossier.isPending || selectedEvidenceIds.size === 0 || !dossierTicker || !dossierTitle || !researchContentReady || duplicateEvidenceSet}>
              <FlaskConical size={16} /> Compile dossier
            </button>
          </div>
        </form>
      </section>

      <section className="animate-in delay-4 mt-12 mb-12">
        <h2 className="mb-4" style={{ fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Research Chair</h2>
        {dossiers.length === 0 ? (
          <div className="card card-pad empty-state">
            <Beaker size={19} />
            <strong>No active dossiers</strong>
            <span>Compile a dossier above to begin synthesis.</span>
          </div>
          ) : (
          <div className="flex flex-col gap-6">
            {dossierGroups.map(({ ticker, latest, history }) => {
              const renderDossier = (dossier: typeof latest) => {
                const persistedSources = (dossier as DossierLike).sources ?? [];
                return (
              <article key={dossier.id} className="card card-pad flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg" style={{ lineHeight: 1.1 }}>{dossier.title}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="status">{dossier.ticker}</span>
                      <span className="text-xs" style={{ color: 'var(--ink-light)' }}>{new Date(dossier.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <span className={`status ${dossier.reportStatus === 'PENDING_PROVIDER' ? 'pending' : ''}`}>
                    {dossier.reportStatus?.replaceAll("_", " ")}
                  </span>
                </div>

                {persistedSources.length > 0 && (
                  <div className="text-sm" data-testid={`sources-${dossier.id}`}>
                    <strong className="text-xs uppercase tracking-wider block mb-1">Persisted sources</strong>
                    <ul className="m-0 pl-4" style={{ listStyleType: "disc" }}>
                      {persistedSources.map((source) => (
                        <li key={source.id}>{source.title} <span className="text-[var(--ink-light)]">({source.sourceKind.replaceAll("_", " ")} · {source.provenanceClass.replaceAll("_", " ")})</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {dossier.reportStatus === "PENDING_PROVIDER" && (
                  <div className="p-4 rounded-md flex items-start gap-3 mt-2" style={{ backgroundColor: 'var(--bg-active)' }}>
                    <Clock size={16} style={{ color: 'var(--ink-light)', marginTop: '2px' }} />
                    <div>
                      <strong className="block text-sm mb-1">Awaiting synthesis</strong>
                      <p className="text-sm" style={{ color: 'var(--ink-light)' }}>The provider is currently processing this dossier. This may take several minutes depending on the evidence volume.</p>
                    </div>
                  </div>
                )}

                {dossier.reportStatus === "blocked" && dossier.blockDiagnostic && (
                  <div className="p-4 rounded-md flex items-start gap-3 mt-2" style={{ backgroundColor: 'var(--bg-active)' }}>
                    <AlertTriangle size={16} style={{ color: 'var(--warning)', marginTop: '2px', flexShrink: 0 }} />
                    <div>
                      <strong className="block text-sm mb-1">Research response rejected safely</strong>
                      <p className="text-sm" style={{ color: 'var(--ink-light)' }}>{dossier.blockDiagnostic.slice(0, 600)}{dossier.blockDiagnostic.length > 600 ? "…" : ""}</p>
                    </div>
                  </div>
                )}
                
                {dossier.reportStatus !== "PENDING_PROVIDER" && dossier.proposal && (
                  <div className="logic-grid mt-2">
                    <div>
                      <span>Recommendation</span>
                      <p>{dossier.proposal.multiAgentSynthesis?.recommendation?.replaceAll('_', ' ') || "None"}</p>
                    </div>
                    <div>
                      <span>Confidence</span>
                      <p>{dossier.proposal.confidence != null ? `${dossier.proposal.confidence}%` : "Not assessed"}</p>
                    </div>
                    {dossier.proposal.multiAgentSynthesis?.pendingHumanApproval && (
                      <div>
                        <span>Status</span>
                        <p className="text-orange-600">Pending Approval</p>
                      </div>
                    )}
                  </div>
                )}

                {dossier.proposal?.multiAgentSynthesis?.evidenceGaps && dossier.proposal.multiAgentSynthesis.evidenceGaps.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium uppercase tracking-wider block mb-1 text-orange-600/80">Evidence Gaps</span>
                    <ul className="text-sm m-0 pl-4 text-[var(--ink-light)]" style={{ listStyleType: 'disc' }}>
                      {dossier.proposal.multiAgentSynthesis.evidenceGaps.map((gap: string, i: number) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
                );
              };
              return (
                <section key={ticker} className="flex flex-col gap-3">
                  {renderDossier(latest)}
                  {history.length > 0 && (
                    <details className="card card-pad">
                      <summary className="cursor-pointer font-medium">Older {ticker} attempts ({history.length})</summary>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                        {history.map((dossier) => renderDossier(dossier))}
                      </div>
                    </details>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
