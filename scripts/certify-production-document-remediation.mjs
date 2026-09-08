import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const defaultEvidencePath = resolve(root, "docs/certification/logs/PRODUCTION_DOCUMENT_REMEDIATION_LATEST.json");
const origin = (process.env.CAPITAL_OS_PUBLISHED_ORIGIN ?? "").replace(/\/$/, "");
const sessionCookie = process.env.CAPITAL_OS_PRODUCTION_OPERATOR_SESSION_COOKIE ?? "";
const householdId = process.env.CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID ?? "d6672e8d-c193-4182-bd76-4170329e529a";
const documentIds = (process.env.CAPITAL_OS_PRODUCTION_DOCUMENT_IDS ??
  "c9e3f924-6977-4430-a66b-0089d66b3427,da39387c-7a42-4e9e-966b-54974bf27b76")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const businessId = process.env.CAPITAL_OS_PRODUCTION_BUSINESS_ID ?? "";
const asOf = process.env.CAPITAL_OS_PRODUCTION_AS_OF ?? new Date().toISOString().slice(0, 10);
const evidencePath = resolve(root, process.env.CAPITAL_OS_PRODUCTION_REMEDIATION_EVIDENCE_PATH ?? defaultEvidencePath);
const dryRun = process.env.CAPITAL_OS_PRODUCTION_REMEDIATION_DRY_RUN === "1";

const checks = [];
const evidence = {
  runner: "certify-production-document-remediation",
  version: "2026-09-08.published-origin.v1",
  observedAt: new Date().toISOString(),
  origin: origin || "[missing]",
  household: redactId(householdId),
  dryRun,
  documents: [],
  downstream: {},
  checks,
};

function redactId(value) {
  if (!value) return null;
  return `${String(value).slice(0, 6)}…${String(value).slice(-4)}`;
}

function redactText(value) {
  return String(value)
    .replace(/(cookie|authorization|session|token|jwt|password|secret|otp)[=:]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]");
}

function safeError(error) {
  return redactText(error instanceof Error ? error.message : String(error));
}

function check(id, passed, detail, extra = {}) {
  const result = { id, status: passed ? "PASS" : "FAIL", detail: redactText(detail), ...extra };
  checks.push(result);
  console.log(`${id}: ${result.status} — ${result.detail}`);
  return passed;
}

function blocked(id, detail, extra = {}) {
  const result = { id, status: "BLOCKED", detail: redactText(detail), ...extra };
  checks.push(result);
  console.log(`${id}: BLOCKED — ${result.detail}`);
  return false;
}

function requireConfiguration() {
  let valid = true;
  valid = check("PDR-00-origin", /^https:\/\//.test(origin), "A published HTTPS origin is required.") && valid;
  valid = check("PDR-00-session", Boolean(sessionCookie), "A pre-approved Clerk operator session cookie is required.") && valid;
  valid = check("PDR-00-household", /^[0-9a-f-]{36}$/i.test(householdId), "A target household UUID is required.") && valid;
  valid = check("PDR-00-documents", documentIds.length === 2 && documentIds.every((id) => /^[0-9a-f-]{36}$/i.test(id)), "Exactly two target document UUIDs are required.") && valid;
  valid = check("PDR-00-business", /^[0-9a-f-]{36}$/i.test(businessId), "The exact existing BusinessEntity UUID is required; the runner never creates one.") && valid;
  if (!valid) throw new Error("PRODUCTION_CLERK_OPERATOR_SESSION_REQUIRED");
}

function requestHeaders(extra = {}) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: origin,
    Cookie: sessionCookie,
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: requestHeaders(options.headers),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { text: redactText(text).slice(0, 300) };
  }
  if (!response.ok) {
    const code = body?.code ?? `HTTP_${response.status}`;
    const message = body?.message ?? body?.text ?? "published-origin request failed";
    throw new Error(`${code}: ${redactText(message)}`);
  }
  return { status: response.status, body };
}

