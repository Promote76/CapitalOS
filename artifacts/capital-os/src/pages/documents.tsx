import { type ReactNode, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAccountingOverviewQueryKey,
  getGetBudgetQueryKey,
  getGetBusinessIncomeIntelligenceQueryKey,
  getGetBusinessOverviewQueryKey,
  getGetCapitalGovernorV2QueryKey,
  getGetFinancialEvidenceResetPreflightQueryKey,
  getGetFinancialDocumentDeletionPreflightQueryKey,
  getGetVariableBudgetIntelligenceQueryKey,
  getListBusinessEntitiesQueryKey,
  getListFinancialDocumentsQueryKey,
  getListFinancialReviewQueueQueryKey,
  getListTransactionReviewQueueQueryKey,
  type BusinessEntity,
  type FinancialDocument,
  type FinancialDocumentUploadInputContentType,
  type FinancialDocumentUploadInputDocumentType,
  type FinancialDocumentIdentityReviewInputClassification,
  type FinancialEvidenceDeletionPreflight,
  type FinancialEvidenceDeletionResult,
  useDeleteFinancialDocumentEvidence,
  useDecideFinancialDocumentType,
  useIngestFinancialDocument,
  useGetFinancialDocumentDeletionPreflight,
  useGetFinancialEvidenceResetPreflight,
  useLinkFinancialDocumentBusiness,
  useListBusinessEntities,
  useListFinancialAccounts,
  useListFinancialDocuments,
  useListFinancialReviewQueue,
  useRequestFinancialDocumentUploadUrl,
  useResetFinancialEvidence,
  useReviewFinancialDocument,
  useReviewFinancialDocumentIdentity,
  useReviewBankStatementTransaction,
  useRetryBankStatementParser,
  useRunFinancialDocumentTypeDetection,
} from "@workspace/api-client-react";
import { AlertCircle, ArrowRightLeft, Check, CheckCircle2, ClipboardList, FilePlus2, FileText, Info, Link2, RefreshCw, ShieldCheck, Tag, Trash2, TriangleAlert, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  normalizeReviewQueueItem,
  queueItemDestination,
  queueItemDetail,
  queueItemTitle,
  type ReviewQueueItem,
} from "@/documents-queue";
import { uploadAndIngestFinancialDocument } from "@/financial-document-upload";
import { TransactionEvidenceRow } from "./TransactionEvidenceRow";

const label = (value?: string | null) => value ? value.replaceAll("_", " ") : "Not recorded";
const shortHash = (value: string) => value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
const financialDocumentTypes: Array<{ type: FinancialDocumentUploadInputDocumentType; label: string }> = [
  { type: "STEVENS_SETTLEMENT", label: "Stevens Settlement" },
  { type: "BUSINESS_PROFIT_AND_LOSS", label: "Profit & Loss" },
  { type: "BANK_STATEMENT", label: "Bank Statement" },
  { type: "OTHER_FINANCIAL_DOCUMENT", label: "Other financial document" },
];
// Temporary browser-testing bypass. Production builds keep the approver gate.
const TEMPORARY_DEV_AUTH_BYPASS = import.meta.env.DEV;
const deletionOperationStorageKey = (documentId?: string | null) => `capital-os:financial-evidence-deletion:${documentId || "all"}`;

