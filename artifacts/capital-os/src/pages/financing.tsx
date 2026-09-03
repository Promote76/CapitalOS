import { FormEvent, useState, type CSSProperties, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  FileCheck2,
  FileText,
  Home,
  Landmark,
  LockKeyhole,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  UserRound,
  X,
} from "lucide-react";
import {
  getGetFinancingSnapshotQueryKey,
  useCreateFinancingLiability,
  useCreateFinancingOffer,
  useCreateFinancingPipelineEvent,
  useCreateFinancingScenario,
  useGetFinancingSnapshot,
  useUpdateFinancingCreditProfile,
  useUpdateFinancingDocument,
  type FinancingDocument,
  type FinancingDocumentUpdateStatus,
  type FinancingLiabilityInput,
  type FinancingOfferInput,
  type FinancingPipelineEventInputToStage,
  type FinancingScenarioInput,
  type FinancingSnapshot,
} from "@workspace/api-client-react";

type Feedback = (message: string) => void;
type RecordValue = Record<string, unknown>;
type LiabilityOwnership = FinancingLiabilityInput["ownership"];
type Stage = FinancingPipelineEventInputToStage;

const stages: Stage[] = ["research", "readiness", "comparison", "human_review", "paused"];
const documentStatuses: FinancingDocumentUpdateStatus[] = ["needed", "in_review", "complete"];

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" ? (value as RecordValue) : {};
}

function firstValue(record: unknown, keys: string[], fallback: unknown = undefined): unknown {
  const source = asRecord(record);
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return fallback;
}

function textValue(value: unknown, fallback = "Not recorded") {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: unknown, fallback = "$0") {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `$${parsed.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : textValue(value, fallback);
}

function percent(value: unknown, fallback = "—") {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : textValue(value, fallback);
}

function label(value: unknown) {
  return textValue(value, "Not recorded")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: unknown) {
  if (!value) return "Not dated";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? textValue(value)
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function errorLabel(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return fallback;
}

function idempotencyKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `financing-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function statusClass(value: unknown) {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("complete") || normalized.includes("ready") || normalized.includes("pass") || normalized === "normal") return "positive";
  if (normalized.includes("needed") || normalized.includes("risk") || normalized.includes("pause") || normalized.includes("gap")) return "pending";
  if (normalized.includes("block") || normalized.includes("critical") || normalized.includes("fail")) return "review";
  return "";
}

function SkeletonBlock({ wide = false }: { wide?: boolean }) {
  return <div className={`financing-skeleton ${wide ? "wide" : ""}`} aria-hidden="true"><span /><span /><span /></div>;
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="financing-section-heading">
      <div>
        {eyebrow && <div className="mono-label">{eyebrow}</div>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function Metric({
  label: metricLabel,
  value,
  detail,
  tone = "",
  testId,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
  testId: string;
  icon: ReactNode;
}) {
  return (
    <article className={`financing-metric ${tone}`} data-testid={`card-${testId}`}>
      <div className="financing-metric-top"><span className="mono-label">{metricLabel}</span><span className="financing-metric-icon">{icon}</span></div>
      <strong data-testid={`text-${testId}`}>{value}</strong>
      <span data-testid={`text-${testId}-detail`}>{detail}</span>
    </article>
  );
}

function Modal({
  title,
  description,
  children,
  onClose,
  testId,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  testId: string;
}) {
  return (
    <div className="financing-modal-backdrop" role="presentation">
      <section className="financing-modal card" role="dialog" aria-modal="true" aria-labelledby={`${testId}-title`} data-testid={testId}>
        <div className="financing-modal-head">
          <div><div className="eyebrow">Record for review</div><h2 id={`${testId}-title`}>{title}</h2><p>{description}</p></div>
          <button className="icon-btn" type="button" aria-label="Close dialog" onClick={onClose} data-testid={`${testId}-close`}><X size={16} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

function LiabilityForm({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const mutation = useCreateFinancingLiability({ request: { headers: { "Idempotency-Key": idempotencyKey() } } });
  const queryClient = useQueryClient();
  const [ownership, setOwnership] = useState<LiabilityOwnership>("household");
  const [form, setForm] = useState({
    name: "",
    liabilityType: "mortgage",
    businessEntityId: "",
    currentBalance: "",
    monthlyPayment: "",
    interestRate: "",
    termMonths: "",
    remainingTermMonths: "",
    creditLimit: "",
    notes: "",
  });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (ownership === "business" && !form.businessEntityId.trim()) {
      onSaved("Business liabilities need a business entity ID before they can be recorded.");
      return;
    }
    try {
      const data: FinancingLiabilityInput = {
        name: form.name.trim(),
        liabilityType: form.liabilityType,
        ownership,
        businessEntityId: ownership === "business" ? form.businessEntityId.trim() : null,
        currentBalance: form.currentBalance,
        monthlyPayment: form.monthlyPayment,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        termMonths: form.termMonths ? Number(form.termMonths) : null,
        remainingTermMonths: form.remainingTermMonths ? Number(form.remainingTermMonths) : null,
        creditLimit: form.creditLimit || null,
        notes: form.notes || null,
      };
      await mutation.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetFinancingSnapshotQueryKey() });
      onClose();
      onSaved(`${ownership === "business" ? "Business" : "Household"} liability recorded for review.`);
    } catch (error) {
      onSaved(errorLabel(error, "The liability could not be recorded."));
    }
  };
  return (
    <Modal title="Add a liability" description="Keep the borrower boundary explicit. Business obligations remain outside household DTI." onClose={onClose} testId="dialog-add-liability">
      <form className="financing-form" onSubmit={(event) => { void submit(event); }}>
        <div className="financing-segmented" aria-label="Liability ownership">
          {(["household", "business"] as LiabilityOwnership[]).map((value) => (
            <button key={value} type="button" className={ownership === value ? "active" : ""} onClick={() => setOwnership(value)} data-testid={`button-liability-ownership-${value}`}>
              {value === "household" ? <UserRound size={14} /> : <Building2 size={14} />} {label(value)}
            </button>
          ))}
        </div>
        {ownership === "business" && <div className="financing-boundary-note"><Building2 size={15} /><span><strong>Business debt boundary.</strong> Enter the entity ID so this obligation is not folded into household records.</span></div>}
        <div className="financing-form-grid">
          <div className="field"><label htmlFor="liability-name">Name</label><input id="liability-name" required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Primary residence mortgage" data-testid="input-liability-name" /></div>
          <div className="field"><label htmlFor="liability-type">Type</label><select id="liability-type" value={form.liabilityType} onChange={(event) => update("liabilityType", event.target.value)} data-testid="select-liability-type"><option value="mortgage">Mortgage</option><option value="auto">Auto loan</option><option value="student">Student loan</option><option value="credit_card">Credit card</option><option value="line_of_credit">Line of credit</option><option value="other">Other</option></select></div>
          {ownership === "business" && <div className="field"><label htmlFor="liability-business-id">Business entity ID</label><input id="liability-business-id" required value={form.businessEntityId} onChange={(event) => update("businessEntityId", event.target.value)} placeholder="entity_…" data-testid="input-liability-business-entity-id" /></div>}
          <div className="field"><label htmlFor="liability-balance">Current balance</label><input id="liability-balance" required inputMode="decimal" value={form.currentBalance} onChange={(event) => update("currentBalance", event.target.value)} placeholder="0.00" data-testid="input-liability-current-balance" /></div>
          <div className="field"><label htmlFor="liability-payment">Monthly payment</label><input id="liability-payment" required inputMode="decimal" value={form.monthlyPayment} onChange={(event) => update("monthlyPayment", event.target.value)} placeholder="0.00" data-testid="input-liability-monthly-payment" /></div>
          <div className="field"><label htmlFor="liability-rate">Interest rate %</label><input id="liability-rate" inputMode="decimal" value={form.interestRate} onChange={(event) => update("interestRate", event.target.value)} placeholder="6.75" data-testid="input-liability-interest-rate" /></div>
          <div className="field"><label htmlFor="liability-term">Remaining term months</label><input id="liability-term" inputMode="numeric" value={form.remainingTermMonths} onChange={(event) => update("remainingTermMonths", event.target.value)} placeholder="240" data-testid="input-liability-remaining-term" /></div>
          <div className="field"><label htmlFor="liability-limit">Credit limit, if applicable</label><input id="liability-limit" inputMode="decimal" value={form.creditLimit} onChange={(event) => update("creditLimit", event.target.value)} placeholder="0.00" data-testid="input-liability-credit-limit" /></div>
          <div className="field financing-field-wide"><label htmlFor="liability-notes">Notes</label><textarea id="liability-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Source, assumption, or review note" data-testid="input-liability-notes" /></div>
        </div>
        <div className="financing-form-actions"><button type="button" className="btn" onClick={onClose} data-testid="button-cancel-liability">Cancel</button><button type="submit" className="btn btn-primary" disabled={mutation.isPending || !form.name || !form.currentBalance || !form.monthlyPayment} data-testid="button-save-liability">{mutation.isPending ? "Recording…" : "Record liability"}</button></div>
      </form>
    </Modal>
  );
}

function CreditProfileForm({ snapshot, onClose, onSaved }: { snapshot: FinancingSnapshot; onClose: () => void; onSaved: (message: string) => void }) {
  const mutation = useUpdateFinancingCreditProfile({ request: { headers: { "Idempotency-Key": idempotencyKey() } } });
  const queryClient = useQueryClient();
  const profile = snapshot.creditProfile;
  const [form, setForm] = useState({
    score: profile?.score == null ? "" : String(profile.score),
    scoreSource: profile?.scoreSource || "manual household entry",
    scoreConfidence: profile?.scoreConfidence || "self-reported",
    creditworthinessStatus: profile?.creditworthinessStatus || "not_assessed",
    paymentHistoryStatus: profile?.paymentHistoryStatus || "not_assessed",
    notes: profile?.notes || "",
  });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        data: {
          score: form.score ? Number(form.score) : null,
          scoreSource: form.scoreSource,
          scoreConfidence: form.scoreConfidence,
          creditworthinessStatus: form.creditworthinessStatus,
          paymentHistoryStatus: form.paymentHistoryStatus,
          notes: form.notes || null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getGetFinancingSnapshotQueryKey() });
      onClose();
      onSaved("Manual credit planning inputs saved. No credit pull was made.");
    } catch (error) {
      onSaved(errorLabel(error, "The credit profile could not be saved."));
    }
  };
  return (
    <Modal title="Enter credit planning inputs" description="This is a manual planning input, not a credit pull, creditworthiness decision, prequalification, preapproval, or lender approval." onClose={onClose} testId="dialog-credit-profile">
      <form className="financing-form" onSubmit={(event) => { void submit(event); }}>
        <div className="financing-boundary-note"><CreditCard size={15} /><span><strong>Planning input only.</strong> A reported score helps compare scenarios; it does not predict or establish lender action.</span></div>
        <div className="financing-form-grid">
          <div className="field"><label htmlFor="credit-score">Score</label><input id="credit-score" min="300" max="850" inputMode="numeric" value={form.score} onChange={(event) => update("score", event.target.value)} placeholder="Not recorded" data-testid="input-credit-score" /></div>
          <div className="field"><label htmlFor="credit-source">Source</label><input id="credit-source" value={form.scoreSource} onChange={(event) => update("scoreSource", event.target.value)} data-testid="input-credit-source" /></div>
          <div className="field"><label htmlFor="credit-confidence">Confidence</label><select id="credit-confidence" value={form.scoreConfidence} onChange={(event) => update("scoreConfidence", event.target.value)} data-testid="select-credit-confidence"><option value="self-reported">Self-reported</option><option value="estimated">Estimated</option><option value="documented">Documented</option></select></div>
          <div className="field"><label htmlFor="credit-payment-history">Payment history</label><select id="credit-payment-history" value={form.paymentHistoryStatus} onChange={(event) => update("paymentHistoryStatus", event.target.value)} data-testid="select-credit-payment-history"><option value="not_assessed">Not assessed</option><option value="on_time">On time</option><option value="mixed">Mixed</option><option value="late">Late history</option></select></div>
          <div className="field financing-field-wide"><label htmlFor="credit-notes">Review notes</label><textarea id="credit-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Where this input came from and when to revisit it" data-testid="input-credit-notes" /></div>
        </div>
        <div className="financing-form-actions"><button type="button" className="btn" onClick={onClose} data-testid="button-cancel-credit-profile">Cancel</button><button type="submit" className="btn btn-primary" disabled={mutation.isPending} data-testid="button-save-credit-profile">{mutation.isPending ? "Saving…" : "Save planning input"}</button></div>
      </form>
    </Modal>
  );
}

