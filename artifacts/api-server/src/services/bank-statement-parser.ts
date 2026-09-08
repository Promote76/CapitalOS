import * as XLSX from "xlsx";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

export const BANK_STATEMENT_PARSER_VERSION = "bank-statement-v1";
type Direction = "deposit" | "withdrawal";
export type ParsedStatementRow = { postedDate: string; description: string; amount: string; direction: Direction; runningBalance: string | null; reference: string | null; sourcePage: number | null; sourceLine: number; sourceRegion: string; originalValue: Record<string, unknown>; evidenceFingerprint: string };
export type ParsedStatement = { rows: ParsedStatementRow[]; errors: string[]; openingBalance: string | null; closingBalance: string | null; totalDeposits: string | null; totalWithdrawals: string | null };

const aliases: Record<string, string[]> = {
  date: ["date", "posted date", "posting date", "transaction date"],
  description: ["description", "memo", "details", "transaction description", "payee"],
  amount: ["amount", "transaction amount"],
  debit: ["debit", "withdrawal", "withdrawals", "charge", "debits"],
  credit: ["credit", "deposit", "deposits", "payment", "credits"],
  balance: ["balance", "running balance"],
  reference: ["reference", "ref", "check number", "check #", "id"],
};
const header = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const find = (headers: string[], name: string) => headers.findIndex((item) => aliases[name].includes(item));
function cents(value: unknown): string | null {
  const source = String(value ?? "").trim();
  if (!source) return null;
  const negative = /^\s*-/.test(source) || /^\s*\(/.test(source);
  const normalized = source.replace(/[$,\s()]/g, "").replace(/^-/, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return `${negative ? "-" : ""}${whole}.${fraction.padEnd(2, "0")}`;
}
function date(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const local = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!iso && !local) return null;
  const result = iso
    ? `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
    : `${local![3]}-${local![1].padStart(2, "0")}-${local![2].padStart(2, "0")}`;
  return Number.isNaN(Date.parse(`${result}T00:00:00Z`)) ? null : result;
}
function parseRows(matrix: unknown[][]): ParsedStatement {
  const empty: ParsedStatement = { rows: [], errors: [], openingBalance: null, closingBalance: null, totalDeposits: null, totalWithdrawals: null };
  for (const row of matrix) {
    const label = header(row[0]);
    const value = cents(row[1]);
    if (!value) continue;
    if (/^opening (?:available )?balance$/.test(label)) empty.openingBalance = value;
    if (/^closing (?:available )?balance$/.test(label)) empty.closingBalance = value;
    if (/^total (?:credits|deposits)$/.test(label)) empty.totalDeposits = value.replace(/^-/, "");
    if (/^total (?:debits|withdrawals)$/.test(label)) empty.totalWithdrawals = value.replace(/^-/, "");
  }
  const headerRow = matrix.findIndex((row) => row.some((cell) => aliases.date.includes(header(cell))) && row.some((cell) => aliases.description.includes(header(cell))));
  if (headerRow < 0) return { ...empty, errors: ["Could not find unambiguous date and description headers."] };
  const headers = matrix[headerRow].map(header); const dateIndex = find(headers, "date"); const descIndex = find(headers, "description");
  const amountIndex = find(headers, "amount"); const debitIndex = find(headers, "debit"); const creditIndex = find(headers, "credit");
  if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0) return { ...empty, errors: ["Could not find an amount, debit, or credit header."] };
  const balanceIndex = find(headers, "balance"); const referenceIndex = find(headers, "reference");
  const rows: ParsedStatementRow[] = [];
  for (let i = headerRow + 1; i < matrix.length; i += 1) {
    const raw = matrix[i]; if (raw.every((cell) => !String(cell ?? "").trim())) continue;
    if (/^(opening|closing) (?:available )?balance$/i.test(String(raw[0] ?? "").trim())) continue;
    const postedDate = date(raw[dateIndex]); const description = String(raw[descIndex] ?? "").trim();
    const amount = amountIndex >= 0 ? cents(raw[amountIndex]) : null;
    const debit = debitIndex >= 0 ? cents(raw[debitIndex]) : null; const credit = creditIndex >= 0 ? cents(raw[creditIndex]) : null;
    if (!postedDate || !description || (amount === null && debit === null && credit === null) || (amount !== null && (debit !== null || credit !== null)) || (debit !== null && credit !== null)) {
      empty.errors.push(`Row ${i + 1} is malformed or has ambiguous amount columns.`); continue;
    }
    const selected = amount ?? credit ?? debit!;
    const direction: Direction = credit ? "deposit" : debit ? "withdrawal" : selected.startsWith("-") ? "withdrawal" : "deposit";
    const absolute = selected.replace(/^-/, "");
    const originalValue = Object.fromEntries(headers.map((key, index) => [key, raw[index] ?? null]));
    const fingerprint = createHash("sha256").update(JSON.stringify([postedDate, description.toLowerCase(), absolute, direction, raw[referenceIndex] ?? ""])).digest("hex");
    rows.push({ postedDate, description, amount: absolute, direction, runningBalance: balanceIndex >= 0 ? cents(raw[balanceIndex]) : null, reference: referenceIndex >= 0 ? String(raw[referenceIndex] ?? "").trim() || null : null, sourcePage: null, sourceLine: i + 1, sourceRegion: `row:${i + 1}`, originalValue, evidenceFingerprint: fingerprint });
  }
  return { ...empty, rows };
}
async function pdfText(bytes: Buffer) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"]); const output: Buffer[] = []; const errors: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk)); child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(Buffer.concat(output).toString("utf8")) : reject(new Error(Buffer.concat(errors).toString("utf8"))));
    child.stdin.end(bytes);
  });
}
function pdfStatement(text: string): ParsedStatement {
  const result: ParsedStatement = { rows: [], errors: [], openingBalance: null, closingBalance: null, totalDeposits: null, totalWithdrawals: null };
  const pages = text.split("\f");
  const hasIdentifier = /(?:account|statement\s*period|from\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\s+(?:to|through)\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i.test(text);
  if (!hasIdentifier) return { ...result, errors: ["PDF is missing a statement period or account identifier; manual review is required."] };
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].split(/\r?\n/); const headerLine = lines.find((line) => /\bdate\b/i.test(line) && /\b(?:description|details|memo)\b/i.test(line) && /\b(?:amount|debit|credit)\b/i.test(line));
    if (!headerLine) { if (lines.some((line) => /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line))) result.errors.push(`Page ${page + 1} has transaction-like text without an unambiguous column header.`); continue; }
    const debitCredit = /\bdebit\b/i.test(headerLine) && /\bcredit\b/i.test(headerLine);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const raw = lines[lineIndex].replace(/\s+/g, " ").trim();
      const match = raw.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(.+?)\s+((?:-|\()?\$?[\d,]+(?:\.\d{1,2})?\)?)(?:\s+((?:-|\()?\$?[\d,]+(?:\.\d{1,2})?\)?))?(?:\s+((?:-|\()?\$?[\d,]+(?:\.\d{1,2})?\)?))?$/);
      if (!match) continue;
      const postedDate = date(match[1]); const description = match[2]; const first = cents(match[3]); const second = cents(match[4]); const third = cents(match[5]);
      if (!postedDate || !first || !description || (debitCredit ? (!second || third !== null) : (second !== null && third !== null))) { result.errors.push(`Page ${page + 1}, line ${lineIndex + 1} has an ambiguous transaction layout.`); continue; }
      const direction: Direction = debitCredit ? "withdrawal" : first.startsWith("-") ? "withdrawal" : "deposit";
      const amount = first.replace(/^-/, "");
      const runningBalance = debitCredit ? second : second;
      const originalValue = { text: raw, page: page + 1, line: lineIndex + 1, layout: debitCredit ? "debit_credit" : "signed_amount" };
      result.rows.push({ postedDate, description, amount, direction, runningBalance, reference: null, sourcePage: page + 1, sourceLine: lineIndex + 1, sourceRegion: `page:${page + 1};line:${lineIndex + 1}`, originalValue, evidenceFingerprint: createHash("sha256").update(JSON.stringify([postedDate, description.toLowerCase(), amount, direction])).digest("hex") });
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(opening|closing)\s+(?:available\s+)?balance\s+\$?([\d,]+(?:\.\d{1,2})?)/i); if (match) { if (match[1].toLowerCase() === "opening") result.openingBalance = cents(match[2]); else result.closingBalance = cents(match[2]); }
    const total = line.match(/^\s*total\s+(deposits?|credits?|withdrawals?|debits?)\s+\$?([\d,]+(?:\.\d{1,2})?)/i); if (total) { if (/deposit|credit/i.test(total[1])) result.totalDeposits = cents(total[2]); else result.totalWithdrawals = cents(total[2]); }
  }
  if (result.errors.length) result.rows = [];
  if (!result.rows.length && !result.errors.length) result.errors.push("No unambiguous transaction rows were found in the PDF.");
  return result;
}
export async function parseBankStatement(bytes: Buffer, contentType: string): Promise<ParsedStatement> {
  if (contentType === "application/pdf") {
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return { rows: [], errors: ["File is not a valid PDF bank statement."], openingBalance: null, closingBalance: null, totalDeposits: null, totalWithdrawals: null };
    try { return pdfStatement(await pdfText(bytes)); } catch { return { rows: [], errors: ["PDF text extraction failed; encrypted, image-only, or corrupt statements require manual review."], openingBalance: null, closingBalance: null, totalDeposits: null, totalWithdrawals: null }; }
  }
  try {
    if (contentType === "text/csv") return parseRows(csvMatrix(bytes.toString("utf8")));
    const workbook = XLSX.read(bytes, { type: "buffer", raw: false });
    if (workbook.SheetNames.length !== 1) return { rows: [], errors: ["XLSX must contain exactly one transaction worksheet."], openingBalance: null, closingBalance: null, totalDeposits: null, totalWithdrawals: null };
    return parseRows(XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" }) as unknown[][]);
  } catch { return { rows: [], errors: ["Statement file could not be parsed as structured CSV/XLSX."] , openingBalance: null, closingBalance: null, totalDeposits: null, totalWithdrawals: null }; }
}
function csvMatrix(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\"") { if (quoted && text[i + 1] === "\"") { cell += char; i += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("Unterminated CSV quoted value");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}