function documentSummary(document) {
  return {
    id: redactId(document?.id),
    file: redactText(document?.sourceFileName ?? ""),
    type: document?.documentType ?? null,
    originalType: document?.originalDocumentType ?? null,
    detectedType: document?.detectedDocumentType ?? null,
    confidence: document?.detectionConfidence ?? null,
    mismatchStatus: document?.typeMismatchStatus ?? null,
    status: document?.status ?? null,
    hash: document?.documentHash ? `${String(document.documentHash).slice(0, 10)}…` : null,
    sourcePathPresent: Boolean(document?.sourceObjectPath),
    sourceRecordType: document?.sourceRecordType ?? null,
    sourceRecordId: redactId(document?.sourceRecordId),
    parserVersion: document?.parserVersion ?? null,
    periodStart: document?.periodStart ?? null,
    periodEnd: document?.periodEnd ?? null,
  };
}

function preserveSource(before, after) {
  return before?.documentHash === after?.documentHash &&
    before?.sourceObjectPath === after?.sourceObjectPath &&
    before?.sourceFileName === after?.sourceFileName &&
    before?.mimeType === after?.mimeType;
}

async function verifyOperator() {
  const { body } = await request("/api/auth/me");
  const memberships = Array.isArray(body?.memberships) ? body.memberships : [];
  const membership = memberships.find((item) => item.householdId === householdId && item.active !== false);
  const permissions = Array.isArray(membership?.permissions) ? membership.permissions : [];
  check("PDR-01-authenticated-clerk-session", body?.authStrength === "clerk_session", "The published origin did not return a Clerk session.");
  check("PDR-02-target-household", Boolean(membership), "The operator session is not a member of the target household.");
  check("PDR-03-approver-permission", Boolean(membership && (permissions.includes("approve") || membership.role === "owner")), "The operator session lacks the approver boundary.");
  if (!membership || body?.authStrength !== "clerk_session") {
    throw new Error("PRODUCTION_CLERK_OPERATOR_SESSION_REQUIRED");
  }
}

async function correctDocument(documentId, index) {
  const beforeResult = await request(`/api/financial-documents/${documentId}`);
  const before = beforeResult.body;
  const record = { target: redactId(documentId), before: documentSummary(before) };
  evidence.documents.push(record);
  const sourcePreflight = before?.detectedDocumentType === "BUSINESS_PROFIT_AND_LOSS" &&
    before?.detectionConfidence === "HIGH" &&
    Boolean(before?.sourceObjectPath) &&
    ((before?.documentType !== "BUSINESS_PROFIT_AND_LOSS" && before?.typeMismatchStatus !== "CORRECTED") ||
      (before?.documentType === "BUSINESS_PROFIT_AND_LOSS" && before?.typeMismatchStatus === "CORRECTED"));
  if (!check(`PDR-${String(4 + index * 5).padStart(2, "0")}-source-preflight`, sourcePreflight, `Target ${redactId(documentId)} is a high-confidence P&L mismatch or an already-corrected P&L with preserved private source evidence.`)) {
    throw new Error(`PDR_SOURCE_PREFLIGHT_FAILED:${redactId(documentId)}`);
  }

  const idempotencyKey = `pdr-2026-09-08-use-detected-type-${documentId}`;
  let correction;
  if (before?.typeMismatchStatus === "CORRECTED" && before?.documentType === "BUSINESS_PROFIT_AND_LOSS") {
    correction = { status: 200, body: before, alreadyApplied: true };
    record.correction = { mode: "already_applied", idempotencyKey: redactId(idempotencyKey) };
  } else if (dryRun) {
    correction = { status: 0, body: before, dryRun: true };
    record.correction = { mode: "dry_run", idempotencyKey: redactId(idempotencyKey) };
    blocked(`PDR-${String(5 + index * 5).padStart(2, "0")}-correction`, "Dry run requested; no production mutation was attempted.");
  } else {
    const result = await request(`/api/financial-documents/${documentId}/type-decision`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({
        action: "USE_DETECTED_TYPE",
        reason: "Authorized production remediation: content evidence is a high-confidence business P&L; preserve the original source and supersede the legacy settlement parse.",
        idempotencyKey,
      }),
    });
    correction = { ...result, alreadyApplied: false };
    record.correction = {
      mode: "applied_or_idempotent",
      status: result.status,
      idempotencyKey: redactId(idempotencyKey),
      response: documentSummary(result.body),
    };
  }
  check(`PDR-${String(5 + index * 5).padStart(2, "0")}-correction`, !dryRun &&
    correction.body?.documentType === "BUSINESS_PROFIT_AND_LOSS" &&
    correction.body?.typeMismatchStatus === "CORRECTED", dryRun
    ? "Dry run requested; no production mutation was attempted."
    : correction.alreadyApplied
      ? "The stable idempotency key found the already-applied independent correction."
      : "The independent type correction returned a corrected P&L state.", {
    documentId: redactId(documentId),
  });

  const afterResult = await request(`/api/financial-documents/${documentId}`);
  const after = afterResult.body;
  record.after = documentSummary(after);
  check(`PDR-${String(6 + index * 5).padStart(2, "0")}-source-preservation`, preserveSource(before, after), "Source hash, private object path, filename, and MIME type are unchanged.");
  check(`PDR-${String(7 + index * 5).padStart(2, "0")}-parser-generation`, after?.documentType === "BUSINESS_PROFIT_AND_LOSS" &&
    after?.status === "PARSED" &&
    after?.parserVersion === "business-profit-loss-parser-v1" &&
    after?.sourceRecordType === "profit_loss_document" &&
    Boolean(after?.sourceRecordId), "The corrected document has a current P&L parser generation and source record.");
  check(`PDR-${String(8 + index * 5).padStart(2, "0")}-audit-contract`, !dryRun && after?.typeMismatchStatus === "CORRECTED" &&
    after?.sourceMetadata?.reprocessReason?.includes("Authorized production remediation") === true,
  "The correction completed through the audited server action; no direct database mutation was used.");
  return { before, after, correction };
}

