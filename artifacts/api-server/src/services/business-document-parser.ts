import { spawn } from "node:child_process";
import { classifySettlementLine, type SettlementEconomicTreatment } from "../domain/business-income";

export const BUSINESS_DOCUMENT_PARSER_LIMITS = {
  maxInputBytes: 50 * 1024 * 1024,
  maxPdfOutputBytes: 50 * 1024 * 1024,
  pdfTimeoutMs: 15_000,
} as const;

export type ParsedBusinessDocument = {
  kind: "settlement" | "profit_loss";
  extractionStatus: "complete" | "ambiguous" | "failed";
  reason: string;
  pageCount: number | null;
  statementPeriodStart: string | null;
  statementPeriodEnd: string | null;
  paidDate: string | null;
  provider: string | null;
  gross: string | null;
  deductions: string | null;
  net: string | null;
  revenue: string | null;
  expenses: string | null;
  profit: string | null;
  revenueLines: Array<{ description: string; amount: string; sourcePage: number; normalizedCategory: string; economicTreatment: SettlementEconomicTreatment }>;
  deductionLines: Array<{ description: string; amount: string; sourcePage: number; normalizedCategory: string; economicTreatment: SettlementEconomicTreatment }>;
  lines: Array<{ description: string; amount: string; lineType: "revenue" | "expense"; sourcePage: number }>;
};

const DATE_PATTERN = /\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g;
const MONEY_PATTERN = /(?:USD\s*)?\$?\s*\(?-?\d[\d,]*(?:\.\d{1,2})?\)?/g;

function dateValue(year: string, month: string, day: string) {
  const value = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function dates(text: string) {
  return Array.from(text.matchAll(DATE_PATTERN))
    .map((match) => dateValue(match[1], match[2], match[3]))
    .filter((value): value is string => value !== null);
}

function moneyValue(raw: string | undefined) {
  if (!raw) return null;
  const negative = raw.includes("(") || raw.trim().startsWith("-");
  const numeric = raw.replace(/[$,\s()USD]/gi, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(numeric)) return null;
  return `${negative ? "-" : ""}${Number(numeric).toFixed(2)}`;
}

function amountsOnLine(line: string) {
  return Array.from(line.matchAll(MONEY_PATTERN))
    .map((match) => moneyValue(match[0]))
    .filter((value): value is string => value !== null);
}

function labeledAmount(text: string, labels: RegExp[]) {
  const candidates: string[] = [];
  let ambiguous = false;
  for (const line of text.split(/\r?\n|\f/)) {
    if (/(?:statement|period|date|through)/i.test(line)) continue;
    if (!labels.some((label) => label.test(line))) continue;
    const values = amountsOnLine(line);
    if (values.length > 1) ambiguous = true;
    if (values.length > 0) candidates.push(values[values.length - 1]);
  }
  const distinct = [...new Set(candidates)];
  return {
    value: distinct[0] ?? null,
    ambiguous: ambiguous || distinct.length > 1,
  };
}

function period(text: string) {
  const found = dates(text);
  return {
    start: found[0] ?? null,
    end: found[1] ?? found[0] ?? null,
  };
}

function candidateLines(text: string, excluded: RegExp[]) {
  let sourcePage = 1;
  const lines: Array<{ line: string; page: number }> = [];
  for (const line of text.split(/\r?\n/)) {
    const pageLines = line.split("\f");
    for (const [index, pageLine] of pageLines.entries()) {
      lines.push({ line: pageLine, page: sourcePage });
      if (index < pageLines.length - 1) sourcePage += 1;
    }
  }
  return lines
    .map(({ line, page }) => ({
      line: line.replace(/\s+/g, " ").trim(),
      page,
    }))
    .filter(({ line }) => line.length > 2 && !excluded.some((pattern) => pattern.test(line)))
    .map(({ line, page }) => {
      const values = amountsOnLine(line);
      const amount = values[values.length - 1];
      if (!amount) return null;
      const description = line
        .replace(MONEY_PATTERN, "")
        .replace(/[|:]+$/, "")
        .trim();
      if (!description || /^\d+$/.test(description)) return null;
      return { description: description.slice(0, 300), amount, sourcePage: page };
    })
    .filter((line): line is { description: string; amount: string; sourcePage: number } => line !== null);
}

async function extractPdfText(bytes: Buffer) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"]);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PDF text extraction exceeded the resource limit"));
    }, BUSINESS_DOCUMENT_PARSER_LIMITS.pdfTimeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > BUSINESS_DOCUMENT_PARSER_LIMITS.maxPdfOutputBytes) {
        child.kill("SIGKILL");
        reject(new Error("PDF text extraction exceeded the resource limit"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr.length ? Buffer.concat(stderr).toString("utf8").trim() : "PDF text extraction failed"));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(bytes);
  });
}

