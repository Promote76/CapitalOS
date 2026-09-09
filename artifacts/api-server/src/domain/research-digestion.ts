import { createHash } from "node:crypto";

export const MAX_DIGESTION_BYTES = 100 * 1024;

export type DigestionIssue = { path: string; code: string; message: string };
export type NormalizedResearchDigestion = {
  schemaVersion?: string;
  ticker: string;
  company: string;
  sources: Array<{ id: string; title: string; url?: string; publisher?: string; sourceType?: string; asOf?: string }>;
  sourceClaims: Array<{ sourceId: string; statement: string }>;
  inferences?: Array<{ statement: string; basisSourceIds: string[]; confidence: number; author?: string; model?: string }>;
  fingerprint: string;
};

type Result = { success: true; data: NormalizedResearchDigestion; issues: [] } | { success: false; issues: DigestionIssue[] };
const key = (o: Record<string, unknown>, names: string[]) => names.map((n) => o[n]).find((v) => v !== undefined);
function aliasesValue(o: Record<string, unknown>, names: string[], path: string, issues: DigestionIssue[]) {
  const populated = names.filter((name) => o[name] !== undefined);
  if (populated.length > 1) {
    const normalized = populated.map((name) => JSON.stringify(aliasComparable(o[name])));
    if (new Set(normalized).size > 1) issue(issues, path, "conflict", `Aliases ${populated.join(", ")} conflict.`);
  }
  return populated.length ? o[populated[0]] : undefined;
}
function aliasComparable(value: unknown): unknown {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(aliasComparable);
  if (value && typeof value === "object") {
    const keyMap: Record<string, string> = {
      source_id: "id", sourceId: "id", source_url: "url", sourceUrl: "url", link: "url",
      source_type: "sourceType", sourceType: "sourceType", as_of: "asOf", asOf: "asOf", date: "asOf",
      name: "title", claim: "statement", excerpt: "statement", text: "statement",
      basis_source_ids: "basisSourceIds", basisSourceIds: "basisSourceIds", sourceIds: "basisSourceIds",
      companyName: "company", schema_version: "schemaVersion",
    };
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => [keyMap[k] ?? k, aliasComparable(v)] as [string, unknown])
      .sort(([a], [b]) => a.localeCompare(b)));
  }
  return value;
}
function rejectUnknown(o: Record<string, unknown>, allowed: string[], path: string, issues: DigestionIssue[]) {
  for (const name of Object.keys(o)) if (!allowed.includes(name)) issue(issues, `${path}.${name}`, "unknown_key", "Unknown keys are not accepted.");
}
const text = (v: unknown, max: number) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) ? v.trim() || null : null;
const aliases = {
  sources: ["sources", "sourceList", "references", "citations", "source_metadata"],
  claims: ["sourceClaims", "source_claims", "claims", "evidence"],
  inferences: ["inferences", "inference", "analysis", "derivedInsights"],
};

function depthAndSize(value: unknown, depth = 0, nodes = { n: 0 }): boolean {
  if (++nodes.n > 5000 || depth > 12) return false;
  if (Array.isArray(value)) return value.length <= 150 && value.every((v) => depthAndSize(v, depth + 1, nodes));
  if (value && typeof value === "object") return Object.entries(value).length <= 100 && Object.values(value).every((v) => depthAndSize(v, depth + 1, nodes));
  return true;
}
function issue(issues: DigestionIssue[], path: string, code: string, message: string) { issues.push({ path, code, message }); }
function claimedUrl(v: unknown, path: string, issues: DigestionIssue[]) {
  if (v === undefined) return undefined;
  const value = text(v, 2000);
  if (!value) { issue(issues, path, "unsafe_url", "Claimed URL must be a bounded HTTPS URL."); return undefined; }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hostname.includes("..")) throw new Error();
    return parsed.toString();
  } catch { issue(issues, path, "unsafe_url", "Claimed URL must use HTTPS and contain no credentials."); return undefined; }
}

