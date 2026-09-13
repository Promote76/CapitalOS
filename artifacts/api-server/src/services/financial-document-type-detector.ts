import { spawn } from "node:child_process";

export const FINANCIAL_DOCUMENT_DETECTION_VERSION = "financial-document-type-v1";

export type SupportedFinancialDocumentType =
  | "STEVENS_SETTLEMENT"
  | "BUSINESS_PROFIT_AND_LOSS"
  | "BANK_STATEMENT"
  | "1099"
  | "INCOME_VERIFICATION"
  | "INSURANCE_DOCUMENT"
  | "AUTO_LOAN_DOCUMENT"
  | "BUSINESS_LEASE_DOCUMENT"
  | "OTHER_FINANCIAL_DOCUMENT";

export type FinancialDocumentDetection = {
  detectedType: SupportedFinancialDocumentType;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  signals: string[];
  conflictsWithSelectedType: boolean;
  detectionVersion: string;
};

function extractPdfText(bytes: Buffer) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"]);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.length ? Buffer.concat(stderr).toString("utf8").trim() : "PDF text extraction failed"));
        return;
      }
      resolve(Buffer.concat(stdout).toString("utf8"));
    });
    child.stdin.end(bytes);
  });
}

const SIGNALS: Array<{
  type: SupportedFinancialDocumentType;
  label: string;
  pattern: RegExp;
  strength: number;
}> = [
  { type: "BUSINESS_PROFIT_AND_LOSS", label: "profit and loss heading", pattern: /\bprofit\s*(?:&|and)\s*loss\b/i, strength: 3 },
  { type: "BUSINESS_PROFIT_AND_LOSS", label: "income or revenue total", pattern: /\btotal\s+(?:income|revenue)\b/i, strength: 2 },
  { type: "BUSINESS_PROFIT_AND_LOSS", label: "expense total", pattern: /\b(?:total|operating)\s+expenses?\b/i, strength: 2 },
  { type: "BUSINESS_PROFIT_AND_LOSS", label: "net income or profit", pattern: /\bnet\s+(?:income|profit)\b/i, strength: 2 },
  { type: "BUSINESS_PROFIT_AND_LOSS", label: "accounting period table", pattern: /\b(?:income statement|accounting basis|period ended)\b/i, strength: 2 },
  { type: "STEVENS_SETTLEMENT", label: "settlement heading", pattern: /\bsettlement\b/i, strength: 3 },
  { type: "STEVENS_SETTLEMENT", label: "driver or contractor identifier", pattern: /\b(?:driver|contractor|carrier)\s*(?:id|number)?\b/i, strength: 2 },
  { type: "STEVENS_SETTLEMENT", label: "load or order number", pattern: /\b(?:load|order)\s*(?:number|no\.|#)\b/i, strength: 2 },
  { type: "STEVENS_SETTLEMENT", label: "mileage or fuel protection", pattern: /\b(?:mileage pay|fuel protection)\b/i, strength: 2 },
  { type: "STEVENS_SETTLEMENT", label: "settlement deductions", pattern: /\b(?:advances?|escrow|lease deductions?|net settlement|net pay)\b/i, strength: 2 },
  { type: "BANK_STATEMENT", label: "bank statement heading", pattern: /\b(?:bank|account)\s+statement\b/i, strength: 3 },
  { type: "BANK_STATEMENT", label: "opening and closing balances", pattern: /\b(?:opening|beginning)\s+balance\b/i, strength: 2 },
  { type: "BANK_STATEMENT", label: "deposits and withdrawals", pattern: /\b(?:deposits?|withdrawals?)\b/i, strength: 2 },
  { type: "BANK_STATEMENT", label: "Wells Fargo activity summary", pattern: /\bstatement\s+period\s+activity\s+summary\b/i, strength: 3 },
  { type: "BANK_STATEMENT", label: "Wells Fargo transaction history", pattern: /\btransaction\s+history\b/i, strength: 2 },
  { type: "BANK_STATEMENT", label: "Wells Fargo additions and subtractions", pattern: /\b(?:deposits?\s*\/\s*additions|withdrawals?\s*\/\s*subtractions)\b/i, strength: 2 },
  { type: "BANK_STATEMENT", label: "Wells Fargo ending daily balance", pattern: /\bending\s+daily\s+balance\b/i, strength: 2 },
];

function filenameSignal(filename: string): { type: SupportedFinancialDocumentType; label: string } | null {
  if (/(?:p\s*&\s*l|profit[\s_-]*and[\s_-]*loss|income statement)/i.test(filename)) {
    return { type: "BUSINESS_PROFIT_AND_LOSS", label: "filename suggests P&L (supporting only)" };
  }
  if (/settlement/i.test(filename)) {
    return { type: "STEVENS_SETTLEMENT", label: "filename suggests settlement (supporting only)" };
  }
  if (/statement/i.test(filename)) {
    return { type: "BANK_STATEMENT", label: "filename suggests bank statement (supporting only)" };
  }
  return null;
}

export async function detectFinancialDocumentType(
  bytes: Buffer,
  filename: string,
  selectedType: SupportedFinancialDocumentType,
): Promise<FinancialDocumentDetection> {
  let text = "";
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    try {
      text = (await extractPdfText(bytes)).replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
    } catch {
      text = "";
    }
  }
  return classifyFinancialDocumentText(text, filename, selectedType);
}

export function classifyFinancialDocumentText(
  text: string,
  filename: string,
  selectedType: SupportedFinancialDocumentType,
): FinancialDocumentDetection {
  const scores = new Map<SupportedFinancialDocumentType, number>();
  const matchedSignals: string[] = [];
  for (const signal of SIGNALS) {
    if (!signal.pattern.test(text)) continue;
    scores.set(signal.type, (scores.get(signal.type) ?? 0) + signal.strength);
    matchedSignals.push(signal.label);
  }
  const filenameMatch = filenameSignal(filename);
  if (filenameMatch) {
    scores.set(filenameMatch.type, (scores.get(filenameMatch.type) ?? 0) + 1);
    matchedSignals.push(filenameMatch.label);
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [winner, runnerUp] = ranked;
  const detectedType = winner?.[0] ?? "OTHER_FINANCIAL_DOCUMENT";
  const winningScore = winner?.[1] ?? 0;
  const margin = winningScore - (runnerUp?.[1] ?? 0);
  const confidence: FinancialDocumentDetection["confidence"] =
    winningScore >= 5 && margin >= 2 ? "HIGH" :
    winningScore >= 3 && margin >= 1 ? "MEDIUM" : "LOW";
  const contentSignals = matchedSignals.filter((signal) => !signal.includes("filename"));
  const conflictsWithSelectedType = detectedType !== selectedType &&
    confidence === "HIGH" &&
    contentSignals.length > 0;
  return {
    detectedType,
    confidence,
    signals: matchedSignals,
    conflictsWithSelectedType,
    detectionVersion: FINANCIAL_DOCUMENT_DETECTION_VERSION,
  };
}