function ScenarioForm({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const mutation = useCreateFinancingScenario({ request: { headers: { "Idempotency-Key": idempotencyKey() } } });
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", loanType: "conventional", purchasePrice: "", downPayment: "20", interestRate: "", termYears: "30", closingCosts: "", initialReserves: "", mortgageInsurance: "", loanFees: "" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const data: FinancingScenarioInput = {
        name: form.name.trim(),
        loanType: form.loanType,
        purchasePrice: form.purchasePrice,
        downPaymentPercent: Number(form.downPayment) / 100,
        interestRate: Number(form.interestRate),
        termYears: Number(form.termYears),
        closingCosts: form.closingCosts || undefined,
        initialReserves: form.initialReserves || undefined,
        mortgageInsurance: form.mortgageInsurance || undefined,
        loanFees: form.loanFees || undefined,
      };
      await mutation.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetFinancingSnapshotQueryKey() });
      onClose();
      onSaved("Illustrative scenario added to the comparison set.");
    } catch (error) {
      onSaved(errorLabel(error, "The scenario could not be created."));
    }
  };
  return (
    <Modal title="Create an illustrative scenario" description="Assumptions stay visible and editable. This does not reserve funds or represent a lender decision." onClose={onClose} testId="dialog-create-scenario">
      <form className="financing-form" onSubmit={(event) => { void submit(event); }}>
        <div className="financing-form-grid">
          <div className="field financing-field-wide"><label htmlFor="scenario-name">Scenario name</label><input id="scenario-name" required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="20% down / conventional" data-testid="input-scenario-name" /></div>
          <div className="field"><label htmlFor="scenario-loan-type">Loan type</label><select id="scenario-loan-type" value={form.loanType} onChange={(event) => update("loanType", event.target.value)} data-testid="select-scenario-loan-type"><option value="conventional">Conventional</option><option value="fha">FHA</option><option value="va">VA</option><option value="portfolio">Portfolio</option><option value="other">Other</option></select></div>
          <div className="field"><label htmlFor="scenario-price">Purchase price</label><input id="scenario-price" required inputMode="decimal" value={form.purchasePrice} onChange={(event) => update("purchasePrice", event.target.value)} placeholder="0.00" data-testid="input-scenario-purchase-price" /></div>
          <div className="field"><label htmlFor="scenario-down-payment">Down payment %</label><input id="scenario-down-payment" required min="0" max="100" inputMode="decimal" value={form.downPayment} onChange={(event) => update("downPayment", event.target.value)} data-testid="input-scenario-down-payment" /></div>
          <div className="field"><label htmlFor="scenario-rate">Interest rate %</label><input id="scenario-rate" required min="0" max="100" inputMode="decimal" value={form.interestRate} onChange={(event) => update("interestRate", event.target.value)} placeholder="6.50" data-testid="input-scenario-interest-rate" /></div>
          <div className="field"><label htmlFor="scenario-term">Term years</label><input id="scenario-term" required min="1" max="50" inputMode="numeric" value={form.termYears} onChange={(event) => update("termYears", event.target.value)} data-testid="input-scenario-term-years" /></div>
          <div className="field"><label htmlFor="scenario-closing-costs">Closing costs</label><input id="scenario-closing-costs" inputMode="decimal" value={form.closingCosts} onChange={(event) => update("closingCosts", event.target.value)} placeholder="Optional" data-testid="input-scenario-closing-costs" /></div>
          <div className="field"><label htmlFor="scenario-reserves">Initial reserves</label><input id="scenario-reserves" inputMode="decimal" value={form.initialReserves} onChange={(event) => update("initialReserves", event.target.value)} placeholder="Optional" data-testid="input-scenario-initial-reserves" /></div>
        </div>
        <div className="financing-form-actions"><button type="button" className="btn" onClick={onClose} data-testid="button-cancel-scenario">Cancel</button><button type="submit" className="btn btn-primary" disabled={mutation.isPending || !form.name || !form.purchasePrice || !form.interestRate} data-testid="button-save-scenario">{mutation.isPending ? "Creating…" : "Create scenario"}</button></div>
      </form>
    </Modal>
  );
}