function downstreamSummary(path, body) {
  if (path === "business-income") {
    return {
      businesses: Array.isArray(body?.businesses) ? body.businesses.map((business) => redactId(business.id)) : [],
      pnlDocuments: Array.isArray(body?.profitLossDocuments) ? body.profitLossDocuments.length : null,
      pnlSources: Array.isArray(body?.profitLossDocuments) ? body.profitLossDocuments.map((document) => ({
        id: redactId(document.id),
        businessId: redactId(document.businessId),
        periodStart: document.statementPeriodStart ?? null,
        periodEnd: document.statementPeriodEnd ?? null,
        verificationStatus: document.verificationStatus ?? null,
      })) : [],
      reconciliationRuns: Array.isArray(body?.reconciliationRuns) ? body.reconciliationRuns.length : null,
      reconciliationRows: Array.isArray(body?.reconciliationRuns) ? body.reconciliationRuns.map((row) => ({
        businessId: redactId(row.businessId),
        periodStart: row.statementPeriodStart ?? null,
        periodEnd: row.statementPeriodEnd ?? null,
        status: row.status ?? null,
        variance: row.variance ?? null,
      })) : [],
      ownerDraws: Array.isArray(body?.ownerDraws) ? body.ownerDraws.length : null,
      verifiedIncome: Array.isArray(body?.verifiedIncome) ? body.verifiedIncome.length : null,
      openAnomalies: body?.summary?.openAnomalyCount ?? null,
      bankSyncMode: body?.summary?.bankSyncMode ?? null,
    };
  }
  if (path === "variable-budget") return {
    profileStatus: body?.incomeProfile?.confidenceStatus ?? body?.incomeProfile?.status ?? null,
    forecastReadiness: body?.source?.forecastReadiness ?? null,
    forecastRequiredInputsComplete: Array.isArray(body?.forecast) && body.forecast.length > 0
      ? body.forecast.every((item) => item.requiredInputsComplete === true)
      : null,
  };
  if (path === "budget") return { month: body?.month ?? null, categoryCount: body?.categories?.length ?? null, notes: body?.notes?.length ?? null };
  if (path === "cash-flow") return { month: body?.month ?? null, forecastConfidence: body?.forecast?.confidence ?? null, nextMonthNet: body?.forecast?.nextMonthNet ?? null };
  if (path === "capital-governor") return {
    status: body?.status ?? null,
    safeToDeploy: body?.safeToDeploy ?? null,
    dataReadiness: body?.dataReadiness?.status ?? null,
    failClosed: body?.dataReadiness?.failClosed ?? null,
    amountCalculated: body?.calculation?.amountCalculated ?? null,
  };
  if (path === "safe-to-deploy") return { safeToDeploy: body?.safeToDeploy ?? null, confidence: body?.confidence ?? null, reason: body?.reason ?? null };
  return { available: body != null };
}