const PageHeading = ({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) => (
  <div className="page-heading animate-in">
    <div>
      <div className="eyebrow">{eyebrow}</div>
      <h1 data-testid="text-page-title">{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-heading-actions">{actions}</div>}
  </div>
);

const CardTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="card-title-row">
    <div>
      <div className="card-title">{title}</div>
      {subtitle && <div className="card-subtitle">{subtitle}</div>}
    </div>
  </div>
);

export default function DocumentsPage({ embedded = false }: { embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const docsQuery = useListFinancialDocuments();
  const queueQuery = useListFinancialReviewQueue();
  const businessesQuery = useListBusinessEntities();
  const accountsQuery = useListFinancialAccounts();
  const reviewDoc = useReviewFinancialDocument();
  const reviewTx = useReviewBankStatementTransaction();
  const requestUpload = useRequestFinancialDocumentUploadUrl();
  const ingestDocument = useIngestFinancialDocument();
  const resetPreflightQuery = useGetFinancialEvidenceResetPreflight();
  const [deletionDocument, setDeletionDocument] = useState<FinancialDocument | null>(null);
  const [deletionModalOpen, setDeletionModalOpen] = useState(false);
  const singleDeletionPreflightQuery = useGetFinancialDocumentDeletionPreflight(deletionDocument?.id ?? "", {
    query: {
      enabled: deletionModalOpen && Boolean(deletionDocument),
      queryKey: getGetFinancialDocumentDeletionPreflightQueryKey(deletionDocument?.id ?? ""),
    },
  });
  const resetEvidence = useResetFinancialEvidence();
  const deleteDocumentEvidence = useDeleteFinancialDocumentEvidence();
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [deletionResult, setDeletionResult] = useState<FinancialEvidenceDeletionResult | null>(null);
  const deletionIdempotencyKey = useRef<string>(crypto.randomUUID());
  const reviewKeys = useRef(new Map<string, string>());
  const [canReview, setCanReview] = useState(TEMPORARY_DEV_AUTH_BYPASS);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [txCorrectionId, setTxCorrectionId] = useState<string | null>(null);
  const [txCorrectionAmount, setTxCorrectionAmount] = useState("");
  const [uploadType, setUploadType] = useState<FinancialDocumentUploadInputDocumentType>("STEVENS_SETTLEMENT");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAccountId, setUploadAccountId] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (TEMPORARY_DEV_AUTH_BYPASS) return;
    let active = true;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (active) setCanReview(Boolean(payload?.memberships?.some((membership: { permissions?: string[] }) => membership.permissions?.includes("approve"))));
      })
      .catch(() => { if (active) setCanReview(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const firstBusinessId = businessesQuery.data?.[0]?.id;
    if (!selectedBusinessId && firstBusinessId) setSelectedBusinessId(firstBusinessId);
  }, [businessesQuery.data?.[0]?.id, selectedBusinessId]);

  const documents = docsQuery.data?.documents || [];
  const queueItems = (queueQuery.data?.items || []).map(normalizeReviewQueueItem);
  const businesses = businessesQuery.data || [];

  const invalidateEverything = async () => {
    await Promise.all([
      docsQuery.refetch(),
      queueQuery.refetch(),
      queryClient.invalidateQueries({ queryKey: getListFinancialDocumentsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListFinancialReviewQueueQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListBusinessEntitiesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetBusinessOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetBusinessIncomeIntelligenceQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetVariableBudgetIntelligenceQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetBudgetQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListTransactionReviewQueueQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetAccountingOverviewQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetCapitalGovernorV2QueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetFinancialEvidenceResetPreflightQueryKey() }),
    ]);
  };

  const openDeletion = (document: FinancialDocument | null) => {
    const saved = sessionStorage.getItem(deletionOperationStorageKey(document?.id));
    const pending = saved ? JSON.parse(saved) as { reason: string; confirmationPhrase: string; idempotencyKey: string } : null;
    setDeletionDocument(document);
    setDeletionReason(pending?.reason ?? "");
    setDeletionConfirmation(pending?.confirmationPhrase ?? "");
    deletionIdempotencyKey.current = pending?.idempotencyKey ?? crypto.randomUUID();
    setDeletionModalOpen(true);
  };

  const closeDeletion = () => {
    if (resetEvidence.isPending || deleteDocumentEvidence.isPending) return;
    setDeletionModalOpen(false);
    setDeletionDocument(null);
  };

  const submitDeletion = async () => {
    const preflight = deletionDocument ? singleDeletionPreflightQuery.data : resetPreflightQuery.data;
    if (!preflight || !preflight.canApprove || preflight.blockingIssues.length ||
      deletionConfirmation !== preflight.confirmationPhrase || deletionReason.trim().length < 8) return;
    try {
      const data = {
        confirmationPhrase: deletionConfirmation,
        reason: deletionReason.trim(),
        idempotencyKey: deletionIdempotencyKey.current,
      };
      const storageKey = deletionOperationStorageKey(deletionDocument?.id);
      sessionStorage.setItem(storageKey, JSON.stringify(data));
      const result = deletionDocument
        ? await deleteDocumentEvidence.mutateAsync({ documentId: deletionDocument.id, data })
        : await resetEvidence.mutateAsync({ data });
      setDeletionResult(result);
      sessionStorage.removeItem(storageKey);
      setDeletionModalOpen(false);
      setDeletionDocument(null);
      await invalidateEverything();
      toast({ title: result.scope === "ALL" ? "Financial evidence reset complete" : "Financial evidence deleted", description: result.message });
    } catch (error) {
      const pending = JSON.parse(sessionStorage.getItem(deletionOperationStorageKey(deletionDocument?.id)) ?? "null") as { reason?: string; confirmationPhrase?: string } | null;
      if (pending) {
        setDeletionReason(pending.reason ?? deletionReason);
        setDeletionConfirmation(pending.confirmationPhrase ?? deletionConfirmation);
      }
      toast({ title: "Deletion did not complete", description: error instanceof Error ? error.message : "No evidence was deleted.", variant: "destructive" });
    }
  };

  const handleDocReview = async (id: string, decision: "VERIFIED" | "REJECTED", reason: string) => {
    if (!canReview || !reason.trim()) return;
    try {
      await reviewDoc.mutateAsync({ documentId: id, data: { decision, reason: reason.trim() } });
      toast({ title: `Document ${decision.toLowerCase()}`, description: "The persisted review is now visible in the inbox." });
      await invalidateEverything();
    } catch (error) {
      toast({ title: "Review failed", description: error instanceof Error ? error.message : "The document review could not be saved.", variant: "destructive" });
    }
  };

  const handleTxReview = async (id: string, action: "APPROVE" | "REJECT" | "RECLASSIFY" | "MARK_TRANSFER", reason: string, correctedValue?: Record<string, unknown>) => {
    if (!canReview || !reason.trim()) return;
    const key = `${id}:${action}`;
    const idempotencyKey = reviewKeys.current.get(key) ?? crypto.randomUUID();
    reviewKeys.current.set(key, idempotencyKey);
    try {
      await reviewTx.mutateAsync({ transactionId: id, data: { action, reason: reason.trim(), idempotencyKey, correctedValue } });
      toast({ title: `Transaction action: ${action.toLowerCase()}`, description: "The evidence review was persisted." });
      await invalidateEverything();
      reviewKeys.current.delete(key);
      setTxCorrectionId(null);
      setTxCorrectionAmount("");
    } catch (error) {
      toast({ title: "Review failed", description: error instanceof Error ? error.message : "The transaction review could not be saved.", variant: "destructive" });
    }
  };

  const selectedBusiness = businesses.find((business) => business.id === selectedBusinessId);

  const mimeFor = (file: File): FinancialDocumentUploadInputContentType | null => {
    if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") return "application/pdf";
    if (file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv") return "text/csv";
    if (file.name.toLowerCase().endsWith(".xlsx") || file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return null;
  };

  const upload = async () => {
    if (!uploadFile) {
      setUploadError("Choose a PDF, CSV, or XLSX file first.");
      return;
    }
    const file = uploadFile;
    const contentType = mimeFor(file);
    if (!contentType) {
      setUploadError("Only PDF, CSV, and XLSX financial documents can be uploaded.");
      return;
    }
    if (uploadType === "BANK_STATEMENT" && !uploadAccountId) {
      setUploadError("Choose the household account shown on this statement.");
      return;
    }
    setUploadError("");
    setUploadMessage("");
    try {
      const account = accountsQuery.data?.accounts.find((item) => item.id === uploadAccountId);
      await uploadAndIngestFinancialDocument({
        file,
        contentType,
        requestUpload: () => requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType, documentType: uploadType } }),
        ingest: (data) => ingestDocument.mutateAsync({ data }),
        ingestInput: {
          documentType: uploadType,
          sourceFileName: file.name,
          sourceInstitution: account?.institution,
          accountId: uploadType === "BANK_STATEMENT" ? uploadAccountId : undefined,
          accountDisplayName: account?.nickname,
        },
      });
      await invalidateEverything();
      setUploadFile(null);
      setUploadAccountId("");
      setUploadMessage("Evidence uploaded. It remains separate from planning totals until reviewed.");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "The financial document could not be uploaded or ingested.");
    }
  };

  return (
    <>
      {!embedded && <PageHeading eyebrow="Operations" title="Financial Inbox" description="Upload preserved source evidence, then review its content type, identity, and downstream use." actions={<><button className="btn btn-primary" onClick={() => uploadInputRef.current?.click()}><FilePlus2 size={15} /> Choose file</button><button className="btn btn-danger" onClick={() => openDeletion(null)} disabled={resetPreflightQuery.isLoading || !resetPreflightQuery.data?.canApprove} title={resetPreflightQuery.data?.approvalExplanation}><Trash2 size={15} /> Reset all evidence</button></>} />}
      {!embedded && <section className="card card-pad page-section animate-in" data-testid="financial-document-upload">
        <CardTitle title="Upload financial evidence" subtitle="PDF, CSV, or XLSX · up to 50 MB. The original source object and hash are preserved." />
        <div className="financial-upload-grid">
          <label>Recorded type<select value={uploadType} onChange={(event) => setUploadType(event.target.value as FinancialDocumentUploadInputDocumentType)}>{financialDocumentTypes.map((item) => <option key={item.type} value={item.type}>{item.label}</option>)}</select></label>
          {uploadType === "BANK_STATEMENT" && <label>Statement account<select value={uploadAccountId} onChange={(event) => setUploadAccountId(event.target.value)}><option value="">Choose a household account</option>{accountsQuery.data?.accounts.map((account) => <option key={account.id} value={account.id}>{account.nickname} · {account.institution}</option>)}</select></label>}
          <label>Source file<input ref={uploadInputRef} type="file" accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setUploadFile(event.target.files?.[0] ?? null); setUploadError(""); }} /></label>
        </div>
        {uploadFile && <div className="text-sm text-[var(--ink-soft)]">{uploadFile.name} · {(uploadFile.size / 1024 / 1024).toFixed(2)} MB</div>}
        <div className="modal-actions"><button className="btn btn-primary" type="button" onClick={() => void upload()} disabled={!uploadFile || requestUpload.isPending || ingestDocument.isPending}>{requestUpload.isPending || ingestDocument.isPending ? "Uploading…" : "Upload and ingest"}</button></div>
        {uploadMessage && <div className="form-feedback success" role="status">{uploadMessage}</div>}
        {uploadError && <div className="form-feedback error" role="alert">{uploadError}</div>}
      </section>}
      {!embedded && <section className="financial-reset-boundary animate-in" data-testid="financial-evidence-reset-boundary">
        <div><TriangleAlert size={17} /><div><strong>Destructive evidence controls</strong><span>Reset removes private uploads and document-derived review artifacts only. Ledger transactions, accounts, budgets, income authority, business entities, treasury, property, strategy, trading, memberships, and authentication are preserved.</span></div></div>
        <div>
          <button className="btn btn-danger" onClick={() => openDeletion(null)} disabled={resetPreflightQuery.isLoading || !resetPreflightQuery.data?.canApprove}><Trash2 size={14} /> Reset all financial evidence</button>
          <small>{resetPreflightQuery.isLoading ? "Calculating exact household-scoped counts…" : resetPreflightQuery.data?.approvalExplanation ?? "Preflight is unavailable."}</small>
        </div>
      </section>}
      {deletionResult && <PostResetVerification result={deletionResult} onDismiss={() => setDeletionResult(null)} />}
      <div className="document-inbox-layout">
        <div className="grid gap-[18px]">
          <div className="card card-pad animate-in delay-1">
            <CardTitle title="Evidence integration" subtitle="Advisory impact only." />
            <p className="text-sm text-[var(--ink-soft)]">Reviewed evidence is surfaced on the Budget to inform planning forecasts and capacity analysis. Approving rows here does not automatically post transactions to the official household ledger or income balances.</p>
          </div>
          <div className="card card-pad animate-in delay-1">
            <CardTitle title="Business evidence boundary" subtitle="Link only after an approver confirms the business context." />
            <div className="document-business-selector">
              <label>Selected business
                <select value={selectedBusinessId} onChange={(event) => setSelectedBusinessId(event.target.value)} disabled={!businesses.length}>
                  <option value="">Choose a business</option>
                  {businesses.map((business) => <option key={business.id} value={business.id}>{business.displayName}</option>)}
                </select>
              </label>
              <p><ShieldCheck size={14} /> Linking evidence keeps business books separate from household income. It does not infer legal, tax, or ownership status.</p>
            </div>
          </div>
          <div className="card card-pad animate-in delay-1">
            <CardTitle title="Credit card payment treatment" subtitle="Excluded from budget if purchases are counted." />
            <p className="text-sm text-[var(--ink-soft)]">A card payment is reviewed as a transfer when its underlying purchases are already included, preventing the same spending from being counted twice.</p>
          </div>
           <div id="review-queue" className="card card-pad page-section animate-in delay-1">
            <CardTitle title="Review Queue" subtitle="Human confirmation only — no auto-posting and no bank writes." />
            {!canReview && <div className="business-review-permission-note"><ShieldCheck size={14} /> Read-only queue. Approver permission is required to record a decision.</div>}
            {queueQuery.isLoading ? <QueueSkeleton /> : queueQuery.isError ? <InlineError message="The review queue could not be loaded." onRetry={() => queueQuery.refetch()} /> : queueItems.length === 0 ? (
              <div className="empty-state"><div className="empty-icon"><CheckCircle2 size={20} /></div><div className="empty-title">Inbox Zero</div><p>No documents or transactions waiting for review.</p></div>
            ) : (
              <div className="document-list">{queueItems.map((item, idx) => <div key={item?.id || idx} className="document-row" data-testid={item ? `row-queue-item-${item.id}` : `row-queue-item-${idx}`}>
                <div className="flex-1"><div className="flex items-center gap-2 mb-1"><FileText size={14} className="text-[var(--ink-soft)]" /><strong>{item ? queueItemTitle(item) : "Unsupported review item"}</strong><span className="status pending">Needs Review</span></div><div className="text-xs text-[var(--ink-soft)]">{item ? queueItemDetail(item) : "Specialized review is required. This item cannot be actioned from Documents."}</div></div>
                 <div className="document-actions"><QueueItemActions item={item} document={item?.type === "financial_document" ? documents.find((document) => document.id === item.id) : undefined} canReview={canReview} handleDocReview={handleDocReview} handleTxReview={handleTxReview} correctionId={txCorrectionId} setCorrectionId={setTxCorrectionId} correctionAmount={txCorrectionAmount} setCorrectionAmount={setTxCorrectionAmount} /></div>
              </div>)}</div>
            )}
          </div>
        </div>
        <div className="grid gap-[18px] content-start">
          <div className="card card-pad page-section animate-in delay-2">
            <CardTitle title="Document Library" subtitle="All uploaded financial evidence, with provenance and identity state." />
            {docsQuery.isLoading ? <DocumentSkeleton /> : docsQuery.isError ? <InlineError message="The document library could not be loaded." onRetry={() => docsQuery.refetch()} /> : documents.length === 0 ? <div className="text-sm text-[var(--ink-soft)] text-center py-4">No documents uploaded yet.</div> : (
              <div className="document-list">{documents.map((doc) => <FinancialEvidenceCard key={doc.id} document={doc} documents={documents} businesses={businesses} selectedBusinessId={selectedBusinessId} selectedBusiness={selectedBusiness} canReview={canReview} onRefresh={invalidateEverything} onReview={handleDocReview} onDelete={() => openDeletion(doc)} />)}</div>
            )}
          </div>
        </div>
      </div>
      {deletionModalOpen && <EvidenceDeletionModal
        document={deletionDocument}
        preflight={deletionDocument ? singleDeletionPreflightQuery.data : resetPreflightQuery.data}
        loading={deletionDocument ? singleDeletionPreflightQuery.isLoading : resetPreflightQuery.isLoading}
        reason={deletionReason}
        confirmation={deletionConfirmation}
        pending={resetEvidence.isPending || deleteDocumentEvidence.isPending}
        onReasonChange={setDeletionReason}
        onConfirmationChange={setDeletionConfirmation}
        onClose={closeDeletion}
        onConfirm={() => void submitDeletion()}
      />}
    </>
  );
}