function OfferForm({ onClose, onSaved }: { onClose: () => void; onSaved: (message: string) => void }) {
  const mutation = useCreateFinancingOffer({ request: { headers: { "Idempotency-Key": idempotencyKey() } } });
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", lenderLabel: "", programLabel: "", loanType: "conventional", loanAmount: "", interestRate: "", termYears: "30", monthlyPayment: "", cashToClose: "", expirationDate: "", notes: "" });
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const data: FinancingOfferInput = {
        name: form.name.trim(),
        lenderLabel: form.lenderLabel || null,
        programLabel: form.programLabel,
        loanType: form.loanType,
        commitmentStatus: "indicative",
        offerStatus: "open",
        loanAmount: form.loanAmount,
        interestRate: Number(form.interestRate),
        termYears: Number(form.termYears),
        estimatedMonthlyPayment: form.monthlyPayment,
        estimatedCashToClose: form.cashToClose,
        expirationDate: form.expirationDate || null,
        assumptions: { source: "manual indication", binding: false },
        notes: form.notes || null,
      };
      await mutation.mutateAsync({ data });
      await queryClient.invalidateQueries({ queryKey: getGetFinancingSnapshotQueryKey() });
      onClose();
      onSaved("Non-binding rate indication recorded for comparison.");
    } catch (error) {
      onSaved(errorLabel(error, "The rate indication could not be recorded."));
    }
  };
  return (
    <Modal title="Record a rate indication" description="Capture a non-binding lender or rate indication. It is not a commitment, preapproval, or promise of financing." onClose={onClose} testId="dialog-create-offer">
      <form className="financing-form" onSubmit={(event) => { void submit(event); }}>
        <div className="financing-boundary-note"><Landmark size={15} /><span><strong>Comparison record only.</strong> Keep the source and assumptions clear; no lender approval claim is made here.</span></div>
        <div className="financing-form-grid">
          <div className="field"><label htmlFor="offer-name">Record name</label><input id="offer-name" required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Local bank / duplex indication" data-testid="input-offer-name" /></div>
          <div className="field"><label htmlFor="offer-lender">Lender label</label><input id="offer-lender" value={form.lenderLabel} onChange={(event) => update("lenderLabel", event.target.value)} placeholder="Optional" data-testid="input-offer-lender" /></div>
          <div className="field"><label htmlFor="offer-program">Program label</label><input id="offer-program" required value={form.programLabel} onChange={(event) => update("programLabel", event.target.value)} placeholder="Owner-occupied conventional" data-testid="input-offer-program" /></div>
          <div className="field"><label htmlFor="offer-loan-type">Loan type</label><select id="offer-loan-type" value={form.loanType} onChange={(event) => update("loanType", event.target.value)} data-testid="select-offer-loan-type"><option value="conventional">Conventional</option><option value="fha">FHA</option><option value="va">VA</option><option value="portfolio">Portfolio</option><option value="other">Other</option></select></div>
          <div className="field"><label htmlFor="offer-loan-amount">Loan amount</label><input id="offer-loan-amount" required inputMode="decimal" value={form.loanAmount} onChange={(event) => update("loanAmount", event.target.value)} placeholder="0.00" data-testid="input-offer-loan-amount" /></div>
          <div className="field"><label htmlFor="offer-rate">Rate %</label><input id="offer-rate" required inputMode="decimal" value={form.interestRate} onChange={(event) => update("interestRate", event.target.value)} placeholder="6.50" data-testid="input-offer-rate" /></div>
          <div className="field"><label htmlFor="offer-payment">Estimated monthly payment</label><input id="offer-payment" required inputMode="decimal" value={form.monthlyPayment} onChange={(event) => update("monthlyPayment", event.target.value)} placeholder="0.00" data-testid="input-offer-monthly-payment" /></div>
          <div className="field"><label htmlFor="offer-cash-to-close">Estimated cash to close</label><input id="offer-cash-to-close" required inputMode="decimal" value={form.cashToClose} onChange={(event) => update("cashToClose", event.target.value)} placeholder="0.00" data-testid="input-offer-cash-to-close" /></div>
          <div className="field"><label htmlFor="offer-expiration">Expiration date</label><input id="offer-expiration" type="date" value={form.expirationDate} onChange={(event) => update("expirationDate", event.target.value)} data-testid="input-offer-expiration" /></div>
          <div className="field financing-field-wide"><label htmlFor="offer-notes">Assumption notes</label><textarea id="offer-notes" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="What was quoted, when, and under which assumptions" data-testid="input-offer-notes" /></div>
        </div>
        <div className="financing-form-actions"><button type="button" className="btn" onClick={onClose} data-testid="button-cancel-offer">Cancel</button><button type="submit" className="btn btn-primary" disabled={mutation.isPending || !form.name || !form.programLabel || !form.loanAmount || !form.interestRate || !form.monthlyPayment || !form.cashToClose} data-testid="button-save-offer">{mutation.isPending ? "Recording…" : "Record indication"}</button></div>
      </form>
    </Modal>
  );
}

