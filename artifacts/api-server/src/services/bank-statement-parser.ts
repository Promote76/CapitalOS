import { createHash } from "node:crypto";
import { spawn } from "node:child_process";

export const BANK_STATEMENT_PARSER_VERSION = "bank-statement-v2";
// Structured statement parsing is limited to CSV for RC1. XLSX remains accepted
// as review evidence by the upload boundary, but is not opened by the API until
// a maintained parser can replace the vulnerable SheetJS npm release.
export const BANK_STATEMENT_PARSER_LIMITS = {
  maxInputBytes: 20 * 1024 * 1024,
  maxCsvCharacters: 20 * 1024 * 1024,
  maxRows: 100_000,
  maxPdfPages: 10_000,
  maxPdfOutputBytes: 50 * 1024 * 1024,
  pdfTimeoutMs: 15_000,
} as const;
type Direction = "deposit" | "withdrawal";
export type ParserErrorKind = "extraction" | "format" | "row_parsing";
export type ParsedStatementRow = { postedDate: string; description: string; amount: string; direction: Direction; runningBalance: string | null; reference: string | null; sourcePage: number | null; sourceLine: number; sourceRegion: string; originalValue: Record<string, unknown>; evidenceFingerprint: string };
export type ParsedStatement = {
  rows: ParsedStatementRow[];
  errors: string[];
  errorKind: ParserErrorKind | null;
  openingBalance: string | null;
  closingBalance: string | null;
  totalDeposits: string | null;
  totalWithdrawals: string | null;
  accountLastFour: string | null;
  statementStart: string | null;
  statementEnd: string | null;
};

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
function shortDate(value: unknown, year: number | null): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (!match || !year) return null;
  return date(`${year}-${match[1]}-${match[2]}`);
}
function emptyStatement(): ParsedStatement {
  return {
    rows: [],
    errors: [],
    errorKind: null,
    openingBalance: null,
    closingBalance: null,
    totalDeposits: null,
    totalWithdrawals: null,
    accountLastFour: null,
    statementStart: null,
    statementEnd: null,
  };
}
function parseRows(matrix: unknown[][]): ParsedStatement {
  const empty = emptyStatement();
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
  if (headerRow < 0) return { ...empty, errors: ["Could not find unambiguous date and description headers."], errorKind: "format" };
  const headers = matrix[headerRow].map(header); const dateIndex = find(headers, "date"); const descIndex = find(headers, "description");
  const amountIndex = find(headers, "amount"); const debitIndex = find(headers, "debit"); const creditIndex = find(headers, "credit");
  if (amountIndex < 0 && debitIndex < 0 && creditIndex < 0) return { ...empty, errors: ["Could not find an amount, debit, or credit header."], errorKind: "format" };
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
  return { ...empty, rows, errorKind: empty.errors.length ? "row_parsing" : null };
}
function distinguishRepeatedRows(parsed: ParsedStatement): ParsedStatement {
  const occurrences = new Map<string, number>();
  return {
    ...parsed,
    rows: parsed.rows.map((row) => {
      const occurrence = (occurrences.get(row.evidenceFingerprint) ?? 0) + 1;
      occurrences.set(row.evidenceFingerprint, occurrence);
      return {
        ...row,
        evidenceFingerprint: createHash("sha256").update(`${row.evidenceFingerprint}:${occurrence}`).digest("hex"),
      };
    }),
  };
}
async function pdfText(bytes: Buffer) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("pdftotext", ["-layout", "-", "-"]); const output: Buffer[] = []; const errors: Buffer[] = [];
    let outputBytes = 0;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("PDF text extraction exceeded the resource limit"));
    }, BANK_STATEMENT_PARSER_LIMITS.pdfTimeoutMs);
    const append = (target: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > BANK_STATEMENT_PARSER_LIMITS.maxPdfOutputBytes) {
        child.kill("SIGKILL");
        reject(new Error("PDF text extraction exceeded the resource limit"));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", (chunk: Buffer) => append(output, chunk)); child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timeout);
      code === 0 ? resolve(Buffer.concat(output).toString("utf8")) : reject(new Error(Buffer.concat(errors).toString("utf8")));
    });
    child.stdin.end(bytes);
  });
}
function parseWellsFargoStatement(text: string): ParsedStatement {
  const result = emptyStatement();
  const pages = text.split("\f");
  if (pages.length > BANK_STATEMENT_PARSER_LIMITS.maxPdfPages) return { ...result, errors: ["PDF contains too many pages for safe parsing; manual review is required."], errorKind: "format" };
  const yearMatch = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(\d{4})/i)
    ?? text.match(/\b\d{1,2}[/-]\d{1,2}[/-](\d{4})\b/);
  const statementYear = yearMatch ? Number(yearMatch[1]) : null;
  const accountMatch = text.match(/account\s+number:\s*(?:X+|\*+)?(\d{4,})\b/i);
  result.accountLastFour = accountMatch ? accountMatch[1].slice(-4) : null;
  const startMatch = text.match(/beginning\s+balance\s+on\s+(\d{1,2}[/-]\d{1,2})/i);
  const endMatch = text.match(/ending\s+balance\s+on\s+(\d{1,2}[/-]\d{1,2})/i);
  result.statementStart = shortDate(startMatch?.[1], statementYear);
  result.statementEnd = shortDate(endMatch?.[1], statementYear);

  const summaryMoney = (pattern: RegExp) => {
    const match = text.match(pattern);
    return match ? cents(match[1].replace(/\s+/g, ""))?.replace(/^-/, "") ?? null : null;
  };
  result.openingBalance = summaryMoney(/^\s*Beginning\s+balance\s+on\s+\d{1,2}[/-]\d{1,2}\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/im);
  result.totalDeposits = summaryMoney(/^\s*Deposits\/Additions\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/im);
  result.totalWithdrawals = summaryMoney(/^\s*Withdrawals\/Subtractions\s+-?\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/im);
  result.closingBalance = summaryMoney(/^\s*Ending\s+balance\s+on\s+\d{1,2}[/-]\d{1,2}\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/im);
  const totalsMatch = text.match(/^\s*Totals\s+\$?\s*([\d,]+(?:\.\d{1,2})?)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/im);
  if (totalsMatch) {
    result.totalDeposits ??= cents(totalsMatch[1]);
    result.totalWithdrawals ??= cents(totalsMatch[2]);
  }

  let transactionHeaderPages = 0;
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => /\bdate\b/i.test(line) && /\bdescription\b/i.test(line) && /\badditions\b/i.test(line) && /\bsubtractions\b/i.test(line) && /\bbalance\b/i.test(line));
    if (headerIndex < 0) continue;
    transactionHeaderPages += 1;
    const headerLine = lines[headerIndex].toLowerCase();
    const descriptionStart = headerLine.indexOf("description");
    const additionsStart = headerLine.indexOf("additions");
    const subtractionsStart = headerLine.indexOf("subtractions");
    const balanceStart = headerLine.lastIndexOf("balance");
    const numberStart = headerLine.indexOf("number");
    const additionsBoundary = (additionsStart + subtractionsStart) / 2;
    const withdrawalsBoundary = (subtractionsStart + balanceStart) / 2;
    if (descriptionStart < 0 || additionsStart <= descriptionStart || subtractionsStart <= additionsStart || balanceStart <= subtractionsStart) {
      result.errors.push(`Page ${page + 1} has an ambiguous Wells Fargo activity header layout.`);
      result.errorKind = "format";
      continue;
    }
    let pending: {
      postedDate: string;
      description: string;
      amount: string;
      direction: Direction;
      runningBalance: string | null;
      reference: string | null;
      sourceLine: number;
      rawLines: string[];
    } | null = null;
    const flush = () => {
      if (!pending) return;
      const description = pending.description.replace(/\s+/g, " ").trim();
      if (!description) {
        result.errors.push(`Page ${page + 1}, line ${pending.sourceLine} is missing a transaction description.`);
        result.errorKind = "row_parsing";
      } else {
        const raw = pending.rawLines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join(" ");
        const originalValue = { text: raw, page: page + 1, line: pending.sourceLine, layout: "wells_fargo_activity", reference: pending.reference };
        result.rows.push({
          postedDate: pending.postedDate,
          description,
          amount: pending.amount,
          direction: pending.direction,
          runningBalance: pending.runningBalance,
          reference: pending.reference,
          sourcePage: page + 1,
          sourceLine: pending.sourceLine,
          sourceRegion: `page:${page + 1};line:${pending.sourceLine}`,
          originalValue,
          evidenceFingerprint: createHash("sha256").update(JSON.stringify([pending.postedDate, description.toLowerCase(), pending.amount, pending.direction, pending.reference ?? ""])).digest("hex"),
        });
      }
      pending = null;
    };
    for (let lineIndex = headerIndex + 1; lineIndex < lines.length; lineIndex += 1) {
      const sourceLine = lines[lineIndex];
      if (/^\s*Totals\b/i.test(sourceLine) || /^\s*(?:Monthly service fee summary|The Ending Daily Balance)\b/i.test(sourceLine)) {
        flush();
        break;
      }
      const dateMatch = sourceLine.match(/^\s*(\d{1,2}[/-]\d{1,2})\s+/);
      if (!dateMatch) {
        if (pending && sourceLine.trim() && !/^\s*(?:Transaction History|September \d{1,2}, \d{4}\s+Page)\b/i.test(sourceLine)) {
          pending.description += ` ${sourceLine.slice(descriptionStart).trim()}`;
          pending.rawLines.push(sourceLine);
        }
        continue;
      }
      flush();
      const postedDate = shortDate(dateMatch[1], statementYear);
      const moneyMatches = [...sourceLine.matchAll(/\$?[\d,]+\.\d{1,2}/g)].map((match) => ({
        value: cents(match[0]),
        start: match.index ?? -1,
      })).filter((match): match is { value: string; start: number } => Boolean(match.value));
      const additionsMatch = moneyMatches.find((match) => match.start < additionsBoundary);
      const subtractionsMatch = moneyMatches.find((match) => match.start >= additionsBoundary && match.start < withdrawalsBoundary);
      const balanceMatch = moneyMatches.find((match) => match.start >= withdrawalsBoundary);
      const additions = additionsMatch?.value ?? null;
      const subtractions = subtractionsMatch?.value ?? null;
      const runningBalance = balanceMatch?.value ?? null;
      const descriptionEnd = moneyMatches[0]?.start ?? additionsStart;
      const description = sourceLine.slice(descriptionStart, descriptionEnd).trim();
      const reference = numberStart >= 0 && numberStart < descriptionStart ? sourceLine.slice(numberStart, descriptionStart).trim() || null : null;
      if (!postedDate || (!additions && !subtractions) || (additions && subtractions) || !description) {
        result.errors.push(`Page ${page + 1}, line ${lineIndex + 1} has an invalid Wells Fargo transaction row.`);
        result.errorKind = "row_parsing";
        continue;
      }
      pending = {
        postedDate,
        description,
        amount: (additions ?? subtractions)!,
        direction: additions ? "deposit" : "withdrawal",
        runningBalance,
        reference,
        sourceLine: lineIndex + 1,
        rawLines: [sourceLine],
      };
    }
    flush();
  }
  if (!transactionHeaderPages) {
    result.errors.push("PDF is missing an unambiguous Wells Fargo transaction history header; manual review is required.");
    result.errorKind = "format";
  }
  if (result.errors.length) result.rows = [];
  if (!result.rows.length && !result.errors.length) {
    result.errors.push("No unambiguous transaction rows were found in the PDF.");
    result.errorKind = "row_parsing";
  }
  return result;
}
function pdfStatement(text: string): ParsedStatement {
  if (/statement\s+period\s+activity\s+summary/i.test(text) && /deposits\//i.test(text) && /additions/i.test(text) && /withdrawals\//i.test(text) && /subtractions/i.test(text) && /ending\s+daily/i.test(text)) {
    return parseWellsFargoStatement(text);
  }
  const result = emptyStatement();
  const pages = text.split("\f");
  if (pages.length > BANK_STATEMENT_PARSER_LIMITS.maxPdfPages) return { ...result, errors: ["PDF contains too many pages for safe parsing; manual review is required."], errorKind: "format" };
  const hasIdentifier = /(?:account|statement\s*period|from\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}\s+(?:to|through)\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4})/i.test(text);
  if (!hasIdentifier) return { ...result, errors: ["PDF is missing a statement period or account identifier; manual review is required."], errorKind: "format" };
  for (let page = 0; page < pages.length; page += 1) {
    const lines = pages[page].split(/\r?\n/); const headerLine = lines.find((line) => /\bdate\b/i.test(line) && /\b(?:description|details|memo)\b/i.test(line) && /\b(?:amount|debit|credit)\b/i.test(line));
    if (!headerLine) {
      if (lines.some((line) => /\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line))) {
        result.errors.push(`Page ${page + 1} has transaction-like text without an unambiguous column header.`);
        result.errorKind = "format";
      }
      continue;
    }
    const debitCredit = /\bdebit\b/i.test(headerLine) && /\bcredit\b/i.test(headerLine);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const sourceLine = lines[lineIndex];
      if (debitCredit) {
        const normalizedHeader = headerLine.toLowerCase();
        const debitStart = normalizedHeader.indexOf("debit");
        const creditStart = normalizedHeader.indexOf("credit");
        const balanceStart = normalizedHeader.indexOf("balance");
        if (debitStart < 0 || creditStart <= debitStart || balanceStart <= creditStart) {
          result.errors.push(`Page ${page + 1} has an ambiguous debit/credit header layout.`);
          continue;
        }
        const dateMatch = sourceLine.match(/^\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+/);
        if (!dateMatch) continue;
        const moneyMatches = [...sourceLine.matchAll(/(?:-|\()?\$?[\d,]+\.\d{1,2}\)?/g)];
        if (moneyMatches.length !== 2) {
          result.errors.push(`Page ${page + 1}, line ${lineIndex + 1} has an ambiguous debit/credit amount.`);
          continue;
        }
        const [transactionMatch, balanceMatch] = moneyMatches;
        const transactionColumn = transactionMatch.index ?? -1;
        const debitDistance = Math.abs(transactionColumn - debitStart);
        const creditDistance = Math.abs(transactionColumn - creditStart);
        if (debitDistance === creditDistance || transactionColumn >= balanceStart) {
          result.errors.push(`Page ${page + 1}, line ${lineIndex + 1} has an ambiguous debit/credit column.`);
          continue;
        }
        const postedDate = date(dateMatch[1]);
        if (!postedDate) continue;
        const direction: Direction = debitDistance < creditDistance ? "withdrawal" : "deposit";
        const amount = cents(transactionMatch[0])!.replace(/^-/, "");
        const runningBalance = cents(balanceMatch[0]);
        const description = sourceLine.slice(dateMatch[0].length, transactionColumn).trim();
        if (!description) {
          result.errors.push(`Page ${page + 1}, line ${lineIndex + 1} is missing a transaction description.`);
          continue;
        }
        const raw = sourceLine.replace(/\s+/g, " ").trim();
        result.rows.push({ postedDate, description, amount, direction, runningBalance, reference: null, sourcePage: page + 1, sourceLine: lineIndex + 1, sourceRegion: `page:${page + 1};line:${lineIndex + 1}`, originalValue: { text: raw, page: page + 1, line: lineIndex + 1, layout: "debit_credit" }, evidenceFingerprint: createHash("sha256").update(JSON.stringify([postedDate, description.toLowerCase(), amount, direction])).digest("hex") });
        continue;
      }
      const raw = sourceLine.replace(/\s+/g, " ").trim();
      const match = raw.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\s+(.+?)\s+((?:-|\()?\$?[\d,]+(?:\.\d{1,2})?\)?)(?:\s+((?:-|\()?\$?[\d,]+(?:\.\d{1,2})?\)?))?(?:\s+((?:-|\()?\$?[\d,]+(?:\.\d{1,2})?\)?))?$/);
      if (!match) continue;
      const postedDate = date(match[1]); const description = match[2]; const first = cents(match[3]); const second = cents(match[4]); const third = cents(match[5]);
      if (!postedDate || !first || !description || (second !== null && third !== null)) { result.errors.push(`Page ${page + 1}, line ${lineIndex + 1} has an ambiguous transaction layout.`); continue; }
      const direction: Direction = first.startsWith("-") ? "withdrawal" : "deposit";
      const amount = first.replace(/^-/, "");
      const runningBalance = second;
      const originalValue = { text: raw, page: page + 1, line: lineIndex + 1, layout: "signed_amount" };
      result.rows.push({ postedDate, description, amount, direction, runningBalance, reference: null, sourcePage: page + 1, sourceLine: lineIndex + 1, sourceRegion: `page:${page + 1};line:${lineIndex + 1}`, originalValue, evidenceFingerprint: createHash("sha256").update(JSON.stringify([postedDate, description.toLowerCase(), amount, direction])).digest("hex") });
    }
  }
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(opening|closing)\s+(?:available\s+)?balance\s+\$?([\d,]+(?:\.\d{1,2})?)/i); if (match) { if (match[1].toLowerCase() === "opening") result.openingBalance = cents(match[2]); else result.closingBalance = cents(match[2]); }
    const total = line.match(/^\s*total\s+(deposits?|credits?|withdrawals?|debits?)\s+\$?([\d,]+(?:\.\d{1,2})?)/i); if (total) { if (/deposit|credit/i.test(total[1])) result.totalDeposits = cents(total[2]); else result.totalWithdrawals = cents(total[2]); }
  }
  if (result.errors.length) result.rows = [];
  if (result.errors.length) result.errorKind ??= "row_parsing";
  if (!result.rows.length && !result.errors.length) {
    result.errors.push("No unambiguous transaction rows were found in the PDF.");
    result.errorKind = "row_parsing";
  }
  return result;
}
export async function parseBankStatement(bytes: Buffer, contentType: string): Promise<ParsedStatement> {
  if (bytes.length > BANK_STATEMENT_PARSER_LIMITS.maxInputBytes) return { ...emptyStatement(), errors: ["Statement exceeds the safe parser size limit."], errorKind: "format" };
  if (contentType === "application/pdf") {
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return { ...emptyStatement(), errors: ["File is not a valid PDF bank statement."], errorKind: "extraction" };
    try { return distinguishRepeatedRows(pdfStatement(await pdfText(bytes))); } catch { return { ...emptyStatement(), errors: ["PDF text extraction failed; encrypted, image-only, or corrupt statements require manual review."], errorKind: "extraction" }; }
  }
  if (contentType !== "text/csv") {
    return {
      ...emptyStatement(),
      errors: ["XLSX parsing is disabled for RC1 security hardening; upload CSV or PDF, or complete manual review."],
      errorKind: "format",
    };
  }
  try {
    return distinguishRepeatedRows(parseRows(csvMatrix(bytes.toString("utf8"))));
  } catch {
    return { ...emptyStatement(), errors: ["Statement file could not be parsed as structured CSV."], errorKind: "row_parsing" };
  }
}
function csvMatrix(text: string): string[][] {
  if (text.length > BANK_STATEMENT_PARSER_LIMITS.maxCsvCharacters) throw new Error("CSV exceeds the safe parser size limit");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "\"") { if (quoted && text[i + 1] === "\"") { cell += char; i += 1; } else quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (rows.length >= BANK_STATEMENT_PARSER_LIMITS.maxRows) throw new Error("CSV contains too many rows"); if (char === "\r" && text[i + 1] === "\n") i += 1; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("Unterminated CSV quoted value");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}