function hasExpectedShape(name, body) {
  if (name === "business-income") {
    return Array.isArray(body?.businesses) &&
      Array.isArray(body?.profitLossDocuments) &&
      Array.isArray(body?.reconciliationRuns) &&
      Array.isArray(body?.ownerDraws) &&
      Array.isArray(body?.verifiedIncome) &&
      typeof body?.summary?.bankSyncMode === "string";
  }
  if (name === "business-overview") return Array.isArray(body?.businesses) && body?.totals && typeof body.totals === "object";
  if (name === "variable-budget") return typeof body?.source?.forecastReadiness === "string" &&
    Array.isArray(body?.forecast) && body.forecast.length > 0 && body?.incomeProfile;
  if (name === "budget") return Array.isArray(body?.categories) && Array.isArray(body?.notes);
  if (name === "cash-flow") return body?.forecast && typeof body.forecast.confidence === "number";
  if (name === "safe-to-deploy") return typeof body?.safeToDeploy === "string" && typeof body?.reason === "string";
  if (name === "capital-governor") return body?.dataReadiness &&
    typeof body.dataReadiness.failClosed === "boolean" && typeof body?.safeToDeploy === "string";
  return false;
}

async function verifyDownstream(corrected, baselineBusinessIncome) {
  const endpoints = [
    ["business-income", "/api/business/income-intelligence"],
    ["business-overview", "/api/business"],
    ["variable-budget", `/api/variable-budget/intelligence?asOf=${encodeURIComponent(asOf)}`],
    ["budget", `/api/budget?month=${encodeURIComponent(asOf.slice(0, 7))}`],
    ["cash-flow", `/api/cash-flow?month=${encodeURIComponent(asOf.slice(0, 7))}`],
    ["safe-to-deploy", "/api/safe-to-deploy"],
    ["capital-governor", `/api/capital-governor/v2?asOf=${encodeURIComponent(asOf)}`],
  ];
  for (const [name, path] of endpoints) {
    try {
      const { body } = await request(path);
      const shapeOkay = hasExpectedShape(name, body);
      evidence.downstream[name] = { ...downstreamSummary(name, body), available: shapeOkay };
      check(`PDR-${name}`, shapeOkay, shapeOkay
        ? `Published-origin ${name} response was authenticated and schema-shaped.`
        : `Published-origin ${name} returned an unexpected response shape.`);
    } catch (error) {
      evidence.downstream[name] = { available: false, error: safeError(error) };
      check(`PDR-${name}`, false, safeError(error));
    }
  }

  const businessIncome = evidence.downstream["business-income"];
  const businessPresent = businessId
    ? (businessIncome?.businesses ?? []).includes(redactId(businessId))
    : (businessIncome?.businesses?.length ?? 0) > 0;
  check("PDR-20-business-link", businessPresent, businessId
    ? "The approved existing business was returned by the household-scoped income surface."
    : "An existing business is required; set CAPITAL_OS_PRODUCTION_BUSINESS_ID to certify the exact link.");

  const pnlRows = corrected.map(({ after }) => redactId(after?.sourceRecordId)).filter(Boolean);
  const returnedPnlById = new Map((businessIncome?.pnlSources ?? []).map((row) => [row.id, row]));
  const incomeReady = pnlRows.length === corrected.length &&
    pnlRows.every((id) => {
      const row = returnedPnlById.get(id);
      return row?.businessId === redactId(businessId) && row.periodStart && row.periodEnd;
    });
  check("PDR-21-pnl-identity-period", incomeReady, "Both corrected documents reached the business-income P&L surface with period-bearing parser records.");
  check("PDR-22-owner-draw-boundary", businessIncome?.available === true &&
    Number(businessIncome.ownerDraws ?? 0) === Number(baselineBusinessIncome?.ownerDraws ?? -1), "Document remediation did not create an owner-draw proposal.");
  check("PDR-23-verified-income-boundary", businessIncome?.available === true &&
    Number(businessIncome.verifiedIncome ?? 0) === Number(baselineBusinessIncome?.verifiedIncome ?? -1), "Document remediation did not create verified household income.");
  const correctedPeriods = new Set(corrected.map(({ after }) => `${after?.periodStart ?? ""}/${after?.periodEnd ?? ""}`));
  const reconciledRows = (businessIncome?.reconciliationRows ?? []).filter((row) =>
    row.businessId === redactId(businessId) &&
    correctedPeriods.has(`${row.periodStart ?? ""}/${row.periodEnd ?? ""}`));
  const reconciliationClosed = reconciledRows.length === corrected.length &&
    reconciledRows.every((row) => row.status === "reconciled" && row.variance === "0.00");
  if (!reconciliationClosed) {
    blocked("PDR-28-pnl-reconciliation-gate", "P&L source identity and periods are present, but the required human-reviewed period reconciliation is not closed.");
  } else {
    check("PDR-28-pnl-reconciliation-gate", true, "Both corrected P&L periods have zero-variance reconciliations.");
  }
  check("PDR-24-variable-income-gate", evidence.downstream["variable-budget"]?.available === true &&
    evidence.downstream["variable-budget"]?.forecastReadiness !== "READY", "Variable-income planning remains fail-closed until verified-income history is sufficient.");
  check("PDR-25-budget-gate", evidence.downstream.budget?.available === true && evidence.downstream.budget?.categoryCount !== null &&
    evidence.downstream.budget?.categoryCount !== undefined, "Budget read surface returned a bounded response; no income authority was inferred from it.");
  check("PDR-26-forecast-gate", evidence.downstream["cash-flow"]?.available === true &&
    evidence.downstream["cash-flow"]?.forecastConfidence !== null &&
    evidence.downstream["cash-flow"]?.forecastConfidence !== undefined, "Forecast read surface returned an explicit confidence value.");
  check("PDR-27-capital-governor-gate", evidence.downstream["capital-governor"]?.available === true &&
    (evidence.downstream["capital-governor"]?.failClosed === true ||
    evidence.downstream["capital-governor"]?.safeToDeploy === "NOT_CALCULATED"), "Capital Governor preserves fail-closed or not-calculated semantics.");
}

