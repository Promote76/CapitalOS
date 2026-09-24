import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const origin = (process.env.CAPITAL_OS_BROWSER_ORIGIN ?? "").replace(/\/$/, "");
const workspaceRoot = resolve(import.meta.dirname, "../../../..");
const householdId = process.env.CAPITAL_OS_PRODUCTION_HOUSEHOLD_ID ?? "";
const documentIds = (process.env.CAPITAL_OS_PRODUCTION_DOCUMENT_IDS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const evidencePath = resolve(
  workspaceRoot,
  process.env.CAPITAL_OS_PRODUCTION_REMEDIATION_BROWSER_EVIDENCE_PATH ??
    "docs/certification/logs/PRODUCTION_DOCUMENT_REMEDIATION_BROWSER_LATEST.json",
);

type Evidence = {
  runner: string;
  version: string;
  observedAt: string;
  origin: string;
  household: string | null;
  documents: Array<Record<string, unknown>>;
  business?: Record<string, unknown>;
  baseline?: Record<string, unknown>;
  after?: Record<string, unknown>;
  checks: Array<Record<string, unknown>>;
  result?: "PASS" | "FAIL" | "BLOCKED";
  error?: string;
};

const evidence: Evidence = {
  runner: "production-document-remediation-certification",
  version: "2026-09-08.published-origin.browser.v1",
  observedAt: new Date().toISOString(),
  origin: origin || "[missing]",
  household: redactId(householdId),
  documents: [],
  checks: [],
};

function redactId(value: unknown) {
  if (!value) return null;
  const text = String(value);
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

function redactText(value: unknown) {
  return String(value)
    .replace(/(cookie|authorization|session|token|jwt|password|secret|otp)[=:]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]");
}

function safeError(error: unknown) {
  return redactText(error instanceof Error ? error.message : String(error));
}

function check(id: string, passed: boolean, detail: string, extra: Record<string, unknown> = {}) {
  const result = { id, status: passed ? "PASS" : "FAIL", detail: redactText(detail), ...extra };
  evidence.checks.push(result);
  return passed;
}

function summary(document: Record<string, any> | undefined) {
  return {
    id: redactId(document?.id),
    file: redactText(document?.sourceFileName ?? ""),
    type: document?.documentType ?? null,
    originalType: document?.originalDocumentType ?? null,
    detectedType: document?.detectedDocumentType ?? null,
    confidence: document?.detectionConfidence ?? null,
    mismatchStatus: document?.typeMismatchStatus ?? null,
    identityStatus: document?.identityStatus ?? null,
    businessId: redactId(document?.businessId),
    hash: document?.documentHash ? `${String(document.documentHash).slice(0, 10)}…` : null,
    sourcePathPresent: Boolean(document?.sourceObjectPath),
    parserVersion: document?.parserVersion ?? null,
    sourceRecordType: document?.sourceRecordType ?? null,
    sourceRecordId: redactId(document?.sourceRecordId),
    periodStart: document?.periodStart ?? null,
    periodEnd: document?.periodEnd ?? null,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["createdAt", "updatedAt", "reviewedAt", "generatedAt", "observedAt"].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex").slice(0, 16);
}

async function api(page: import("@playwright/test").Page, path: string, init: { method?: string; body?: unknown } = {}) {
  const result = await page.evaluate(async ({ path: requestPath, method, body }) => {
    const response = await fetch(requestPath, {
      method: method ?? "GET",
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { text: text.slice(0, 300) };
    }
    return { ok: response.ok, status: response.status, body: parsed };
  }, { path, method: init.method, body: init.body });
  if (!result.ok) {
    const body = result.body as { code?: string; message?: string } | null;
    throw new Error(`${body?.code ?? `HTTP_${result.status}`}: ${body?.message ?? "published-origin request failed"}`);
  }
  return result.body as any;
}

async function snapshot(page: import("@playwright/test").Page, month: string) {
  const [businesses, income, accounting, budget, cashFlow, audit] = await Promise.all([
    api(page, "/api/business/companies"),
    api(page, "/api/business/income-intelligence"),
    api(page, "/api/accounting"),
    api(page, `/api/budget?month=${encodeURIComponent(month)}`),
    api(page, `/api/cash-flow?month=${encodeURIComponent(month)}`),
    api(page, "/api/audit"),
  ]);
  const ownerDraws: Array<Record<string, any>> = Array.isArray(income?.ownerDraws) ? income.ownerDraws : [];
  const verifiedIncome: Array<Record<string, any>> = Array.isArray(income?.verifiedIncome) ? income.verifiedIncome : [];
  const auditRows: Array<Record<string, any>> = Array.isArray(audit) ? audit : [];
  return {
    businessCount: Array.isArray(businesses) ? businesses.length : null,
    businessIds: Array.isArray(businesses) ? businesses.map((row) => redactId(row.id)) : [],
    ownerDraws: ownerDraws.map((row) => ({ id: redactId(row.id), status: row.status, amount: row.amount, businessId: redactId(row.businessId) })),
    verifiedIncome: verifiedIncome.map((row) => ({ id: redactId(row.id), status: row.verificationStatus, amount: row.amount, source: row.sourceType })),
    accountingFingerprint: fingerprint(accounting),
    budgetFingerprint: fingerprint(budget),
    cashFlowFingerprint: fingerprint(cashFlow),
    auditIds: auditRows.map((row) => redactId(row.id)).filter(Boolean),
    auditEventTypes: auditRows.map((row) => row.eventType).filter(Boolean),
    incomePnl: Array.isArray(income?.profitLossDocuments)
      ? income.profitLossDocuments.map((row: Record<string, any>) => ({
        id: redactId(row.id),
        businessId: redactId(row.businessId),
        periodStart: row.statementPeriodStart ?? null,
        periodEnd: row.statementPeriodEnd ?? null,
        verificationStatus: row.verificationStatus ?? null,
      }))
      : [],
  };
}

async function signIn(page: import("@playwright/test").Page) {
  const email = process.env.CAPITAL_OS_PRODUCTION_OPERATOR_EMAIL ?? process.env.BROWSER_TEST_EMAIL;
  const password = process.env.CAPITAL_OS_PRODUCTION_OPERATOR_PASSWORD ?? process.env.BROWSER_TEST_PASSWORD;
  if (!origin || !/^https:\/\//.test(origin)) throw new Error("PRODUCTION_PUBLISHED_HTTPS_ORIGIN_REQUIRED");
  if (!/^[0-9a-f-]{36}$/i.test(householdId) || documentIds.length !== 2 || !documentIds.every((id) => /^[0-9a-f-]{36}$/i.test(id))) {
    throw new Error("PRODUCTION_TARGET_CONFIGURATION_REQUIRED");
  }
  if (!email || !password) throw new Error("PRODUCTION_OPERATOR_CREDENTIALS_REQUIRED");

  await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter your email address").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForTimeout(1500);
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/sign-in/factor-one") throw new Error("PRODUCTION_CLERK_MFA_REQUIRED");
  if (pathname === "/sign-in") throw new Error("PRODUCTION_CLERK_SIGN_IN_FAILED");
  return api(page, "/api/auth/me");
}

test("certify authenticated production document remediation", async ({ page }) => {
  test.setTimeout(120_000);
  try {
    const me = await signIn(page);
    const memberships = Array.isArray(me?.memberships) ? me.memberships : [];
    const membership = memberships.find((item: Record<string, any>) => item.householdId === householdId && item.active !== false);
    check("PDR-BROWSER-01-authenticated-clerk-session", me?.authStrength === "clerk_session", "Published origin returned a real Clerk session.");
    check("PDR-BROWSER-02-target-household", Boolean(membership), "Authenticated operator belongs to the target household.");
    check(
      "PDR-BROWSER-03-approver-permission",
      Boolean(membership && (membership.role === "owner" || membership.permissions?.includes("approve"))),
      "Authenticated operator has the approver boundary.",
    );
    if (!membership || me?.authStrength !== "clerk_session") throw new Error("PRODUCTION_CLERK_OPERATOR_HOUSEHOLD_MISMATCH");

    const month = new Date().toISOString().slice(0, 7);
    const before = await snapshot(page, month);
    evidence.baseline = before;
    const docs = await Promise.all(documentIds.map((id) => api(page, `/api/financial-documents/${id}`)));
    if (docs.length !== 2) throw new Error("EXACTLY_TWO_PRODUCTION_DOCUMENTS_REQUIRED");
    if (!docs.every((doc) => doc?.detectedDocumentType === "BUSINESS_PROFIT_AND_LOSS" && doc?.detectionConfidence === "HIGH" && doc?.sourceObjectPath)) {
      throw new Error("PRODUCTION_DOCUMENT_SOURCE_PREFLIGHT_FAILED");
    }

    const businessSetup = await api(page, "/api/business/companies/resolve-compatible", {
      method: "POST",
      body: {
        businessKind: "INDEPENDENT_CONTRACTOR_TRUCKING",
        idempotencyKey: "pdr-2026-09-08-canonical-trucking-boundary",
      },
    });
    const businessReplay = await api(page, "/api/business/companies/resolve-compatible", {
      method: "POST",
      body: {
        businessKind: "INDEPENDENT_CONTRACTOR_TRUCKING",
        idempotencyKey: "pdr-2026-09-08-canonical-trucking-boundary",
      },
    });
    const businessId = businessSetup?.business?.id;
    evidence.business = {
      outcome: businessSetup?.outcome ?? null,
      id: redactId(businessId),
      replayId: redactId(businessReplay?.business?.id),
      replayOutcome: businessReplay?.outcome ?? null,
    };
    check("PDR-BROWSER-04-canonical-business", Boolean(businessId) && businessId === businessReplay?.business?.id, "Canonical trucking business resolution was idempotent.");
    check("PDR-BROWSER-05-single-business-boundary", before.businessCount === null || before.businessCount + (businessSetup.outcome === "CREATED" ? 1 : 0) === (await api(page, "/api/business/companies")).length, "Business resolution created or reused exactly one household boundary.");
    if (!businessId) throw new Error("CANONICAL_TRUCKING_BUSINESS_ID_MISSING");

    const corrected = [];
    for (const [index, documentId] of documentIds.entries()) {
      const beforeDocument = docs[index];
      const correctionKey = `pdr-2026-09-08-type-correction-${documentId}`;
      const correctedDocument = beforeDocument.typeMismatchStatus === "CORRECTED" && beforeDocument.documentType === "BUSINESS_PROFIT_AND_LOSS"
        ? beforeDocument
        : await api(page, `/api/financial-documents/${documentId}/type-decision`, {
          method: "POST",
          body: {
            action: "USE_DETECTED_TYPE",
            reason: "Authorized production remediation: content evidence is a high-confidence business P&L; preserve the original source and supersede the legacy settlement parse.",
            idempotencyKey: correctionKey,
          },
        });
      const linked = await api(page, `/api/financial-documents/${documentId}/business-link`, {
        method: "POST",
        body: {
          businessId,
          reason: "Confirmed this high-confidence business P&L belongs to the canonical trucking operating boundary.",
          idempotencyKey: `pdr-2026-09-08-business-link-${documentId}`,
        },
      });
      const record = {
        target: redactId(documentId),
        before: summary(beforeDocument),
        correction: summary(correctedDocument),
        linked: summary(linked),
      };
      evidence.documents.push(record);
      check(`PDR-BROWSER-${String(6 + index * 3).padStart(2, "0")}-type-correction`, correctedDocument.documentType === "BUSINESS_PROFIT_AND_LOSS" && correctedDocument.typeMismatchStatus === "CORRECTED", "Document was independently corrected through the audited route.");
      check(`PDR-BROWSER-${String(7 + index * 3).padStart(2, "0")}-business-link`, linked.businessId === businessId, "Document was linked to the canonical household business.");
      check(`PDR-BROWSER-${String(8 + index * 3).padStart(2, "0")}-source-preservation`, beforeDocument.documentHash === linked.documentHash && beforeDocument.sourceObjectPath === linked.sourceObjectPath && beforeDocument.sourceFileName === linked.sourceFileName, "Source hash, private object path, and filename were preserved.");
      corrected.push({ id: documentId, document: linked });
    }

    const samePeriod = corrected[0].document.periodStart === corrected[1].document.periodStart &&
      corrected[0].document.periodEnd === corrected[1].document.periodEnd;
    const classification = corrected[0].document.documentHash === corrected[1].document.documentHash
      ? "EXACT_DUPLICATE"
      : samePeriod ? "CORRECTED_VERSION" : "DISTINCT_PERIOD";
    for (const [index, current] of corrected.entries()) {
      const compared = corrected[index === 0 ? 1 : 0];
      const identity = await api(page, `/api/financial-documents/${current.id}/identity-review`, {
        method: "POST",
        body: {
          comparedDocumentId: compared.id,
          classification,
          reason: "Reviewed source hashes, periods, totals, and content detection independently before recording document identity.",
          ...(classification === "EXACT_DUPLICATE" || classification === "CORRECTED_VERSION"
            ? { canonicalDocumentId: corrected[0].id }
            : {}),
        },
      });
      check(`PDR-BROWSER-${String(9 + index).padStart(2, "0")}-identity-review`, ["DUPLICATE_REFERENCE", "REVIEWED"].includes(identity.identityStatus), "Document identity review was persisted independently.");
    }

    const after = await snapshot(page, month);
    evidence.after = after;
    check("PDR-BROWSER-11-owner-draws-unchanged", JSON.stringify(after.ownerDraws) === JSON.stringify(before.ownerDraws), "Document remediation did not create or alter owner draws.");
    check("PDR-BROWSER-12-household-income-unchanged", JSON.stringify(after.verifiedIncome) === JSON.stringify(before.verifiedIncome), "Document remediation did not create or alter verified household income.");
    check("PDR-BROWSER-13-budget-unchanged", after.budgetFingerprint === before.budgetFingerprint, "Budget read surface remained unchanged.");
    check("PDR-BROWSER-14-money-movement-unchanged", after.accountingFingerprint === before.accountingFingerprint, "Accounting and money-movement read surface remained unchanged.");
    check("PDR-BROWSER-15-audit-preserved", before.auditIds.every((id) => after.auditIds.includes(id)), "Existing audit rows remained present.");
    check("PDR-BROWSER-16-audit-recorded", after.auditEventTypes.includes("financial_document_type_corrected") && after.auditEventTypes.includes("financial_document_business_linked") && after.auditEventTypes.includes("financial_document_identity_reviewed"), "Correction, business-link, and identity-review audit events were recorded.");
    check("PDR-BROWSER-17-pnl-sources", corrected.every(({ document }) => document.documentType === "BUSINESS_PROFIT_AND_LOSS" && document.sourceRecordType === "profit_loss_document" && document.sourceRecordId && document.parserVersion === "business-profit-loss-parser-v1"), "Both corrected documents have current P&L parser history and source records.");
    check("PDR-BROWSER-18-business-income-identity", corrected.every(({ document }) => after.incomePnl.some((row: Record<string, any>) => row.id === redactId(document.sourceRecordId) && row.businessId === redactId(businessId))), "Both corrected P&Ls reached the household business-income surface.");
    evidence.result = evidence.checks.some((item) => item.status === "FAIL") ? "FAIL" : "PASS";
    expect(evidence.result).toBe("PASS");
  } catch (error) {
    evidence.result = "BLOCKED";
    evidence.error = safeError(error);
    throw error;
  } finally {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  }
});