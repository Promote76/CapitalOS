import { and, desc, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { auditEvents, db, reviewedSecFilingEvidence, secFilingSnapshots } from "@workspace/db";
import type { Actor } from "./capital-os";

const SEC_HOSTS = new Set(["www.sec.gov", "data.sec.gov", "sec.gov"]);
const MAX_BYTES = 8 * 1024 * 1024;
const USER_AGENT = process.env.SEC_USER_AGENT || "Capital OS research/1.0 (research@capital-os.local)";
/** Allowlisted exact us-gaap tags. A field stays null when the issuer does not
 * report one of these tags; no ratios or classifications are calculated here. */
export const SEC_BANK_METRIC_TAGS: Record<string, string[]> = {
  totalAssets: ["Assets"], totalLiabilities: ["Liabilities"], cashAndDueFromBanks: ["CashAndDueFromBanks"],
  loansHeldForInvestment: ["LoansAndLeasesReceivableHeldForInvestment"], commercialLoans: ["CommercialAndIndustrialLoans"], residentialRealEstateLoans: ["ResidentialRealEstateLoans"], commercialRealEstateLoans: ["CommercialRealEstateLoans"], consumerLoans: ["ConsumerLoans"], agriculturalLoans: ["AgriculturalLoans"],
  allowanceForCreditLosses: ["AllowanceForCreditLossesLoansAndLeases"], nonperformingLoans: ["NonperformingLoans"], nonperformingAssets: ["NonperformingAssets"], pastDueLoans: ["LoansAndLeasesReceivablePastDue"], chargeOffs: ["ChargeOffs"], recoveries: ["Recoveries"],
  deposits: ["Deposits"], domesticDeposits: ["DepositsInDomesticOffices"], foreignDeposits: ["DepositsInForeignOffices"], uninsuredDeposits: ["UninsuredDeposits"], interestBearingDeposits: ["InterestBearingDeposits"], noninterestBearingDeposits: ["NoninterestBearingDeposits"], fundingCosts: ["InterestExpenseDeposits"], netInterestMargin: ["NetInterestMargin"],
  rateSensitivity: ["InterestRateSensitivity"], interestIncome: ["InterestIncomeExpenseNonoperatingNet"], netIncome: ["NetIncomeLoss"], revenue: ["Revenues"], stockholdersEquity: ["StockholdersEquity"], bookValue: ["StockholdersEquity"], tangibleBookValue: ["TangibleBookValue"],
  commonEquityTier1Ratio: ["CommonEquityTier1CapitalRatio"], tier1CapitalRatio: ["Tier1CapitalRatio"], totalRiskBasedCapitalRatio: ["TotalRiskBasedCapitalRatio"], leverageRatio: ["Tier1LeverageRatio"],
  earningsPerShare: ["EarningsPerShareBasic"], dividends: ["CommonStockDividendsPerShareDeclared"], dividendPayout: ["CommonStockDividendsPerShareCashPaid"],
  // These labels imply comparisons or calculations that this normalizer does
  // not perform. Keep them explicitly missing rather than relabeling a raw
  // point-in-time or single-period fact as a derived conclusion.
  depositRetention: [], earningsTrend: [],
};
export const SEC_BANK_METRIC_NAMES = Object.keys(SEC_BANK_METRIC_TAGS);
export const secFilingAgeStatuses = ["CURRENT", "AGING", "STALE", "UNKNOWN"] as const;
export type SecFilingAgeStatus = (typeof secFilingAgeStatuses)[number];

const SEC_FILING_AGING_AFTER_DAYS = 180;
const SEC_FILING_STALE_AFTER_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getSecFilingAgeStatus(
  filingDate: string | null | undefined,
  asOf: string | Date,
): SecFilingAgeStatus {
  if (!filingDate) return "UNKNOWN";
  const filedAt = new Date(`${filingDate}T00:00:00.000Z`);
  const observedAt = asOf instanceof Date ? asOf : new Date(asOf);
  if (Number.isNaN(filedAt.getTime()) || Number.isNaN(observedAt.getTime())) return "UNKNOWN";
  const ageDays = Math.floor(Math.max(0, observedAt.getTime() - filedAt.getTime()) / DAY_MS);
  if (ageDays <= SEC_FILING_AGING_AFTER_DAYS) return "CURRENT";
  if (ageDays <= SEC_FILING_STALE_AFTER_DAYS) return "AGING";
  return "STALE";
}

type SecFact = {
  tag: string;
  unit: string | null;
  value: number;
  start: string | null;
  end: string | null;
  accession: string;
  form: string;
  filed: string | null;
  fiscalYear: number | null;
  fiscalPeriod: string | null;
  frame: string | null;
  sourceUrl?: string | null;
};

function ticker(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(normalized)) throw new Error("Invalid SEC ticker");
  return normalized;
}
async function secPayload(url: string, accept: string, maxBytes = MAX_BYTES): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !SEC_HOSTS.has(parsed.hostname)) throw new Error("SEC source host is not approved");
  const response = await fetch(parsed, { redirect: "manual", signal: AbortSignal.timeout(15_000), headers: { "User-Agent": USER_AGENT, Accept: accept } });
  if (response.status >= 300 && response.status < 400) throw new Error("SEC redirect rejected");
  if (!response.ok) throw new Error(`SEC source unavailable (${response.status})`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > maxBytes) throw new Error("SEC response exceeds bounded limit");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) throw new Error("SEC response exceeds bounded limit");
  return bytes;
}
async function secJson(url: string, maxBytes = MAX_BYTES): Promise<any> {
  return JSON.parse((await secPayload(url, "application/json", maxBytes)).toString("utf8"));
}
async function secText(url: string, maxBytes = MAX_BYTES): Promise<string> {
  return (await secPayload(url, "text/plain", maxBytes)).toString("utf8");
}
export function resolveSecIssuer(symbol: string, tickerMap: any, legacyTickerIndex?: string) {
  const normalized = ticker(symbol);
  const primary = Object.values(tickerMap ?? {}).find((row: any) => String(row.ticker).toUpperCase() === normalized) as any;
  if (primary?.cik_str) return { ticker: normalized, cik: String(primary.cik_str).padStart(10, "0"), source: "company_tickers.json" as const };
  const legacy = legacyTickerIndex?.split(/\r?\n/).map((line) => line.split("\t")).find(([listed]) => listed?.toUpperCase() === normalized);
  if (legacy?.[1] && /^\d+$/.test(legacy[1])) return { ticker: normalized, cik: legacy[1].padStart(10, "0"), source: "ticker.txt" as const };
  throw new Error("Ticker is not present in the SEC issuer index");
}
function firstFact(facts: any, tags: string[], form: string, accession: string): SecFact | null {
  for (const tag of tags) {
    const units = facts?.facts?.["us-gaap"]?.[tag]?.units;
    if (!units) continue;
    const normalizedAccession = accession.replaceAll("-", "");
    const entries = Object.entries(units).flatMap(([unit, rows]) =>
      (Array.isArray(rows) ? rows : []).map((entry: any) => ({ ...entry, unit })),
    ).filter((entry: any) => entry.form === form && String(entry.accn ?? "").replaceAll("-", "") === normalizedAccession) as any[];
    const item = entries.at(-1);
    if (item && typeof item.val === "number") return { tag, unit: item.unit ?? null, value: item.val, start: item.start ?? null, end: item.end ?? null, accession: item.accn ?? accession, form: item.form ?? form, filed: item.filed ?? null, fiscalYear: item.fy ?? null, fiscalPeriod: item.fp ?? null, frame: item.frame ?? null };
  }
  return null;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as object).sort().map((key) => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function normalizeSecFilingPayloads(input: {
  symbol: string;
  tickerMap: any;
  submissions: any;
  facts: any;
  accessedAt: string;
}) {
  const symbol = ticker(input.symbol);
  const { cik } = resolveSecIssuer(symbol, input.tickerMap);
  const submissions = input.submissions;
  const recent = submissions.filings?.recent;
  if (!recent) throw new Error("SEC submissions index is unavailable");
  const candidates = (recent.form as string[]).map((form, i) => ({ form, i, filed: recent.filingDate[i], accession: recent.accessionNumber[i], primaryDocument: recent.primaryDocument[i] }))
    .filter((item) => item.form === "10-Q" || item.form === "10-K")
    .sort((a, b) => String(b.filed).localeCompare(String(a.filed)));
  const latestQ = candidates.find((item) => item.form === "10-Q");
  if (!latestQ) throw new Error("No 10-Q filing found for selected issuer");
  const facts = input.facts;
  const selected = [latestQ];
  let metrics: Record<string, SecFact | null> = Object.fromEntries(SEC_BANK_METRIC_NAMES.map((name) => [name, firstFact(facts, SEC_BANK_METRIC_TAGS[name]!, "10-Q", latestQ.accession)]));
  const latestK = candidates.find((item) => item.form === "10-K");
  if (latestK && Object.values(metrics).some((value) => value === null)) {
    selected.push(latestK);
    metrics = Object.fromEntries(SEC_BANK_METRIC_NAMES.map((name) => [name, metrics[name] ?? firstFact(facts, SEC_BANK_METRIC_TAGS[name]!, "10-K", latestK.accession)]));
  }
  const missingFields = SEC_BANK_METRIC_NAMES.filter((name) => metrics[name] === null);
  const filings = selected.map((item) => ({
    form: item.form, filingDate: item.filed, accession: item.accession,
    sourceUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${item.accession.replaceAll("-", "")}/${item.primaryDocument}`,
  }));
  metrics = Object.fromEntries(Object.entries(metrics).map(([name, fact]) => [
    name,
    fact ? {
      ...fact,
      sourceUrl: filings.find((filing) => filing.accession.replaceAll("-", "") === String(fact.accession).replaceAll("-", ""))?.sourceUrl ?? null,
    } : null,
  ]));
  const content = {
    ticker: symbol,
    metrics,
    filings,
    filingPriority: "LATEST_10Q_THEN_10K_ONLY_FOR_MISSING_FIELDS",
    filingAgeStatus: getSecFilingAgeStatus(latestQ.filed, input.accessedAt),
  };
  const provenance = {
    provider: "SEC EDGAR", issuerCik: cik, sourceUrls: filings.map((item) => item.sourceUrl),
    citations: SEC_BANK_METRIC_NAMES.map((name) => ({ field: name, sourceUrl: metrics[name] ? filings.find((f) => f.accession.replaceAll("-", "") === String((metrics[name] as any).accession).replaceAll("-", ""))?.sourceUrl ?? null : null })),
    accessedAt: input.accessedAt,
  };
  const evidenceQuality = missingFields.length === 0 ? "HIGH" : missingFields.length <= 3 ? "MEDIUM" : "LOW";
  return { symbol, cik, latestQ, content, filingAgeStatus: content.filingAgeStatus, provenance, missingFields, evidenceQuality };
}

function withSecFilingAgeStatus(row: typeof secFilingSnapshots.$inferSelect) {
  const content = row.content;
  const recordedStatus = content.filingAgeStatus;
  const filingAgeStatus = secFilingAgeStatuses.includes(recordedStatus as SecFilingAgeStatus)
    ? recordedStatus as SecFilingAgeStatus
    : getSecFilingAgeStatus(
      row.filingDate,
      typeof row.provenance.accessedAt === "string" ? row.provenance.accessedAt : row.extractionTimestamp,
    );
  return { ...row, filingAgeStatus, content: { ...content, filingAgeStatus } };
}

export async function retrieveSecFiling(actor: Actor, input: { ticker: string }) {
  const symbol = ticker(input.ticker);
  const tickerMap = await secJson("https://www.sec.gov/files/company_tickers.json", 5 * 1024 * 1024);
  let issuer;
  try {
    issuer = resolveSecIssuer(symbol, tickerMap);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Ticker is not present in the SEC issuer index") throw error;
    issuer = resolveSecIssuer(symbol, tickerMap, await secText("https://www.sec.gov/include/ticker.txt", 512 * 1024));
  }
  const cik = issuer.cik;
  const normalizedTickerMap = Object.values(tickerMap).some((row: any) => String(row.ticker).toUpperCase() === symbol)
    ? tickerMap
    : { ...tickerMap, [`legacy-${symbol}`]: { ticker: symbol, cik_str: Number(cik), source: issuer.source } };
  const [submissions, facts] = await Promise.all([
    secJson(`https://data.sec.gov/submissions/CIK${cik}.json`, 4 * 1024 * 1024),
    secJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, MAX_BYTES),
  ]);
  const extractionTimestamp = new Date();
  const normalized = normalizeSecFilingPayloads({
    symbol, tickerMap: normalizedTickerMap, submissions, facts, accessedAt: extractionTimestamp.toISOString(),
  });
  const [row] = await db.insert(secFilingSnapshots).values({
    householdId: actor.householdId, ticker: symbol, filingForm: normalized.content.filings.map((item) => item.form).join("+"),
    filingDate: normalized.latestQ.filed, accession: normalized.latestQ.accession,
    sourceUrl: normalized.content.filings[0]!.sourceUrl, content: normalized.content, provenance: normalized.provenance,
    missingFields: normalized.missingFields, evidenceQuality: normalized.evidenceQuality, extractionTimestamp, createdBy: actor.userId,
  }).onConflictDoNothing().returning();
  if (!row) throw new Error("SEC filing accession already collected for this household");
  await db.insert(auditEvents).values({ householdId: actor.householdId, actor: actor.userId, eventType: "sec_filing_draft_created", entity: "sec_filing_snapshot", entityId: row.id, reason: "Normalized official SEC filing evidence pending human review", metadata: { ticker: symbol, accession: row.accession, missingFields: normalized.missingFields, evidenceQuality: normalized.evidenceQuality } });
  return { ...row, filingAgeStatus: normalized.filingAgeStatus, advisoryOnly: true, readOnly: true, tradingEnabled: false, executionAuthority: "none" };
}

export async function listSecFilings(actor: Actor) {
  const drafts = await db.select().from(secFilingSnapshots).where(eq(secFilingSnapshots.householdId, actor.householdId)).orderBy(desc(secFilingSnapshots.createdAt));
  const approved = await db.select().from(reviewedSecFilingEvidence).where(eq(reviewedSecFilingEvidence.householdId, actor.householdId)).orderBy(desc(reviewedSecFilingEvidence.approvedAt));
  return { drafts: drafts.map(withSecFilingAgeStatus), approved };
}

export async function reviewSecFiling(actor: Actor, id: string, disposition: "APPROVE" | "REJECT") {
  return db.transaction(async (tx) => {
    const [draft] = await tx.select().from(secFilingSnapshots).where(and(eq(secFilingSnapshots.id, id), eq(secFilingSnapshots.householdId, actor.householdId))).limit(1);
    if (!draft || draft.reviewStatus !== "PENDING_HUMAN_REVIEW") throw new Error("SEC filing draft not found or already reviewed");
    const draftWithStatus = withSecFilingAgeStatus(draft);
    const [updated] = await tx.update(secFilingSnapshots).set({ reviewStatus: disposition === "APPROVE" ? "APPROVED" : "REJECTED", reviewedBy: actor.userId, reviewedAt: new Date() }).where(and(eq(secFilingSnapshots.id, id), eq(secFilingSnapshots.reviewStatus, "PENDING_HUMAN_REVIEW"))).returning();
    if (!updated) throw new Error("SEC filing review was concurrent");
    let evidence: any = null;
    if (disposition === "APPROVE") {
      const canonicalContent = { ...draftWithStatus.content, provenance: draft.provenance, missingFields: draft.missingFields, evidenceQuality: draft.evidenceQuality, readOnly: true, tradingEnabled: false, executionAuthority: "none" };
      const canonicalSha256 = createHash("sha256").update(canonical(canonicalContent)).digest("hex");
      [evidence] = await tx.insert(reviewedSecFilingEvidence).values({ householdId: actor.householdId, snapshotId: draft.id, ticker: draft.ticker, canonicalContent, canonicalSha256, provenance: draft.provenance, approvedBy: actor.userId }).returning();
    }
    await tx.insert(auditEvents).values({ householdId: actor.householdId, actor: actor.userId, eventType: "sec_filing_reviewed", entity: "sec_filing_snapshot", entityId: draft.id, reason: `Human disposition: ${disposition}`, metadata: { digest: evidence?.canonicalSha256 ?? null } });
    return { snapshot: { ...updated, filingAgeStatus: draftWithStatus.filingAgeStatus, content: draftWithStatus.content }, evidence };
  });
}