function ReadinessPanel({ snapshot }: { snapshot: FinancingSnapshot }) {
  const readiness = asRecord(snapshot.readiness);
  const score = numberValue(firstValue(readiness, ["score", "readinessScore", "value"]), 0);
  const reasons = Array.isArray(firstValue(readiness, ["reasons", "blockingReasons", "checks"])) ? firstValue(readiness, ["reasons", "blockingReasons", "checks"]) as unknown[] : [];
  const cash = asRecord(snapshot.cashToClose);
  const governor = asRecord(snapshot.capitalGovernor);
  const gap = numberValue(firstValue(cash, ["fundingGap", "gap", "shortfall"]), 0);
  const safeToBorrow = firstValue(cash, ["safeToBorrow", "safeToBorrowAmount", "availableAfterClose", "safeAmount"], firstValue(governor, ["safeToBorrow", "safeAmount"]));
  const cashRequired = firstValue(cash, ["estimatedCashToClose", "cashToClose", "required"]);
  const available = firstValue(cash, ["availableCash", "liquidCash", "available"]);
  const status = textValue(firstValue(readiness, ["status", "state"]), "Not assessed");
  return (
    <section className="financing-readiness card card-pad" data-testid="card-financing-readiness">
      <SectionHeader eyebrow="Decision gate" title="Readiness, without a shortcut." subtitle="A score is a review aid. The reasons beside it are the actual work." action={<span className={`status ${statusClass(status)}`} data-testid="status-financing-readiness">{label(status)}</span>} />
      <div className="financing-readiness-body">
        <div className="financing-score-ring" style={{ "--score": `${Math.min(100, Math.max(0, score))}%` } as CSSProperties}><strong data-testid="text-financing-readiness-score">{score ? Math.round(score) : "—"}</strong><span>/ 100</span></div>
        <div className="financing-reasons">
          <div className="mono-label">Review reasons</div>
          {reasons.length > 0 ? reasons.slice(0, 5).map((reason, index) => <div className="financing-reason" key={`${String(reason)}-${index}`} data-testid={`text-financing-readiness-reason-${index}`}><span>{String(reason)}</span></div>) : <div className="financing-reason quiet" data-testid="text-financing-readiness-reason-empty"><CheckCircle2 size={14} /> No readiness reasons were returned.</div>}
        </div>
      </div>
      <div className="financing-cash-grid">
        <div><span className="mono-label">Safe to borrow</span><strong data-testid="text-financing-safe-to-borrow">{money(safeToBorrow, "Not calculated")}</strong><small>Planning guardrail, not a lending limit.</small></div>
        <div><span className="mono-label">Cash to close</span><strong data-testid="text-financing-cash-required">{money(cashRequired, "Not calculated")}</strong><small>{available !== undefined ? `${money(available)} available cash` : "Available cash not recorded."}</small></div>
        <div className={gap > 0 ? "gap" : ""}><span className="mono-label">Funding gap</span><strong data-testid="text-financing-funding-gap">{gap > 0 ? money(gap) : gap === 0 ? "None visible" : "Not calculated"}</strong><small>{gap > 0 ? "The current plan does not fund this close." : "Protected reserves stay outside the calculation."}</small></div>
      </div>
    </section>
  );
}

function CreditPanel({ snapshot, onEdit }: { snapshot: FinancingSnapshot; onEdit: () => void }) {
  const profile = snapshot.creditProfile;
  const utilization = profile?.utilizationPercent;
  return (
    <section className="card card-pad" data-testid="card-financing-credit-profile">
      <SectionHeader eyebrow="Credit inputs" title="A profile, not a pull." subtitle="Manual inputs support comparison and are never presented as lender evidence." action={<button className="btn" type="button" onClick={onEdit} data-testid="button-edit-credit-profile"><SlidersHorizontal size={14} /> Edit inputs</button>} />
      <div className="credit-profile-main">
        <div className="credit-score-block"><span className="mono-label">Reported score</span><strong data-testid="text-financing-credit-score">{profile?.score ?? "—"}</strong><span data-testid="text-financing-credit-source">{textValue(profile?.scoreSource, "No source recorded")}</span></div>
        <div className="credit-profile-facts">
          <div><span>Confidence</span><strong data-testid="text-financing-credit-confidence">{label(profile?.scoreConfidence)}</strong></div>
          <div><span>Payment history</span><strong data-testid="text-financing-payment-history">{label(profile?.paymentHistoryStatus)}</strong></div>
          <div><span>Planning status</span><strong data-testid="text-financing-creditworthiness">{label(profile?.creditworthinessStatus)}</strong></div>
        </div>
      </div>
      <div className="utilization-block"><div><span className="mono-label">Revolving utilization</span><strong data-testid="text-financing-utilization">{percent(utilization)}</strong></div><div className="progress-track"><div className="progress-fill financing-utilization-fill" style={{ width: `${Math.min(100, Math.max(0, numberValue(utilization)))}%` }} /></div></div>
      <div className="financing-disclaimer"><LockKeyhole size={13} /> Not a credit pull, creditworthiness decision, prequalification, preapproval, or lender approval.</div>
    </section>
  );
}

function RatioPanel({ snapshot }: { snapshot: FinancingSnapshot }) {
  const readiness = asRecord(snapshot.readiness);
  const dti = firstValue(readiness, ["dti", "dtiPercent", "debtToIncome"]);
  const dscr = firstValue(readiness, ["propertyDscr", "propertyDSCR", "dscr"]);
  const utilization = snapshot.creditProfile?.utilizationPercent;
  return (
    <section className="card card-pad" data-testid="card-financing-ratios">
      <SectionHeader eyebrow="Separate lenses" title="Ratios stay in their lane." subtitle="Household DTI is not property DSCR, and neither is revolving utilization." />
      <div className="ratio-list">
        <div className="ratio-row"><div className="ratio-icon household"><UserRound size={15} /></div><div><strong>Household DTI</strong><span>Household obligations ÷ household income</span></div><b data-testid="text-financing-dti">{percent(dti)}</b></div>
        <div className="ratio-row"><div className="ratio-icon property"><Home size={15} /></div><div><strong>Property DSCR</strong><span>Property operating income ÷ property debt service</span></div><b data-testid="text-financing-dscr">{dscr === undefined ? "—" : numberValue(dscr).toFixed(2)}</b></div>
        <div className="ratio-row"><div className="ratio-icon credit"><CreditCard size={15} /></div><div><strong>Utilization</strong><span>Revolving balance ÷ revolving limit</span></div><b data-testid="text-financing-ratio-utilization">{percent(utilization)}</b></div>
      </div>
    </section>
  );
}

function LiabilitySection({ snapshot, onAdd }: { snapshot: FinancingSnapshot; onAdd: () => void }) {
  const household = snapshot.liabilities?.filter((item) => item.ownership !== "business") ?? [];
  const business = snapshot.liabilities?.filter((item) => item.ownership === "business") ?? [];
  const list = (items: typeof household, kind: "household" | "business") => (
    <div className={`financing-liability-group ${kind}`}>
      <div className="financing-subheading"><span>{kind === "business" ? <Building2 size={14} /> : <UserRound size={14} />} {kind === "business" ? "Business debt" : "Household debt"}</span><span data-testid={`text-financing-${kind}-liability-count`}>{items.length} recorded</span></div>
      {items.length === 0 ? <div className="financing-empty-line" data-testid={`text-financing-${kind}-liabilities-empty`}>No {kind} liabilities recorded.</div> : items.map((item) => (
        <div className="financing-liability-row" key={item.id} data-testid={`row-financing-liability-${item.id}`}>
          <div className="financing-liability-symbol">{kind === "business" ? <Building2 size={15} /> : <CreditCard size={15} />}</div>
          <div className="financing-liability-copy"><strong data-testid={`text-financing-liability-name-${item.id}`}>{item.name}</strong><span>{label(item.liabilityType)} · {label(item.status)}</span>{kind === "business" && <small>Entity {textValue(item.businessEntityId, "not attached")}</small>}</div>
          <div className="financing-liability-number"><strong data-testid={`text-financing-liability-balance-${item.id}`}>{money(item.currentBalance)}</strong><span>{money(item.monthlyPayment)}/mo</span></div>
        </div>
      ))}
    </div>
  );
  return (
    <section className="card card-pad" data-testid="card-financing-liabilities">
      <SectionHeader eyebrow="Obligations" title="Debt with a clear owner." subtitle="Household debt informs household DTI. Business debt stays visibly separate." action={<button className="btn btn-primary" type="button" onClick={onAdd} data-testid="button-add-financing-liability"><Plus size={14} /> Add liability</button>} />
      <div className="financing-liability-columns">{list(household, "household")}{list(business, "business")}</div>
    </section>
  );
}