async function main() {
  requireConfiguration();
  await verifyOperator();
  const baselineIncomeResult = await request("/api/business/income-intelligence");
  const baselineBusinessIncome = downstreamSummary("business-income", baselineIncomeResult.body);
  if (!hasExpectedShape("business-income", baselineIncomeResult.body)) {
    throw new Error("BUSINESS_INCOME_RESPONSE_SHAPE_INVALID");
  }
  evidence.baseline = { businessIncome: baselineBusinessIncome };
  const corrected = [];
  for (const [index, documentId] of documentIds.entries()) {
    corrected.push(await correctDocument(documentId, index));
  }
  await verifyDownstream(corrected, baselineBusinessIncome);
  const failures = checks.filter((item) => item.status === "FAIL");
  const blockedChecks = checks.filter((item) => item.status === "BLOCKED");
  evidence.result = failures.length ? "FAIL" : blockedChecks.length ? "BLOCKED" : "PASS";
  mkdirSync(resolve(evidencePath, ".."), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`Redacted evidence: ${evidencePath.replace(`${root}/`, "")}`);
  console.log(`PRODUCTION DOCUMENT REMEDIATION: ${evidence.result}`);
  if (failures.length) process.exitCode = 1;
  if (blockedChecks.length && !failures.length) process.exitCode = 2;
}

main().catch((error) => {
  evidence.result = "BLOCKED";
  evidence.error = safeError(error);
  mkdirSync(resolve(evidencePath, ".."), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.error(`PRODUCTION DOCUMENT REMEDIATION: BLOCKED — ${evidence.error}`);
  console.error(`Redacted evidence: ${evidencePath.replace(`${root}/`, "")}`);
  process.exitCode = 2;
});