export function parseResearchDigestion(payload: string): Result {
  const issues: DigestionIssue[] = [];
  if (typeof payload !== "string") return { success: false, issues: [{ path: "$", code: "type", message: "Digestion payload must be JSON text." }] };
  if (Buffer.byteLength(payload, "utf8") > MAX_DIGESTION_BYTES) return { success: false, issues: [{ path: "$", code: "oversized", message: "Digestion payload exceeds 100 KiB." }] };
  let root: unknown;
  try { root = JSON.parse(payload); } catch { return { success: false, issues: [{ path: "$", code: "invalid_json", message: "Digestion payload is not valid JSON." }] }; }
  if (!depthAndSize(root) || !root || typeof root !== "object" || Array.isArray(root)) return { success: false, issues: [{ path: "$", code: "unsafe_container", message: "Payload must be a bounded object with safe nesting." }] };
  const r = root as Record<string, unknown>;
  rejectUnknown(r, ["schemaVersion", "schema_version", "version", "ticker", "symbol", "company", "companyName", "security", ...aliases.sources, ...aliases.claims, ...aliases.inferences], "$", issues);
  if (r.security && typeof r.security === "object" && !Array.isArray(r.security)) rejectUnknown(r.security as Record<string, unknown>, ["ticker", "symbol", "company", "companyName"], "$.security", issues);
  if (r.company && typeof r.company === "object" && !Array.isArray(r.company)) rejectUnknown(r.company as Record<string, unknown>, ["ticker", "symbol", "name", "companyName"], "$.company", issues);
  const tickerValues = [
    aliasesValue(r, ["ticker", "symbol"], "$.ticker", issues),
    ...(r.security && typeof r.security === "object" ? [aliasesValue(r.security as Record<string, unknown>, ["ticker", "symbol"], "$.security.ticker", issues)] : []),
    ...(r.company && typeof r.company === "object" ? [aliasesValue(r.company as Record<string, unknown>, ["ticker", "symbol"], "$.company.ticker", issues)] : []),
  ].filter((v) => v !== undefined);
  const tickers = tickerValues.map((v) => typeof v === "string" ? v.trim().toUpperCase() : "").filter(Boolean);
  if (!tickers.length || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(tickers[0])) issue(issues, "$.ticker", "missing_or_invalid", "A single valid ticker is required.");
  if (new Set(tickers).size > 1) issue(issues, "$.ticker", "conflict", "Ticker aliases conflict.");
  const companyValues = [
    aliasesValue(r, ["company", "companyName"], "$.company", issues),
    ...(r.security && typeof r.security === "object" ? [aliasesValue(r.security as Record<string, unknown>, ["company", "companyName"], "$.security.company", issues)] : []),
    ...(r.company && typeof r.company === "object" ? [aliasesValue(r.company as Record<string, unknown>, ["name", "companyName"], "$.company.name", issues)] : []),
  ].filter((v) => typeof v === "string").map((v) => (v as string).trim()).filter(Boolean);
  if (!companyValues.length || !text(companyValues[0], 240)) issue(issues, "$.company", "missing_or_invalid", "A bounded company name is required.");
  if (new Set(companyValues).size > 1) issue(issues, "$.company", "conflict", "Company aliases conflict.");
  const sourceRaw = aliasesValue(r, aliases.sources, "$.sources", issues);
  const claimRaw = aliasesValue(r, aliases.claims, "$.sourceClaims", issues);
  if (!Array.isArray(sourceRaw) || !sourceRaw.length || sourceRaw.length > 25) issue(issues, "$.sources", "required_bounded_array", "At least one and at most 25 sources are required.");
  if (!Array.isArray(claimRaw) || !claimRaw.length || claimRaw.length > 100) issue(issues, "$.sourceClaims", "required_bounded_array", "At least one and at most 100 source claims are required.");
  const sources: NormalizedResearchDigestion["sources"] = [];
  const ids = new Set<string>();
  if (Array.isArray(sourceRaw)) sourceRaw.forEach((raw, i) => {
    const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    rejectUnknown(o, ["id", "sourceId", "source_id", "title", "name", "url", "sourceUrl", "source_url", "link", "publisher", "sourcePublisher", "publisherName", "sourceType", "source_type", "type", "asOf", "as_of", "date"], `$.sources[${i}]`, issues);
    const id = text(aliasesValue(o, ["id", "sourceId", "source_id"], `$.sources[${i}].id`, issues), 120);
    const title = text(aliasesValue(o, ["title", "name"], `$.sources[${i}].title`, issues), 240);
    if (!id || !title) { issue(issues, `$.sources[${i}]`, "invalid_source", "Source id and title are required."); return; }
    if (ids.has(id)) issue(issues, `$.sources[${i}].id`, "duplicate_id", "Source IDs must be unique.");
    ids.add(id);
    const url = claimedUrl(aliasesValue(o, ["url", "sourceUrl", "source_url", "link"], `$.sources[${i}].url`, issues), `$.sources[${i}].url`, issues);
    const publisher = text(aliasesValue(o, ["publisher", "sourcePublisher", "publisherName"], `$.sources[${i}].publisher`, issues), 180);
    const sourceType = text(aliasesValue(o, ["sourceType", "source_type", "type"], `$.sources[${i}].sourceType`, issues), 100);
    const asOf = text(aliasesValue(o, ["asOf", "as_of", "date"], `$.sources[${i}].asOf`, issues), 80);
    sources.push({ id, title, ...(url ? { url } : {}), ...(publisher ? { publisher } : {}), ...(sourceType ? { sourceType } : {}), ...(asOf ? { asOf } : {}) });
  });
  const claims: NormalizedResearchDigestion["sourceClaims"] = [];
  if (Array.isArray(claimRaw)) claimRaw.forEach((raw, i) => {
    const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    rejectUnknown(o, ["sourceId", "source_id", "source", "statement", "text", "claim", "excerpt"], `$.sourceClaims[${i}]`, issues);
    const sourceId = text(aliasesValue(o, ["sourceId", "source_id", "source"], `$.sourceClaims[${i}].sourceId`, issues), 120);
    const statement = text(aliasesValue(o, ["statement", "text", "claim", "excerpt"], `$.sourceClaims[${i}].statement`, issues), 3000);
    if (!sourceId || !statement) issue(issues, `$.sourceClaims[${i}]`, "invalid_claim", "Source claim requires sourceId and statement.");
    else { if (!ids.has(sourceId)) issue(issues, `$.sourceClaims[${i}].sourceId`, "bad_reference", "Claim references an unknown source."); claims.push({ sourceId, statement }); }
  });
  let inferences: NonNullable<NormalizedResearchDigestion["inferences"]> = [];
  const inferenceRaw = aliasesValue(r, aliases.inferences, "$.inferences", issues);
  if (inferenceRaw !== undefined) {
    if (!Array.isArray(inferenceRaw) || inferenceRaw.length > 100) issue(issues, "$.inferences", "bounded_array", "Inferences must contain at most 100 items.");
    inferences = Array.isArray(inferenceRaw) ? inferenceRaw.map((raw, i) => {
      const o = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      rejectUnknown(o, ["statement", "text", "inference", "basisSourceIds", "basis_source_ids", "sourceIds", "confidence", "author", "by", "analyst", "model", "modelName", "model_name"], `$.inferences[${i}]`, issues);
      const statement = text(aliasesValue(o, ["statement", "text", "inference"], `$.inferences[${i}].statement`, issues), 3000);
      const bases = aliasesValue(o, ["basisSourceIds", "basis_source_ids", "sourceIds"], `$.inferences[${i}].basisSourceIds`, issues);
      const confidence = typeof o.confidence === "number" && Number.isFinite(o.confidence) && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : NaN;
      const basisSourceIds = Array.isArray(bases) ? bases.map((v) => text(v, 120)).filter((v): v is string => Boolean(v)) : [];
      if (!statement || !Array.isArray(bases) || Number.isNaN(confidence)) issue(issues, `$.inferences[${i}]`, "invalid_inference", "Inference requires statement, basis source IDs, and confidence 0..1.");
      basisSourceIds.forEach((id) => { if (!ids.has(id)) issue(issues, `$.inferences[${i}].basisSourceIds`, "bad_reference", "Inference references an unknown source."); });
      const author = text(aliasesValue(o, ["author", "by", "analyst"], `$.inferences[${i}].author`, issues), 180);
      const model = text(aliasesValue(o, ["model", "modelName", "model_name"], `$.inferences[${i}].model`, issues), 180);
      return { statement: statement ?? "", basisSourceIds, confidence: Number.isNaN(confidence) ? 0 : confidence, ...(author ? { author } : {}), ...(model ? { model } : {}) };
    }) : [];
  }
  if (issues.length) return { success: false, issues };
  const schemaVersion = text(aliasesValue(r, ["schemaVersion", "schema_version", "version"], "$.schemaVersion", issues), 40);
  if (issues.length) return { success: false, issues };
  const normalized = { ...(schemaVersion ? { schemaVersion } : {}), ticker: tickers[0], company: companyValues[0], sources, sourceClaims: claims, ...(inferenceRaw !== undefined ? { inferences } : {}) };
  return { success: true, data: { ...normalized, fingerprint: createHash("sha256").update(JSON.stringify(normalized)).digest("hex") }, issues: [] };
}