function ScenarioSection({ snapshot, onAdd }: { snapshot: FinancingSnapshot; onAdd: () => void }) {
  return (
    <section className="card card-pad" data-testid="card-financing-scenarios">
      <SectionHeader eyebrow="Illustrative only" title="Scenario table" subtitle="Change one assumption at a time. Loan proceeds are cash plus liability, never income." action={<button className="btn btn-primary" type="button" onClick={onAdd} data-testid="button-add-financing-scenario"><Plus size={14} /> New scenario</button>} />
      {snapshot.scenarios?.length ? <div className="financing-scenario-table">{snapshot.scenarios.map((item) => <article className="financing-scenario-row" key={item.id} data-testid={`row-financing-scenario-${item.id}`}><div className="financing-scenario-name"><span className="financing-index">{item.name.slice(0, 1).toUpperCase()}</span><div><strong data-testid={`text-financing-scenario-name-${item.id}`}>{item.name}</strong><span>{label(item.loanType)} · {item.termYears} year term</span></div></div><div><span className="mono-label">Purchase</span><strong data-testid={`text-financing-scenario-price-${item.id}`}>{money(item.purchasePrice)}</strong></div><div><span className="mono-label">Down</span><strong>{percent(numberValue(item.downPaymentPercent) * 100)}</strong></div><div><span className="mono-label">Rate</span><strong>{percent(item.interestRate)}</strong></div><div><span className="mono-label">Housing / mo</span><strong data-testid={`text-financing-scenario-housing-${item.id}`}>{money(item.estimatedMonthlyHousingCost)}</strong></div></article>)}</div> : <div className="empty-state financing-empty"><SlidersHorizontal size={20} /><h3>No scenarios yet.</h3><p>Start with a visible assumption set for the first duplex. Nothing here changes household funds.</p><button className="btn" type="button" onClick={onAdd} data-testid="button-empty-add-scenario"><Plus size={14} /> Create first scenario</button></div>}
    </section>
  );
}

function OfferSection({ snapshot, onAdd }: { snapshot: FinancingSnapshot; onAdd: () => void }) {
  return (
    <section className="card card-pad" data-testid="card-financing-offers">
      <SectionHeader eyebrow="External indications" title="Offer comparison" subtitle="Indications are recorded with assumptions; no offer is treated as approval." action={<button className="btn" type="button" onClick={onAdd} data-testid="button-add-financing-offer"><Plus size={14} /> Record indication</button>} />
      {snapshot.offers?.length ? <div className="financing-offer-list">{snapshot.offers.map((offer) => <article className="financing-offer-row" key={offer.id} data-testid={`row-financing-offer-${offer.id}`}><div className="financing-offer-main"><div className="financing-offer-icon"><Landmark size={15} /></div><div><strong data-testid={`text-financing-offer-name-${offer.id}`}>{offer.name}</strong><span>{textValue(offer.lenderLabel, "Source not named")} · {offer.programLabel}</span></div></div><div><span className="mono-label">Rate</span><strong data-testid={`text-financing-offer-rate-${offer.id}`}>{percent(offer.interestRate)}</strong></div><div><span className="mono-label">Payment</span><strong>{money(offer.estimatedMonthlyPayment)}</strong></div><div><span className="mono-label">Cash to close</span><strong>{money(offer.estimatedCashToClose)}</strong></div><span className={`status ${statusClass(offer.commitmentStatus)}`} data-testid={`status-financing-offer-${offer.id}`}>{label(offer.commitmentStatus)}</span></article>)}</div> : <div className="financing-empty-line" data-testid="text-financing-offers-empty">No rate indications have been recorded. Add one only when its assumptions are clear.</div>}
    </section>
  );
}

function DocumentsSection({ snapshot, onFeedback }: { snapshot: FinancingSnapshot; onFeedback: Feedback }) {
  const mutation = useUpdateFinancingDocument({ request: { headers: { "Idempotency-Key": idempotencyKey() } } });
  const queryClient = useQueryClient();
  const updateStatus = async (document: FinancingDocument, status: FinancingDocumentUpdateStatus) => {
    try {
      await mutation.mutateAsync({ documentId: document.id, data: { status } });
      await queryClient.invalidateQueries({ queryKey: getGetFinancingSnapshotQueryKey() });
      onFeedback(`${document.name} marked ${label(status).toLowerCase()}.`);
    } catch (error) {
      onFeedback(errorLabel(error, "The document requirement could not be updated."));
    }
  };
  return (
    <section className="card card-pad" data-testid="card-financing-documents">
      <SectionHeader eyebrow="Readiness evidence" title="Document checklist" subtitle="Status is a household review record, not a lender guarantee." action={<FileCheck2 size={18} />} />
      {snapshot.documents?.length ? <div className="financing-document-list">{snapshot.documents.map((document) => <article className="financing-document-row" key={document.id} data-testid={`row-financing-document-${document.id}`}><div className="financing-document-icon"><FileText size={15} /></div><div className="financing-document-copy"><strong data-testid={`text-financing-document-name-${document.id}`}>{document.name}</strong><span>{label(document.category)} · {label(document.sensitivity)}{document.dueDate ? ` · due ${dateLabel(document.dueDate)}` : ""}</span></div><div className="financing-document-actions"><span className={`status ${statusClass(document.status)}`} data-testid={`status-financing-document-${document.id}`}>{label(document.status)}</span><div className="financing-status-buttons">{documentStatuses.map((status) => <button key={status} className={document.status === status ? "selected" : ""} type="button" onClick={() => { void updateStatus(document, status); }} disabled={mutation.isPending} aria-label={`${label(document.name)}: mark ${label(status)}`} data-testid={`button-document-${status}-${document.id}`}><span className="financing-button-dot" />{label(status)}</button>)}</div></div></article>)}</div> : <div className="empty-state financing-empty"><FileCheck2 size={20} /><h3>No document requirements yet.</h3><p>When readiness asks for evidence, each item will have an explicit status here.</p></div>}
    </section>
  );
}

function PipelineSection({ snapshot, onFeedback }: { snapshot: FinancingSnapshot; onFeedback: Feedback }) {
  const mutation = useCreateFinancingPipelineEvent({ request: { headers: { "Idempotency-Key": idempotencyKey() } } });
  const queryClient = useQueryClient();
  const pipeline = asRecord(snapshot.pipeline);
  const events = Array.isArray(pipeline.events) ? pipeline.events as RecordValue[] : [];
  const currentStage = textValue(firstValue(pipeline, ["currentStage", "stage", "status"]), events.length ? textValue(firstValue(events[events.length - 1], ["toStage"])) : "research");
  const [stage, setStage] = useState<Stage>((stages.includes(currentStage as Stage) ? currentStage : "research") as Stage);
  const [note, setNote] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await mutation.mutateAsync({ data: { toStage: stage, note: note || null } });
      await queryClient.invalidateQueries({ queryKey: getGetFinancingSnapshotQueryKey() });
      setNote("");
      onFeedback(`Pipeline moved to ${label(stage)}.`);
    } catch (error) {
      onFeedback(errorLabel(error, "The pipeline stage could not be recorded."));
    }
  };
  return (
    <section className="card card-pad" data-testid="card-financing-pipeline">
      <SectionHeader eyebrow="Advisory workflow" title="Move the review forward." subtitle="Stages are a record of human review, never an automated approval path." action={<span className="status pending" data-testid="status-financing-pipeline-stage">{label(currentStage)}</span>} />
      <form className="financing-pipeline-form" onSubmit={(event) => { void submit(event); }}>
        <div className="field"><label htmlFor="pipeline-stage">Next stage</label><select id="pipeline-stage" value={stage} onChange={(event) => setStage(event.target.value as Stage)} data-testid="select-financing-pipeline-stage">{stages.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></div>
        <div className="field"><label htmlFor="pipeline-note">Review note</label><input id="pipeline-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What changed, and who reviewed it?" data-testid="input-financing-pipeline-note" /></div>
        <button className="btn btn-primary" type="submit" disabled={mutation.isPending} data-testid="button-save-financing-pipeline">{mutation.isPending ? "Recording…" : "Record stage"}</button>
      </form>
      <div className="financing-timeline" data-testid="list-financing-pipeline-events">
        {events.length ? events.slice().reverse().map((event, index) => <div className="financing-timeline-item" key={`${String(event.id ?? index)}-${index}`} data-testid={`row-financing-pipeline-event-${String(event.id ?? index)}`}><span className="financing-timeline-dot" /><div><strong>{label(firstValue(event, ["toStage"]))}</strong><span>{firstValue(event, ["fromStage"]) ? `from ${label(firstValue(event, ["fromStage"]))} · ` : ""}{dateLabel(firstValue(event, ["createdAt"]))}</span>{Boolean(firstValue(event, ["note"])) && <small>{String(firstValue(event, ["note"]))}</small>}</div></div>) : <div className="financing-empty-line" data-testid="text-financing-pipeline-empty">No stage changes recorded. Research is the starting point.</div>}
      </div>
    </section>
  );
}