export async function parseBusinessPdf(bytes: Buffer, kind: "settlement" | "profit_loss"): Promise<ParsedBusinessDocument> {
  const base = {
    kind,
    extractionStatus: "failed" as const,
    reason: "The uploaded document could not be extracted.",
    pageCount: null,
    statementPeriodStart: null,
    statementPeriodEnd: null,
    paidDate: null,
    provider: null,
    gross: null,
    deductions: null,
    net: null,
    revenue: null,
    expenses: null,
    profit: null,
    revenueLines: [],
    deductionLines: [],
    lines: [],
  };
  if (bytes.length > BUSINESS_DOCUMENT_PARSER_LIMITS.maxInputBytes) {
    return { ...base, reason: "The PDF exceeds the safe parser size limit; manual review is required." };
  }
  if (bytes.length < 5 || bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return { ...base, reason: "Unsupported document: only PDF files are accepted." };
  }
  let text: string;
  try {
    text = await extractPdfText(bytes);
  } catch {
    return { ...base, reason: "The PDF could not be read. It may be encrypted, corrupted, or image-only." };
  }
  const normalized = text.replace(/\u0000/g, " ").trim();
  const pageCount = Math.max(1, (normalized.match(/\f/g) ?? []).length + 1);
  if (!normalized) {
    return { ...base, pageCount, reason: "The PDF contains no readable text; manual review is required." };
  }
  const range = period(normalized);
  const common = {
    pageCount,
    statementPeriodStart: range.start,
    statementPeriodEnd: range.end,
    paidDate: dates(normalized)[2] ?? range.end,
    provider: normalized.split(/\r?\n/).map((line) => line.trim()).find((line) => /provider|merchant|company|business/i.test(line))?.slice(0, 80) ?? null,
  };
  if (kind === "settlement") {
    const grossResult = labeledAmount(normalized, [/^(?:gross|total (?:earnings|revenue|amount))\b/i]);
    const deductionsResult = labeledAmount(normalized, [/^total deductions?\b/i]);
    const netResult = labeledAmount(normalized, [/^(?:net (?:pay|amount|paid)|amount paid|deposit)\b/i]);
    const gross = grossResult.value;
    const deductions = deductionsResult.value;
    const net = netResult.value;
    const allLines = candidateLines(normalized, [/gross|net|deduction|total|period|date|statement/i]);
    const revenueLines = allLines.filter((line) => !/tax|fee|deduction|withhold|reimburse|owner draw/i.test(line.description));
    const deductionLines = allLines.filter((line) => /tax|fee|deduction|withhold|reimburse|owner draw/i.test(line.description));
    const fallbackRevenue = gross && revenueLines.length === 0 ? [{ description: "Extracted settlement gross", amount: gross, sourcePage: 1 }] : revenueLines;
    const fallbackDeductions = deductions && deductions !== "0.00" && deductionLines.length === 0
      ? [{ description: "Extracted settlement deductions", amount: deductions, sourcePage: 1 }]
      : deductionLines;
    const complete = Boolean(
      gross && deductions && net && common.statementPeriodStart && common.statementPeriodEnd &&
      !grossResult.ambiguous && !deductionsResult.ambiguous && !netResult.ambiguous,
    );
    const classifiedRevenue = fallbackRevenue.map((line) => ({ ...line, ...classifySettlementLine(line.description, "revenue") }));
    const classifiedDeductions = fallbackDeductions.map((line) => ({ ...line, ...classifySettlementLine(line.description, "deduction") }));
    const hasUnknownLine = [...classifiedRevenue, ...classifiedDeductions].some((line) => line.economicTreatment === "UNKNOWN_REVIEW_REQUIRED");
    return {
      ...base,
      ...common,
      gross,
      deductions: deductions ?? "0.00",
      net,
      revenueLines: classifiedRevenue,
      deductionLines: classifiedDeductions,
      extractionStatus: complete && !hasUnknownLine ? "complete" : "ambiguous",
      reason: complete && !hasUnknownLine ? "Settlement totals and line items were extracted from the PDF." : hasUnknownLine
        ? "Settlement totals were extracted, but one or more economic treatments require human review."
        : "The PDF did not contain an unambiguous gross, deductions, net, and statement period.",
    };
  }
  const revenueResult = labeledAmount(normalized, [/^(?:total revenue|revenue)\b/i]);
  const expensesResult = labeledAmount(normalized, [/^(?:total expenses?|operating expenses?|expenses?)\b/i]);
  const profitResult = labeledAmount(normalized, [/^(?:net profit|net income|profit)\b/i]);
  const revenue = revenueResult.value;
  const expenses = expensesResult.value;
  const profit = profitResult.value;
  const lines = candidateLines(normalized, [/total revenue|total expenses?|net profit|net income|period|date|statement/i])
    .map((line) => ({ ...line, lineType: /expense|cost|fee|tax/i.test(line.description) ? "expense" as const : "revenue" as const }));
  const fallbackLines = lines.length > 0 ? lines : [
    ...(revenue ? [{ description: "Extracted P&L revenue", amount: revenue, lineType: "revenue" as const, sourcePage: 1 }] : []),
    ...(expenses ? [{ description: "Extracted P&L expenses", amount: expenses, lineType: "expense" as const, sourcePage: 1 }] : []),
  ];
  const complete = Boolean(
    revenue && expenses && profit && common.statementPeriodStart && common.statementPeriodEnd &&
    !revenueResult.ambiguous && !expensesResult.ambiguous && !profitResult.ambiguous,
  );
  return {
    ...base,
    ...common,
    revenue,
    expenses,
    profit,
    lines: fallbackLines,
    extractionStatus: complete ? "complete" : "ambiguous",
    reason: complete ? "P&L totals and line items were extracted from the PDF." : "The PDF did not contain an unambiguous revenue, expense, profit, and statement period.",
  };
}