function FinancialEvidenceCard({ document, documents, businesses, selectedBusinessId, selectedBusiness, canReview, onRefresh, onReview, onDelete }: {
  document: FinancialDocument;
  documents: FinancialDocument[];
  businesses: BusinessEntity[];
  selectedBusinessId: string;
  selectedBusiness?: BusinessEntity;
  canReview: boolean;
  onRefresh: () => Promise<void>;
  onReview: (id: string, decision: "VERIFIED" | "REJECTED", reason: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
   const verificationGate = documentVerificationGate(document);
   return <article id={`financial-document-${document.id}`} className={`financial-evidence-card ${expanded ? "is-expanded" : ""}`}>
    <button className="financial-evidence-summary" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <span className="financial-evidence-icon"><FileText size={16} /></span>
      <span className="financial-evidence-heading"><strong title={document.sourceFileName}>{document.sourceFileName}</strong><span>{label(document.documentType)} · {document.periodStart || document.statementDate || "Period not recorded"}{document.periodEnd ? ` to ${document.periodEnd}` : ""}</span></span>
       <span className={`status ${documentReadiness(document).complete ? "verified" : documentReadiness(document).hasIssue ? "review" : "pending"}`}>{documentReadiness(document).headline}</span>
       <small className="document-pending-note">{documentReadiness(document).detail}</small>
    </button>
    {expanded && <div className="financial-evidence-detail">
      <div className="financial-evidence-grid">
        <EvidenceMeta label="Business linkage" value={selectedBusiness && document.businessId === selectedBusiness.id ? selectedBusiness.displayName : document.businessId ? `Linked business · ${document.businessId.slice(0, 8)}` : "Household / unlinked"} />
        <EvidenceMeta label="Detected type" value={label(document.detectedDocumentType)} />
        <EvidenceMeta label="Detection confidence" value={document.detectionConfidence || "Not recorded"} />
        <EvidenceMeta label="Period" value={document.periodStart ? `${document.periodStart}${document.periodEnd ? ` — ${document.periodEnd}` : ""}` : document.statementDate || "Not recorded"} />
        <EvidenceMeta label="Identity status" value={label(document.identityStatus)} />
        <EvidenceMeta label="Document hash" value={shortHash(document.documentHash)} mono />
      </div>
      <div className="financial-evidence-signals"><span className="eyebrow">Detection signals</span>{document.detectionSignals?.length ? document.detectionSignals.map((signal) => <span key={signal} className="evidence-signal"><Tag size={12} /> {signal}</span>) : <span className="text-sm text-[var(--ink-soft)]">No detection signals recorded.</span>}</div>
       {verificationGate.blockers.length > 0 && <div className="operations-inline-error financial-review-gate" role="status"><AlertCircle size={15} /><div><strong>Verification is blocked until review is complete.</strong>{verificationGate.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</div></div>}
       {document.bankStatement && <div className="mt-3 text-xs text-[var(--ink-soft)] bg-white/50 p-2 rounded border border-[var(--line)]"><Info size={12} className="inline mr-1 -mt-0.5" /> Parsed rows require individual review. Parent verification is only available when all rows are terminal. <a href="#review-queue" className="underline">Open the Review Queue</a>.</div>}
      {document.transactions?.map((transaction) => <TransactionEvidenceRow key={transaction.id} transaction={transaction} />)}
        <FinancialEvidenceActions document={document} documents={documents} businesses={businesses} selectedBusinessId={selectedBusinessId} canReview={canReview} verificationGate={verificationGate} onRefresh={onRefresh} onReview={onReview} onDelete={onDelete} />
    </div>}
  </article>;
}

function FinancialEvidenceActions({ document, documents, businesses, selectedBusinessId, canReview, verificationGate, onRefresh, onReview, onDelete }: {
  document: FinancialDocument;
  documents: FinancialDocument[];
  businesses: BusinessEntity[];
  selectedBusinessId: string;
  canReview: boolean;
  verificationGate: DocumentVerificationGate;
  onRefresh: () => Promise<void>;
  onReview: (id: string, decision: "VERIFIED" | "REJECTED", reason: string) => Promise<void>;
  onDelete: () => void;
}) {
  const linkBusiness = useLinkFinancialDocumentBusiness();
  const decideType = useDecideFinancialDocumentType();
  const detectType = useRunFinancialDocumentTypeDetection();
  const retryParser = useRetryBankStatementParser();
  const reviewIdentity = useReviewFinancialDocumentIdentity();
  const { toast } = useToast();
  const [reviewReason, setReviewReason] = useState("");
  const [linkReason, setLinkReason] = useState("");
  const [typeReason, setTypeReason] = useState("");
  const [identityReason, setIdentityReason] = useState("");
  const [comparisonDocumentId, setComparisonDocumentId] = useState("");
  const [classification, setClassification] = useState<FinancialDocumentIdentityReviewInputClassification>("UNKNOWN_REVIEW_REQUIRED");
  const [canonicalDocumentId, setCanonicalDocumentId] = useState("");
  const [detectionReason, setDetectionReason] = useState("");
  const [parserRetryReason, setParserRetryReason] = useState("");
  const typeIdempotencyKey = useRef(crypto.randomUUID());
  const linkIdempotencyKey = useRef(crypto.randomUUID());
  const detectionIdempotencyKey = useRef(crypto.randomUUID());
  const parserRetryIdempotencyKey = useRef(crypto.randomUUID());
  const hasCanonicalChoice = ["EXACT_DUPLICATE", "PROBABLE_DUPLICATE", "CORRECTED_VERSION"].includes(classification);
  const comparisonDocument = documents.find((candidate) => candidate.id === comparisonDocumentId);
  const linkedBusiness = businesses.find((business) => business.id === document.businessId);
  const typeMismatch = Boolean(document.detectedDocumentType && document.detectedDocumentType !== document.documentType &&
    !["CORRECTED", "OVERRIDDEN"].includes(document.typeMismatchStatus ?? ""));
  const parserErrors = documentParserErrors(document);

  const saveType = async () => {
    if (!canReview || !document.detectedDocumentType || !typeReason.trim()) return;
    try {
      await decideType.mutateAsync({ documentId: document.id, data: { action: typeMismatch && document.detectedDocumentType !== "BUSINESS_PROFIT_AND_LOSS" ? "KEEP_SELECTED_TYPE" : "USE_DETECTED_TYPE", reason: typeReason.trim(), idempotencyKey: typeIdempotencyKey.current } });
      setTypeReason("");
      typeIdempotencyKey.current = crypto.randomUUID();
      await onRefresh();
       toast({ title: "Document type decision saved", description: typeMismatch && document.detectedDocumentType !== "BUSINESS_PROFIT_AND_LOSS" ? "The selected bank statement type was explicitly retained." : "The detected type decision was persisted for this document." });
    } catch (error) {
      toast({ title: "Type decision failed", description: error instanceof Error ? error.message : "The type decision could not be saved.", variant: "destructive" });
    }
  };

  const runDetection = async () => {
    if (!canReview || !detectionReason.trim()) return;
    try {
      await detectType.mutateAsync({ documentId: document.id, data: { reason: detectionReason.trim(), idempotencyKey: detectionIdempotencyKey.current } });
      setDetectionReason("");
      detectionIdempotencyKey.current = crypto.randomUUID();
      await onRefresh();
      toast({ title: document.detectedDocumentType ? "Content detection re-run" : "Content detection recorded", description: "The preserved source object was read without replacing its hash or file." });
    } catch (error) {
      toast({ title: "Content detection failed", description: error instanceof Error ? error.message : "The preserved source could not be classified.", variant: "destructive" });
    }
  };

  const retryBankParser = async () => {
    if (!canReview || !parserRetryReason.trim()) return;
    try {
      await retryParser.mutateAsync({ documentId: document.id, data: { reason: parserRetryReason.trim(), idempotencyKey: parserRetryIdempotencyKey.current } });
      setParserRetryReason("");
      parserRetryIdempotencyKey.current = crypto.randomUUID();
      await onRefresh();
      toast({ title: "Bank statement parser retried", description: "The preserved source was re-read into a new review generation. No ledger or bank write occurred." });
    } catch (error) {
      toast({ title: "Parser retry failed", description: error instanceof Error ? error.message : "The preserved bank statement could not be parsed again.", variant: "destructive" });
    }
  };

  const saveLink = async () => {
    if (!canReview || !selectedBusinessId || !linkReason.trim()) return;
    try {
      await linkBusiness.mutateAsync({ documentId: document.id, data: { businessId: selectedBusinessId, reason: linkReason.trim(), idempotencyKey: linkIdempotencyKey.current } });
      setLinkReason("");
      await onRefresh();
      linkIdempotencyKey.current = crypto.randomUUID();
      toast({ title: "Business link saved", description: "The document now shows its persisted business boundary." });
    } catch (error) {
      toast({ title: "Business link failed", description: error instanceof Error ? error.message : "The business link could not be saved.", variant: "destructive" });
    }
  };

  const saveIdentity = async () => {
    if (!canReview || !comparisonDocumentId || !identityReason.trim() || (hasCanonicalChoice && !canonicalDocumentId)) return;
    try {
      await reviewIdentity.mutateAsync({ documentId: document.id, data: { comparedDocumentId: comparisonDocumentId, classification, reason: identityReason.trim(), canonicalDocumentId: hasCanonicalChoice ? canonicalDocumentId : undefined } });
      setIdentityReason("");
      setComparisonDocumentId("");
      setCanonicalDocumentId("");
      await onRefresh();
      toast({ title: "Identity review saved", description: "The comparison and classification are now persisted. No merge or deletion occurred." });
    } catch (error) {
      toast({ title: "Identity review failed", description: error instanceof Error ? error.message : "The identity review could not be saved.", variant: "destructive" });
    }
  };

  return <div className="financial-evidence-actions">
    {!canReview && <div className="business-review-permission-note"><ShieldCheck size={14} /> Read-only evidence view. Approver permission is required for business linkage, type, identity, and document decisions.</div>}
    <div className="financial-action-block">
      <div className="financial-action-title"><FileText size={14} /><strong>Content detection</strong><span>{document.detectedDocumentType ? `Last result: ${label(document.detectedDocumentType)}` : "No content result recorded"}</span></div>
      <label>Required reason<input value={detectionReason} onChange={(event) => setDetectionReason(event.target.value)} placeholder="Explain why the preserved source should be checked" maxLength={1000} disabled={!canReview} /></label>
      <button className="btn" onClick={() => void runDetection()} disabled={!canReview || !detectionReason.trim() || detectType.isPending}><RefreshCw size={13} /> {detectType.isPending ? "Detecting…" : document.detectedDocumentType ? "Re-run content detector" : "Run content detector"}</button>
      <small className="text-[var(--ink-soft)]">Reads the original private source object and creates a new immutable detection observation. It does not replace, merge, delete, or rewrite the upload.</small>
    </div>
    {document.bankStatement && parserErrors.length > 0 && <div className="financial-action-block">
      <div className="financial-action-title"><RefreshCw size={14} /><strong>Bank statement parser retry</strong><span>{parserErrors[0]}</span></div>
      <label>Required reason<input value={parserRetryReason} onChange={(event) => setParserRetryReason(event.target.value)} placeholder="Explain why the preserved statement should be parsed again" maxLength={1000} disabled={!canReview} /></label>
      <button className="btn btn-primary" onClick={() => void retryBankParser()} disabled={!canReview || !parserRetryReason.trim() || retryParser.isPending}><RefreshCw size={13} /> {retryParser.isPending ? "Retrying…" : "Retry parser"}</button>
      <small className="text-[var(--ink-soft)]">Reads the preserved source object without deleting or replacing it. A successful retry creates fresh child rows for the same human-review workflow; it never posts to the ledger.</small>
    </div>}
    <div className="financial-action-block">
      <div className="financial-action-title"><Link2 size={14} /><strong>Business linkage</strong><span>{document.businessId ? `Persisted: ${linkedBusiness?.displayName ?? `Business ${document.businessId.slice(0, 8)}`}` : "No business link"}</span></div>
      {!document.businessId && <><label>Link reason<input value={linkReason} onChange={(event) => setLinkReason(event.target.value)} placeholder="Explain the business boundary match" maxLength={1000} disabled={!canReview} /></label><button className="btn btn-primary" onClick={() => void saveLink()} disabled={!canReview || !selectedBusinessId || !linkReason.trim() || linkBusiness.isPending}><Link2 size={13} /> {linkBusiness.isPending ? "Saving…" : "Link to selected business"}</button></>}
      {document.businessId && <span className="financial-action-result">This document is already linked. No automatic relinking or merging is performed.</span>}
    </div>
    {typeMismatch && <div className="financial-action-block">
       <div className="financial-action-title"><Tag size={14} /><strong>Detected type needs a decision</strong><span>Selected: {label(document.documentType)} · detected: {label(document.detectedDocumentType)}</span></div>
       <label>Required reason<input value={typeReason} onChange={(event) => setTypeReason(event.target.value)} placeholder="Explain why the selected type is correct" maxLength={1000} disabled={!canReview} /></label>
       <button className="btn" onClick={() => void saveType()} disabled={!canReview || !typeReason.trim() || decideType.isPending}><Check size={13} /> {decideType.isPending ? "Saving…" : document.detectedDocumentType === "BUSINESS_PROFIT_AND_LOSS" ? "Use detected type" : "Keep selected type"}</button>
     </div>}
    <div className="financial-action-block">
      <div className="financial-action-title"><ClipboardList size={14} /><strong>Identity review</strong><span>Explicit comparison only; never auto-merge or delete.</span></div>
      <div className="financial-action-form-grid">
        <label>Comparison document<select value={comparisonDocumentId} onChange={(event) => setComparisonDocumentId(event.target.value)} disabled={!canReview}><option value="">Choose document</option>{documentIdentityOptions(document, documents).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label>Classification<select value={classification} onChange={(event) => setClassification(event.target.value as FinancialDocumentIdentityReviewInputClassification)} disabled={!canReview}><option value="EXACT_DUPLICATE">Exact duplicate</option><option value="PROBABLE_DUPLICATE">Probable duplicate</option><option value="DISTINCT_PERIOD">Distinct period</option><option value="DISTINCT_VERSION">Distinct version</option><option value="CORRECTED_VERSION">Corrected version</option><option value="UNKNOWN_REVIEW_REQUIRED">Unknown — review required</option></select></label>
      </div>
      {comparisonDocument && <IdentityComparisonEvidence document={document} comparedDocument={comparisonDocument} />}
      {hasCanonicalChoice && <label>Canonical document<select value={canonicalDocumentId} onChange={(event) => setCanonicalDocumentId(event.target.value)} disabled={!canReview}><option value="">Choose canonical document</option>{documentIdentityOptions(document, documents).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>}
      <label>Required reason<textarea value={identityReason} onChange={(event) => setIdentityReason(event.target.value)} placeholder="Explain the comparison and canonical choice" maxLength={1000} disabled={!canReview} /></label>
      <button className="btn" onClick={() => void saveIdentity()} disabled={!canReview || !comparisonDocumentId || !identityReason.trim() || (hasCanonicalChoice && !canonicalDocumentId) || reviewIdentity.isPending}><ClipboardList size={13} /> {reviewIdentity.isPending ? "Saving…" : "Record identity review"}</button>
    </div>
    <div className="financial-action-block">
      <div className="financial-action-title"><ShieldCheck size={14} /><strong>Document decision</strong><span>{document.reviewDecision ? `Persisted: ${label(document.reviewDecision)}` : "No approver decision recorded"}</span></div>
      <label>Decision reason<input value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="Explain why this evidence is verified or rejected" maxLength={1000} disabled={!canReview} /></label>
       {verificationGate.blockers.length > 0 && <small className="document-pending-note">{verificationGate.blockers[0]}</small>}
       <div className="document-actions">{verificationGate.canVerify
        ? <button className="btn btn-primary" onClick={() => void onReview(document.id, "VERIFIED", reviewReason)} disabled={!canReview || !reviewReason.trim()}><Check size={13} /> Verify document</button>
        : <button className="btn" disabled title={verificationGate.blockers.join(" ")}>{parserErrors.length ? <RefreshCw size={13} /> : <ShieldCheck size={13} />} {parserErrors.length ? "Retry parser first" : "Verification blocked"}</button>}
        <button className="btn btn-danger" onClick={() => void onReview(document.id, "REJECTED", reviewReason)} disabled={!canReview || !reviewReason.trim()}><X size={13} /> Reject</button></div>
    </div>
    <div className="financial-action-block financial-delete-action">
      <div className="financial-action-title"><Trash2 size={14} /><strong>Delete uploaded evidence</strong><span>Irreversible. Derived document records are removed; ledger and business state are preserved.</span></div>
      <button className="btn btn-danger" onClick={onDelete} disabled={!canReview}><Trash2 size={13} /> Delete this document</button>
    </div>
  </div>;
}

function EvidenceDeletionModal({
  document,
  preflight,
  loading,
  reason,
  confirmation,
  pending,
  onReasonChange,
  onConfirmationChange,
  onClose,
  onConfirm,
}: {
  document: FinancialDocument | null;
  preflight?: FinancialEvidenceDeletionPreflight;
  loading: boolean;
  reason: string;
  confirmation: string;
  pending: boolean;
  onReasonChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const canSubmit = Boolean(preflight?.canApprove) && !preflight?.blockingIssues.length &&
    confirmation === preflight?.confirmationPhrase && reason.trim().length >= 8 && !pending;
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal financial-deletion-modal" role="dialog" aria-modal="true" aria-labelledby="financial-deletion-title">
      <div className="modal-header">
        <div><span className="eyebrow">Irreversible deletion</span><h2 id="financial-deletion-title">{document ? "Delete this financial document?" : "Reset all financial evidence?"}</h2><p>{document ? document.sourceFileName : "Every private financial upload in this household and its solely derived evidence will be removed."}</p></div>
        <button className="btn" onClick={onClose} aria-label="Close deletion dialog"><X size={15} /></button>
      </div>
      {loading || !preflight ? <div className="queue-skeleton"><div /><div /><div /></div> : <>
        <div className="deletion-warning"><TriangleAlert size={18} /><div><strong>This cannot be undone.</strong><span>Official ledger transactions, accounts, budgets, planning periods, verified income, owner draws, business entities, reserves, treasury, property, strategy, trading, identity, permissions, and authentication are outside this deletion.</span></div></div>
        <DeletionCounts preflight={preflight} />
        {!preflight.canApprove && <div className="business-review-permission-note"><ShieldCheck size={14} /> {preflight.approvalExplanation}</div>}
        {preflight.blockingIssues.length > 0 && <div className="operations-inline-error"><AlertCircle size={15} /><span>{preflight.blockingIssues.join(" ")}</span></div>}
        <div className="modal-form">
          <div className="field"><label>Required reason</label><textarea value={reason} onChange={(event) => onReasonChange(event.target.value)} maxLength={1000} placeholder="Explain why this evidence must be permanently removed" disabled={!preflight.canApprove || pending} /></div>
          <div className="field"><label>Type {preflight.confirmationPhrase} exactly</label><input value={confirmation} onChange={(event) => onConfirmationChange(event.target.value)} autoComplete="off" disabled={!preflight.canApprove || pending} /></div>
          <div className="modal-actions"><button className="btn" onClick={onClose} disabled={pending}>Cancel</button><button className="btn btn-danger destructive-confirm" onClick={onConfirm} disabled={!canSubmit}><Trash2 size={14} /> {pending ? "Deleting…" : document ? "Delete evidence permanently" : "Reset evidence permanently"}</button></div>
        </div>
      </>}
    </section>
  </div>;
}

function DeletionCounts({ preflight }: { preflight: FinancialEvidenceDeletionPreflight }) {
  const counts = preflight.counts;
  const items = [
    ["Financial documents", counts.financialDocuments],
    ["Settlement sources", counts.settlementDocuments],
    ["P&L sources", counts.profitLossDocuments],
    ["Bank statement rows", counts.bankStatementTransactions],
    ["Review / derived records", counts.derivedRecords],
    ["Private source objects", counts.storageObjects],
  ];
  return <div className="deletion-counts" aria-label="Deletion preflight counts">{items.map(([itemLabel, count]) => <div key={itemLabel}><span>{itemLabel}</span><strong>{count}</strong></div>)}</div>;
}

function PostResetVerification({ result, onDismiss }: { result: FinancialEvidenceDeletionResult; onDismiss: () => void }) {
  const verification = result.verification;
  return <section className="card card-pad financial-reset-result animate-in" role="status">
    <div className="financial-reset-result-head"><CheckCircle2 size={18} /><div><strong>{result.scope === "ALL" ? "Financial evidence reset verified" : "Document deletion verified"}</strong><span>{result.message}</span></div><button className="btn" onClick={onDismiss}>Dismiss</button></div>
    <div className="deletion-counts">
      <div><span>Documents remaining</span><strong>{verification.financialDocumentsRemaining}</strong></div>
      <div><span>Settlement sources remaining</span><strong>{verification.settlementSourceRecordsRemaining}</strong></div>
      <div><span>P&amp;L sources remaining</span><strong>{verification.profitLossSourceRecordsRemaining}</strong></div>
      <div><span>Ledger transactions preserved</span><strong>{verification.householdLedgerTransactionsRemaining}</strong></div>
      <div><span>Business entity preserved</span><strong>{verification.canonicalBusinessEntityStillPresent ? "Yes" : "No"}</strong></div>
      <div><span>Deletion audit ID</span><strong className="font-mono">{result.tombstoneId.slice(0, 8)}…</strong></div>
    </div>
  </section>;
}

function IdentityComparisonEvidence({ document, comparedDocument }: { document: FinancialDocument; comparedDocument: FinancialDocument }) {
  return <div className="identity-comparison-evidence">
    <span className="eyebrow">Persisted comparison evidence</span>
    <div className="identity-comparison-grid">
      <div><strong>Current document</strong><span>Hash: {shortHash(document.documentHash)}</span><span>Period: {documentPeriod(document)}</span><span>Type: {label(document.documentType)} · detected {label(document.detectedDocumentType)}</span><span>Totals: {sourceTotals(document) || "Not recorded in source envelope"}</span></div>
      <div><strong>Compared document</strong><span>Hash: {shortHash(comparedDocument.documentHash)}</span><span>Period: {documentPeriod(comparedDocument)}</span><span>Type: {label(comparedDocument.documentType)} · detected {label(comparedDocument.detectedDocumentType)}</span><span>Totals: {sourceTotals(comparedDocument) || "Not recorded in source envelope"}</span></div>
    </div>
    <small>Review the hashes, periods, totals, and detection signals before choosing duplicate, version, or distinct-period treatment.</small>
  </div>;
}

function documentPeriod(document: FinancialDocument) {
  return document.periodStart
    ? `${document.periodStart}${document.periodEnd ? ` — ${document.periodEnd}` : ""}`
    : document.statementDate || "Not recorded";
}

function sourceTotals(document: FinancialDocument) {
  const metadata = document.sourceMetadata ?? {};
  const keys = ["reportedGross", "reportedDeductions", "reportedNet", "reportedRevenue", "reportedExpenses", "reportedProfit"];
  const values = keys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null)
    .map((key) => `${label(key)} ${String(metadata[key])}`);
  return values.join(" · ");
}

function documentIdentityOptions(document: FinancialDocument, documents: FinancialDocument[]) {
  return documents.filter((candidate) => candidate.id !== document.id).map((candidate) => ({ id: candidate.id, name: candidate.sourceFileName }));
}

type DocumentVerificationGate = {
  canVerify: boolean;
  blockers: string[];
};

function documentVerificationGate(document: FinancialDocument): DocumentVerificationGate {
  const parserErrors = documentParserErrors(document);
  const unresolvedRows = (document.transactions ?? []).filter((transaction) =>
    !["RESOLVED", "REJECTED"].includes(transaction.reviewStatus.toUpperCase()),
  ).length;
  const typeMismatch = Boolean(document.detectedDocumentType &&
    document.detectedDocumentType !== document.documentType &&
    !["CORRECTED", "OVERRIDDEN"].includes(document.typeMismatchStatus ?? ""));
  const blockers: string[] = [];
  if (parserErrors.length) {
    blockers.push(`Parser issue: ${parserErrors[0]} Use Retry parser to re-read the preserved source, or upload a different readable source; this upload cannot be verified while parsing errors remain.`);
  }
  if (unresolvedRows) {
    blockers.push(`${unresolvedRows} bank statement row${unresolvedRows === 1 ? "" : "s"} still need a terminal review decision. Open the Review Queue to approve, correct, transfer, or reject them.`);
  }
  if (typeMismatch) {
    blockers.push(`The selected type (${label(document.documentType)}) differs from the detected type (${label(document.detectedDocumentType)}). Record the type decision before verification.`);
  }
  return { canVerify: blockers.length === 0, blockers };
}

function documentParserErrors(document: FinancialDocument): string[] {
  const metadata = document.sourceMetadata ?? {};
  return Array.isArray(metadata.parserErrors)
    ? metadata.parserErrors.filter((error): error is string => typeof error === "string" && Boolean(error.trim()))
    : [];
}

function documentReadiness(document: FinancialDocument) {
  const evidenceReady = document.reviewDecision === "VERIFIED";
  const evidenceLabel = evidenceReady
    ? "Evidence verified"
    : document.reviewDecision
      ? `Evidence ${label(document.reviewDecision).toLowerCase()}`
      : "Evidence pending";
  const typeReady = document.typeMismatchStatus === "CORRECTED"
    ? "Type corrected"
    : document.typeMismatchStatus === "OPEN"
      ? "Type review pending"
      : document.detectedDocumentType
        ? document.detectedDocumentType === document.documentType ? "Type confirmed" : "Type review pending"
        : "Type detection pending";
  const identityReady = document.identityStatus === "REVIEWED" || document.identityStatus === "DUPLICATE_REFERENCE";
  const identityLabel = identityReady
    ? "Identity reviewed"
    : document.identityStatus === "REVIEW_REQUIRED" ? "Identity review required" : "Identity review pending";
  const verificationGate = documentVerificationGate(document);
  return {
    complete: evidenceReady && (document.typeMismatchStatus === "CORRECTED" || (document.detectedDocumentType === document.documentType && document.typeMismatchStatus === "NONE")) && identityReady,
    hasIssue: document.typeMismatchStatus === "OPEN" || document.identityStatus === "REVIEW_REQUIRED" || verificationGate.blockers.length > 0,
    headline: evidenceLabel,
    detail: `${typeReady} · ${identityLabel}${verificationGate.blockers.length ? ` · ${verificationGate.blockers[0]}` : ""}`,
  };
}

function EvidenceMeta({ label: metaLabel, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="financial-meta"><span>{metaLabel}</span><strong className={mono ? "font-mono" : ""} title={value}>{value}</strong></div>;
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="operations-inline-error"><AlertCircle size={15} /><span>{message}</span><button className="btn" onClick={onRetry}><RefreshCw size={14} /> Retry</button></div>;
}

function QueueSkeleton() {
  return <div className="queue-skeleton"><div /><div /></div>;
}

function DocumentSkeleton() {
  return <div className="queue-skeleton"><div /><div /><div /></div>;
}

function QueueItemActions({
  item,
  document,
  canReview,
  handleDocReview,
  handleTxReview,
  correctionId,
  setCorrectionId,
  correctionAmount,
  setCorrectionAmount,
}: {
  item: ReviewQueueItem | undefined;
  document?: FinancialDocument;
  canReview: boolean;
  handleDocReview: (id: string, decision: "VERIFIED" | "REJECTED", reason: string) => Promise<void>;
  handleTxReview: (id: string, action: "APPROVE" | "REJECT" | "RECLASSIFY" | "MARK_TRANSFER", reason: string, correctedValue?: Record<string, unknown>) => Promise<void>;
  correctionId: string | null;
  setCorrectionId: (id: string | null) => void;
  correctionAmount: string;
  setCorrectionAmount: (amount: string) => void;
}) {
  const [reason, setReason] = useState("");
  if (!item) return <span className="document-pending-note">Specialized review required</span>;
  if (!canReview) return <span className="document-pending-note">Approver permission required</span>;
  if (item.type === "financial_document") {
    const verificationGate = document
      ? documentVerificationGate(document)
      : { canVerify: false, blockers: ["Open the document details to load its verification prerequisites."] };
    const parserErrors = document ? documentParserErrors(document) : [];
    if (parserErrors.length) {
      return <div className="queue-action-form"><span className="document-pending-note">Parser recovery is required before any document verification decision.</span><a href={`#financial-document-${item.id}`} className="btn btn-primary"><RefreshCw size={14} /> Retry parser</a></div>;
    }
    return <div className="queue-action-form"><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Decision reason required" maxLength={1000} />{!verificationGate.canVerify && <span className="document-pending-note">{verificationGate.blockers[0]} <a href={`#financial-document-${item.id}`} className="underline">Open document details</a></span>}{verificationGate.canVerify
      ? <button className="btn btn-primary" onClick={() => void handleDocReview(item.id, "VERIFIED", reason)} disabled={!reason.trim()}><Check size={14} /> Verify document</button>
      : <button className="btn" disabled title={verificationGate.blockers.join(" ")}><ShieldCheck size={14} /> Verification blocked</button>}
      <button className="btn" onClick={() => void handleDocReview(item.id, "REJECTED", reason)} disabled={!reason.trim()}><X size={14} /> Reject</button></div>;
  }
  if (item.type === "bank_statement_transaction") return <div className="queue-action-form">
    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Review reason required" maxLength={1000} />
    {correctionId === item.id && <input value={correctionAmount} onChange={(event) => setCorrectionAmount(event.target.value)} placeholder="Correct amount, for example 12.34" inputMode="decimal" />}
    <button className="btn btn-primary" onClick={() => void handleTxReview(item.id, "APPROVE", reason)} disabled={!reason.trim()}><Check size={14} /> Approve</button>
    <button className="btn" onClick={() => { setCorrectionId(correctionId === item.id ? null : item.id); setCorrectionAmount(""); }}><Tag size={14} /> Correct amount</button>
    {correctionId === item.id && <button className="btn" onClick={() => void handleTxReview(item.id, "RECLASSIFY", reason, { amount: correctionAmount })} disabled={!reason.trim() || !/^-?\d+\.\d{2}$/.test(correctionAmount)}><Check size={14} /> Save correction</button>}
    <button className="btn" onClick={() => void handleTxReview(item.id, "MARK_TRANSFER", reason)} disabled={!reason.trim()}><ArrowRightLeft size={14} /> Mark transfer</button>
    <button className="btn" onClick={() => void handleTxReview(item.id, "REJECT", reason)} disabled={!reason.trim()}><X size={14} /> Reject</button>
  </div>;
  const destination = queueItemDestination(item);
  return destination ? <Link href={destination.href} className="btn">{destination.label}</Link> : <span className="document-pending-note">Specialized review required</span>;
}