function PolicyCard({ snapshot }: { snapshot: FinancingSnapshot }) {
  const policy = snapshot.policy;
  return (
    <section className="financing-policy card" data-testid="card-financing-policy">
      <div className="financing-policy-seal"><ShieldCheck size={19} /></div>
      <div className="financing-policy-copy"><div className="mono-label">Policy boundary · {label(policy?.mode)}</div><h2>Review first. Borrow second.</h2><p data-testid="text-financing-policy-disclaimer">{textValue(policy?.disclaimer, "Financing records are advisory only. No lender approval is represented.")}</p><div className="financing-policy-tags"><span className={`status ${policy?.executionEnabled ? "review" : "positive"}`} data-testid="status-financing-execution">{policy?.executionEnabled ? "Execution enabled" : "No execution"}</span><span className={`status ${policy?.providersEnabled ? "" : "positive"}`} data-testid="status-financing-providers">{policy?.providersEnabled ? "Provider data enabled" : "Provider data off"}</span><span className="status positive" data-testid="status-financing-loan-treatment">Loan proceeds are cash plus liability</span></div></div>
      <div className="financing-policy-list"><span className="mono-label">Do not confuse</span>{(policy?.prohibitedActions ?? []).slice(0, 4).map((item) => <div key={item}><X size={12} /> {item}</div>)}{(!policy?.prohibitedActions?.length) && <div><Check size={12} /> No prohibited actions returned.</div>}</div>
    </section>
  );
}

