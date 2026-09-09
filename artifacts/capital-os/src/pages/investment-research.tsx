import { type ReactNode, useEffect, useState, useRef } from "react";
import {
  useListResearchDossiers,
  useRequestResearchEvidenceUpload,
  useRegisterResearchEvidence,
  useReviewResearchEvidence,
  useCreateResearchDossier,
  type ResearchEvidence,
} from "@workspace/api-client-react";
import { AlertCircle, FilePlus2, X, FileText, CheckCircle2, FlaskConical, Clock, Beaker, FileSearch } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function InvestmentResearchPage() {
  const { toast } = useToast();
  const dossiersQuery = useListResearchDossiers();
  
  const requestUpload = useRequestResearchEvidenceUpload();
  const registerEvidence = useRegisterResearchEvidence();
  const reviewEvidence = useReviewResearchEvidence();
  const createDossier = useCreateResearchDossier();
  
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProvenance, setUploadProvenance] = useState<"UPLOADED_LICENSED_RESEARCH" | "PRIMARY_SOURCE">("PRIMARY_SOURCE");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [dossierTitle, setDossierTitle] = useState("");
  const [dossierTicker, setDossierTicker] = useState("");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<Set<string>>(new Set());
  const [researchText, setResearchText] = useState("");
  const lastTemplateRef = useRef("");

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

  const handleCreateDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dossierTicker || !dossierTitle || selectedEvidenceIds.size === 0 || !researchText.trim() || researchText === lastTemplateRef.current) {
      toast({ title: "Research facts required", description: "Add source-linked facts or observations to the research text before compiling.", variant: "destructive" });
      return;
    }

    try {
      await createDossier.mutateAsync({
        data: {
          ticker: dossierTicker,
          title: dossierTitle,
          evidenceIds: Array.from(selectedEvidenceIds),
          digestionPayload: researchText
        }
      });
      toast({ title: "Dossier created", description: "Research dossier is pending provider synthesis." });
      setDossierTicker("");
      setDossierTitle("");
      setResearchText("");
      setSelectedEvidenceIds(new Set());
      void dossiersQuery.refetch();
    } catch (e) {
      toast({ title: "Dossier creation failed", description: e instanceof Error ? e.message : "Failed to create dossier", variant: "destructive" });
    }
  };

  const { data, isLoading, isError } = dossiersQuery;

  useEffect(() => {
    if (data?.evidence) {
      const newTemplate = generateTemplate(dossierTitle, dossierTicker, selectedEvidenceIds, data.evidence);
      if (researchText === "" || researchText === lastTemplateRef.current) {
        setResearchText(newTemplate);
        lastTemplateRef.current = newTemplate;
      }
    }
  }, [dossierTitle, dossierTicker, selectedEvidenceIds, data?.evidence]);

  if (isLoading) return <main className="content"><PageHeading eyebrow="Investment Research" title={<>Loading<br/><em>dossiers.</em></>} description="Initializing the research workspace." /><div className="loading-skeleton" style={{ height: 200 }} /></main>;
  
  if (isError || !data) return <main className="content"><PageHeading eyebrow="Investment Research" title={<>Workspace<br/><em>unavailable.</em></>} description="Could not load the research workspace." /><section className="card card-pad empty-state"><AlertCircle size={19} /><div><strong>Data unavailable</strong><p>Please try again later.</p></div></section></main>;

  const { dossiers, evidence, capabilityReadiness } = data;

  const getCapabilityClass = (status: string) => {
    if (status === "implemented") return "status text-green-500 bg-green-500/10";
    if (status === "PENDING_PROVIDER_CONFIRMATION") return "status pending";
    return "status text-red-500 bg-red-500/10 opacity-70";
  };

  return (
    <main className="content">
      <PageHeading 
        eyebrow="Investment Research" 
        title={<>Synthesis from<br/><em>evidence.</em></>} 
        description="Household-scoped, source-linked research from reviewed evidence and existing Schwab observations."
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
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Fundamentals</span><span className={getCapabilityClass(capabilityReadiness.fundamentals)}>Pending</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Instrument Metadata</span><span className={getCapabilityClass(capabilityReadiness.instrument_metadata)}>Pending</span></div>
            <div className="flex flex-col gap-2"><span className="text-xs text-[var(--ink-light)] uppercase tracking-wider">Price History</span><span className={getCapabilityClass(capabilityReadiness.price_history)}>Pending</span></div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {evidence.filter((e) => e.reviewStatus === "REVIEWED" && e.extractionStatus === "complete").map((item) => (
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
              {evidence.filter((e) => e.reviewStatus === "REVIEWED" && e.extractionStatus === "complete").length === 0 && (
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

          <div className="flex justify-end mt-4">
            <button type="submit" className="btn btn-primary" disabled={createDossier.isPending || selectedEvidenceIds.size === 0 || !dossierTicker || !dossierTitle || !researchText.trim() || researchText === lastTemplateRef.current}>
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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {dossiers.map((dossier) => (
              <article key={dossier.id} className="card card-pad flex flex-col gap-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg" style={{ lineHeight: 1.1 }}>{dossier.title}</h3>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="status">{dossier.ticker}</span>
                      <span className="text-xs" style={{ color: 'var(--ink-light)' }}>{new Date(dossier.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <span className={`status ${dossier.reportStatus === 'PENDING_PROVIDER' ? 'pending' : ''}`}>
                    {dossier.reportStatus?.replaceAll("_", " ")}
                  </span>
                </div>
                
                {dossier.reportStatus === "PENDING_PROVIDER" && (
                  <div className="p-4 rounded-md flex items-start gap-3 mt-2" style={{ backgroundColor: 'var(--bg-active)' }}>
                    <Clock size={16} style={{ color: 'var(--ink-light)', marginTop: '2px' }} />
                    <div>
                      <strong className="block text-sm mb-1">Awaiting synthesis</strong>
                      <p className="text-sm" style={{ color: 'var(--ink-light)' }}>The provider is currently processing this dossier. This may take several minutes depending on the evidence volume.</p>
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
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