export default function FinancingPage({ onFeedback }: { onFeedback: Feedback }) {
  const query = useGetFinancingSnapshot();
  const snapshot = query.data as FinancingSnapshot | undefined;
  const [dialog, setDialog] = useState<"liability" | "credit" | "scenario" | "offer" | null>(null);
  const readiness = asRecord(snapshot?.readiness);
  const cash = asRecord(snapshot?.cashToClose);
  const ratios = asRecord(snapshot?.readiness);
  const readinessStatus = textValue(firstValue(readiness, ["status", "state"]), "Not assessed");
  const safeToBorrow = firstValue(cash, ["safeToBorrow", "safeToBorrowAmount", "safeAmount"], firstValue(asRecord(snapshot?.capitalGovernor), ["safeToBorrow"]));
  const cashGap = numberValue(firstValue(cash, ["fundingGap", "gap", "shortfall"]), 0);
  const dti = firstValue(ratios, ["dti", "dtiPercent", "debtToIncome"]);
  const refresh = () => { void query.refetch(); };
  const pageFeedback = (message: string) => onFeedback(message);
  const modal = dialog === "liability" && <LiabilityForm onClose={() => setDialog(null)} onSaved={pageFeedback} />;
  return (
    <main className="content financing-page">
      <style>{`
        .financing-page{--fin-ink:#23463e;--fin-soft:#58716a;--fin-line:#e3ded1;--fin-paper:#fffdf8;--fin-wash:#e7eee5}
        .financing-page .page-heading{margin-bottom:24px}.financing-page .page-heading h1{max-width:620px}.financing-page .page-heading p{max-width:650px}
        .financing-kicker{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.financing-kicker .status{font-size:9px}
        .financing-header-note{font:10px var(--app-font-mono);color:var(--fin-soft);max-width:250px;line-height:1.6;text-align:right}
        .financing-metric-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.financing-metric{padding:18px 19px;border:1px solid var(--fin-line);border-radius:10px;background:rgba(255,253,248,.78);box-shadow:var(--shadow-soft)}.financing-metric.tone-green{background:#e7eee5;border-color:#d0ddd0}.financing-metric.tone-amber{background:#f5edd9;border-color:#e9dbb9}.financing-metric.tone-clay{background:#f2e5df;border-color:#e8d2c9}.financing-metric-top{display:flex;justify-content:space-between;gap:8px}.financing-metric-icon{color:var(--fin-soft)}.financing-metric strong{display:block;font:400 31px var(--app-font-serif);letter-spacing:-.05em;margin:12px 0 3px}.financing-metric>span:last-child{font-size:11px;color:var(--fin-soft);line-height:1.35}
        .financing-policy{display:grid;grid-template-columns:auto minmax(0,1.25fr) minmax(220px,.75fr);gap:18px;align-items:start;padding:24px;background:#e3ece4;border-color:#cfddd1;box-shadow:none;margin-bottom:18px}.financing-policy-seal{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(226,189,103,.23);color:#a27c2e}.financing-policy-copy h2,.financing-section-heading h2{font:400 27px/1.05 var(--app-font-serif);letter-spacing:-.04em;margin:6px 0 7px}.financing-policy-copy p{font-size:12px;color:#4e6b5e;line-height:1.55;margin:0;max-width:540px}.financing-policy-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:15px}.financing-policy-tags .status{font-size:9px}.financing-policy-list{border-left:1px solid rgba(35,70,62,.16);padding-left:18px;display:grid;gap:8px;color:#4e6b5e;font-size:11px;line-height:1.35}.financing-policy-list div{display:flex;gap:7px;align-items:flex-start}.financing-policy-list svg{flex:0 0 auto;margin-top:2px;color:#9e5d47}
        .financing-readiness-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);gap:18px;margin-bottom:18px}.financing-section-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:20px}.financing-section-heading h2{color:var(--ink);margin-top:5px}.financing-section-heading p{color:var(--ink-soft);font-size:11px;line-height:1.45;margin:0;max-width:520px}.financing-readiness-body{display:grid;grid-template-columns:118px 1fr;gap:25px;align-items:center}.financing-score-ring{width:112px;height:112px;border-radius:50%;display:grid;place-items:center;align-content:center;background:conic-gradient(var(--ink) var(--score),rgba(35,70,62,.11) 0);position:relative}.financing-score-ring:after{content:"";position:absolute;inset:10px;background:var(--card);border-radius:50%}.financing-score-ring strong,.financing-score-ring span{position:relative;z-index:1}.financing-score-ring strong{font:400 32px var(--app-font-mono);letter-spacing:-.08em}.financing-score-ring span{font:9px var(--app-font-mono);color:var(--ink-soft)}.financing-reasons{display:grid;gap:9px}.financing-reason{display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.35;color:var(--ink)}.financing-reason:before{content:"";width:6px;height:6px;border-radius:50%;background:var(--clay);margin-top:4px;flex:0 0 auto}.financing-reason.quiet{color:var(--ink-soft)}.financing-reason.quiet:before{display:none}.financing-cash-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}.financing-cash-grid>div{padding-right:10px;border-right:1px solid var(--line)}.financing-cash-grid>div:last-child{border:0}.financing-cash-grid strong{display:block;font:400 22px var(--app-font-serif);letter-spacing:-.04em;margin:7px 0 2px}.financing-cash-grid small{display:block;color:var(--ink-soft);font-size:10px;line-height:1.35}.financing-cash-grid .gap strong{color:#9e5d47}
        .credit-profile-main{display:grid;grid-template-columns:1fr 1.5fr;gap:20px;align-items:center}.credit-score-block{padding-right:20px;border-right:1px solid var(--line)}.credit-score-block strong{display:block;font:400 46px var(--app-font-serif);letter-spacing:-.07em;margin:8px 0 2px}.credit-score-block>span:last-child{font-size:10px;color:var(--ink-soft)}.credit-profile-facts{display:grid;gap:10px}.credit-profile-facts div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #eee9df;padding-bottom:8px}.credit-profile-facts div:last-child{border:0;padding-bottom:0}.credit-profile-facts span{font-size:10px;color:var(--ink-soft)}.credit-profile-facts strong{font-size:11px;font-weight:600;text-align:right}.utilization-block{margin-top:20px;padding-top:17px;border-top:1px solid var(--line)}.utilization-block>div:first-child{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.utilization-block strong{font:11px var(--app-font-mono)}.financing-utilization-fill{background:var(--clay)}.financing-disclaimer{display:flex;gap:7px;align-items:flex-start;margin-top:18px;color:#866c62;font-size:10px;line-height:1.4}.financing-disclaimer svg{flex:0 0 auto;margin-top:1px}
        .financing-main-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);gap:18px}.financing-main-grid>.card,.financing-main-grid>section{min-width:0}.financing-main-grid .financing-liabilities{grid-column:1/-1}.financing-liability-columns{display:grid;grid-template-columns:1fr 1fr;gap:22px}.financing-liability-group{min-width:0}.financing-liability-group.business{border-left:2px solid #e2bd67;padding-left:20px}.financing-subheading{display:flex;justify-content:space-between;align-items:center;color:var(--ink-soft);font:10px var(--app-font-mono);text-transform:uppercase;letter-spacing:.08em;padding-bottom:10px;border-bottom:1px solid var(--line)}.financing-subheading span:first-child{display:flex;gap:7px;align-items:center;color:var(--ink)}.financing-liability-row{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:13px 0;border-bottom:1px solid #eee9df}.financing-liability-row:last-child{border-bottom:0}.financing-liability-symbol{width:29px;height:29px;border-radius:8px;display:grid;place-items:center;background:var(--mist);color:var(--ink)}.business .financing-liability-symbol{background:#f4ebd3;color:#9b742e}.financing-liability-copy{min-width:0}.financing-liability-copy strong,.financing-liability-copy span,.financing-liability-copy small{display:block}.financing-liability-copy strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.financing-liability-copy span{color:var(--ink-soft);font-size:10px;margin-top:3px}.financing-liability-copy small{color:#9b742e;font:9px var(--app-font-mono);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.financing-liability-number{text-align:right}.financing-liability-number strong{display:block;font:11px var(--app-font-mono)}.financing-liability-number span{display:block;color:var(--ink-soft);font-size:10px;margin-top:3px}.financing-empty-line{padding:20px 0;color:var(--ink-soft);font-size:11px}.financing-empty{margin-top:0;padding:28px 18px}.financing-empty h3{font-size:21px}
        .ratio-list{display:grid;gap:14px}.ratio-row{display:grid;grid-template-columns:31px 1fr auto;gap:10px;align-items:center}.ratio-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:8px}.ratio-icon.household{background:#e7eee5;color:var(--ink)}.ratio-icon.property{background:#f4ebd3;color:#9b742e}.ratio-icon.credit{background:#f2e2dc;color:#9e5d47}.ratio-row strong,.ratio-row span{display:block}.ratio-row strong{font-size:12px}.ratio-row span{font-size:10px;color:var(--ink-soft);margin-top:3px;line-height:1.3}.ratio-row b{font:400 16px var(--app-font-mono);color:var(--ink)}
        .financing-scenario-table,.financing-offer-list,.financing-document-list{display:grid}.financing-scenario-row{display:grid;grid-template-columns:minmax(180px,1.7fr) repeat(4,minmax(72px,1fr));gap:14px;align-items:center;padding:14px 0;border-top:1px solid #eee9df}.financing-scenario-name,.financing-offer-main{display:flex;align-items:center;gap:10px;min-width:0}.financing-index{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#e7eee5;font:11px var(--app-font-mono);flex:0 0 auto}.financing-scenario-name strong,.financing-scenario-name span{display:block}.financing-scenario-name strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.financing-scenario-name span,.financing-offer-main span{font-size:10px;color:var(--ink-soft);margin-top:3px}.financing-scenario-row>div:not(:first-child) span,.financing-scenario-row>div:not(:first-child) strong{display:block}.financing-scenario-row>div:not(:first-child) strong,.financing-offer-row>div:not(:first-child) strong{font:11px var(--app-font-mono);margin-top:7px}.financing-offer-row{display:grid;grid-template-columns:minmax(190px,1.5fr) repeat(3,minmax(75px,1fr)) auto;gap:13px;align-items:center;padding:14px 0;border-top:1px solid #eee9df}.financing-offer-icon{width:28px;height:28px;border-radius:8px;background:#f4ebd3;color:#9b742e;display:grid;place-items:center;flex:0 0 auto}.financing-offer-main strong,.financing-offer-main span{display:block}.financing-offer-main strong{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.financing-offer-row .status{justify-self:end}
        .financing-document-row{display:grid;grid-template-columns:30px 1fr auto;gap:11px;align-items:start;padding:13px 0;border-top:1px solid #eee9df}.financing-document-icon{width:29px;height:29px;border-radius:8px;display:grid;place-items:center;background:#e7eee5;color:var(--ink)}.financing-document-copy strong,.financing-document-copy span{display:block}.financing-document-copy strong{font-size:12px}.financing-document-copy span{font-size:10px;color:var(--ink-soft);margin-top:3px}.financing-document-actions{display:flex;flex-direction:column;align-items:flex-end;gap:7px}.financing-status-buttons{display:flex;gap:5px}.financing-status-buttons button{border:1px solid var(--line);border-radius:5px;background:transparent;color:var(--ink-soft);font-size:9px;padding:5px 7px;display:inline-flex;gap:4px;align-items:center}.financing-status-buttons button:hover,.financing-status-buttons button.selected{color:var(--ink);background:#f0ede3;border-color:#c8bfae}.financing-status-buttons button.selected{font-weight:600}.financing-button-dot{width:4px;height:4px;border-radius:50%;background:currentColor}
        .financing-pipeline-form{display:grid;grid-template-columns:160px 1fr auto;gap:10px;align-items:end;padding-bottom:18px;border-bottom:1px solid var(--line)}.financing-pipeline-form .field label{margin-bottom:6px}.financing-timeline{display:grid;margin-top:18px}.financing-timeline-item{display:grid;grid-template-columns:17px 1fr;gap:10px;position:relative;padding:0 0 17px}.financing-timeline-item:last-child{padding-bottom:0}.financing-timeline-item:not(:last-child):before{content:"";position:absolute;left:6px;top:14px;bottom:0;border-left:1px solid #d8d1c3}.financing-timeline-dot{width:13px;height:13px;border-radius:50%;background:var(--marigold);border:3px solid #f4ebd3;position:relative;z-index:1}.financing-timeline-item strong,.financing-timeline-item span,.financing-timeline-item small{display:block}.financing-timeline-item strong{font-size:11px}.financing-timeline-item span{font:9px var(--app-font-mono);color:var(--ink-soft);margin-top:3px}.financing-timeline-item small{font-size:10px;color:var(--ink-soft);margin-top:5px;line-height:1.4}
        .financing-loading-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.financing-skeleton{height:104px;border-radius:10px;border:1px solid var(--line);background:linear-gradient(90deg,#f0ede3 25%,#faf8f2 50%,#f0ede3 75%);background-size:200% 100%;animation:financing-shimmer 1.4s infinite}.financing-skeleton.wide{height:260px;margin-top:18px}@keyframes financing-shimmer{to{background-position:-200% 0}}.financing-inline-error{display:flex;align-items:center;gap:10px;color:#9e5d47}.financing-inline-error button{margin-left:auto}
        .financing-modal-backdrop{position:fixed;inset:0;z-index:40;display:grid;place-items:center;padding:18px;background:rgba(35,70,62,.25);backdrop-filter:blur(4px)}.financing-modal{width:min(700px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:26px;background:var(--paper);box-shadow:0 24px 80px rgba(35,70,62,.2)}.financing-modal-head{display:flex;justify-content:space-between;gap:18px;margin-bottom:20px}.financing-modal-head h2{font:400 30px var(--app-font-serif);letter-spacing:-.04em;margin:7px 0}.financing-modal-head p{font-size:11px;color:var(--ink-soft);line-height:1.5;max-width:540px;margin:0}.financing-form{display:grid;gap:16px}.financing-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.financing-field-wide{grid-column:1/-1}.financing-segmented{display:flex;gap:6px}.financing-segmented button{border:1px solid var(--line);background:transparent;border-radius:7px;color:var(--ink-soft);padding:8px 11px;display:inline-flex;gap:7px;align-items:center;font-size:11px}.financing-segmented button.active{background:var(--ink);border-color:var(--ink);color:#f9f6ed}.financing-boundary-note{display:flex;gap:9px;align-items:flex-start;padding:11px 12px;border:1px solid #e5d8b7;background:#faf4e3;color:#82692e;font-size:10px;line-height:1.45}.financing-boundary-note svg{flex:0 0 auto;margin-top:1px}.financing-boundary-note strong{font-weight:700}.financing-form-actions{display:flex;justify-content:flex-end;gap:8px;padding-top:3px}.financing-page .btn:disabled{opacity:.55;cursor:not-allowed;transform:none}
        @media (max-width:1050px){.financing-metric-grid{grid-template-columns:repeat(2,1fr)}.financing-readiness-grid,.financing-main-grid{grid-template-columns:1fr}.financing-policy{grid-template-columns:auto 1fr}.financing-policy-list{grid-column:2}.financing-scenario-row{overflow-x:auto;min-width:650px}.financing-scenario-table{overflow-x:auto}.financing-offer-list{overflow-x:auto}.financing-offer-row{min-width:720px}.financing-document-row{grid-template-columns:30px 1fr}.financing-document-actions{grid-column:2;align-items:flex-start;flex-direction:row;align-items:center}}
        @media (max-width:700px){.financing-page{padding:26px 18px 50px}.financing-page .page-heading{display:block}.financing-header-note{text-align:left;margin-top:15px}.financing-metric-grid,.financing-cash-grid,.financing-liability-columns{grid-template-columns:1fr}.financing-policy{grid-template-columns:auto 1fr;padding:18px}.financing-policy-list{grid-column:1/-1;border-left:0;border-top:1px solid rgba(35,70,62,.16);padding:15px 0 0}.financing-readiness-body{grid-template-columns:1fr}.financing-score-ring{margin:0 auto}.credit-profile-main{grid-template-columns:1fr}.credit-score-block{border-right:0;border-bottom:1px solid var(--line);padding:0 0 15px}.financing-liability-group.business{border-left:0;border-top:2px solid #e2bd67;padding:18px 0 0}.financing-pipeline-form{grid-template-columns:1fr}.financing-form-grid{grid-template-columns:1fr}.financing-field-wide{grid-column:auto}.financing-modal{padding:20px}.financing-status-buttons{flex-wrap:wrap}}
      `}</style>
      <div className="page-heading animate-in">
        <div>
          <div className="financing-kicker"><span className="eyebrow">Financing / advisory review</span><span className="status positive"><ShieldCheck size={11} /> Human review</span></div>
          <h1 data-testid="text-page-title">Borrowing, without blur.</h1>
          <p>A careful financing workspace for a first duplex. Household cash, business obligations, protected reserves, and lender boundaries remain visible as separate things.</p>
        </div>
        <div className="heading-actions">
          <div className="financing-header-note">No lender action is taken here.<br />Assumptions stay attached to the decision.</div>
          <button className="btn" type="button" onClick={refresh} disabled={query.isFetching} data-testid="button-refresh-financing"><RefreshCw size={14} /> {query.isFetching ? "Refreshing…" : "Refresh snapshot"}</button>
        </div>
      </div>
      {query.isLoading && <><div className="financing-loading-grid" data-testid="status-financing-loading"><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /><SkeletonBlock /></div><SkeletonBlock wide /></>}
      {query.isError && <section className="card card-pad financing-inline-error" role="alert" data-testid="status-financing-error"><AlertTriangle size={17} /> Financing data is temporarily unavailable. No planning action was taken.<button className="btn" type="button" onClick={refresh} data-testid="button-retry-financing">Try again</button></section>}
      {snapshot && <>
        <div className="financing-metric-grid animate-in delay-1">
          <Metric label="Readiness" value={readinessStatus} detail="Advisory gate, not preapproval" tone="tone-green" testId="financing-readiness" icon={<ShieldCheck size={16} />} />
          <Metric label="Safe to borrow" value={money(safeToBorrow, "Not calculated")} detail="After protected reserve rules" tone="tone-amber" testId="financing-safe-to-borrow" icon={<Scale size={16} />} />
          <Metric label="Cash to close" value={money(firstValue(cash, ["estimatedCashToClose", "cashToClose", "required"]), "Not calculated")} detail={cashGap > 0 ? `${money(cashGap)} funding gap visible` : "Funding gap not visible"} tone={cashGap > 0 ? "tone-clay" : ""} testId="financing-cash-to-close" icon={<CircleDollarSign size={16} />} />
          <Metric label="Household DTI" value={percent(dti)} detail="Separate from DSCR and utilization" testId="financing-dti" icon={<TrendingDown size={16} />} />
        </div>
        <PolicyCard snapshot={snapshot} />
        <div className="financing-readiness-grid">
          <ReadinessPanel snapshot={snapshot} />
          <CreditPanel snapshot={snapshot} onEdit={() => setDialog("credit")} />
        </div>
        <div className="financing-main-grid">
          <section className="financing-liabilities"><LiabilitySection snapshot={snapshot} onAdd={() => setDialog("liability")} /></section>
          <RatioPanel snapshot={snapshot} />
          <ScenarioSection snapshot={snapshot} onAdd={() => setDialog("scenario")} />
          <OfferSection snapshot={snapshot} onAdd={() => setDialog("offer")} />
          <DocumentsSection snapshot={snapshot} onFeedback={onFeedback} />
          <PipelineSection snapshot={snapshot} onFeedback={onFeedback} />
        </div>
      </>}
      {modal}
      {dialog === "credit" && snapshot && <CreditProfileForm snapshot={snapshot} onClose={() => setDialog(null)} onSaved={pageFeedback} />}
      {dialog === "scenario" && <ScenarioForm onClose={() => setDialog(null)} onSaved={pageFeedback} />}
      {dialog === "offer" && <OfferForm onClose={() => setDialog(null)} onSaved={pageFeedback} />}
    </main>
  );
}