import assert from "node:assert/strict";
import test from "node:test";
import { BANK_STATEMENT_PARSER_LIMITS, parseBankStatement } from "./bank-statement-parser";

function representativePdf(pages: string[]) {
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2; const contentId = pageId + 1;
    const stream = `BT /F1 10 Tf 50 750 Td ${page.split("\n").map((line, lineIndex) => `${lineIndex ? "0 -14 Td " : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf); pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test("parses common CSV headers into exact-cent, evidence-only rows", async () => {
  const parsed = await parseBankStatement(Buffer.from([
    "Opening Balance,100.00",
    "Date,Description,Debit,Credit,Running Balance,Reference",
    "2026-01-02,Payroll,,\"1,234.50\",1334.50,ABC",
    "2026-01-03,Groceries,12.5,,1322.00,",
    "Closing Balance,1322.00",
  ].join("\n")), "text/csv");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.openingBalance, "100.00");
  assert.equal(parsed.closingBalance, "1322.00");
  assert.deepEqual(parsed.rows.map((row) => [row.amount, row.direction, row.sourceLine]), [["1234.50", "deposit", 3], ["12.50", "withdrawal", 4]]);
  assert.equal(parsed.rows[0].originalValue.description, "Payroll");
});

test("extracts a generated multi-page layout-safe PDF statement", async () => {
  const parsed = await parseBankStatement(representativePdf([
    "Account Number 1234 Statement Period 01/01/2026 to 01/31/2026\nOpening Balance 100.00\nDate Description Amount Balance\n2026-01-02 Payroll 100.00 200.00\nTotal Deposits 100.00",
    "Date Description Amount Balance\n2026-01-03 Groceries -12.50 187.50\nClosing Balance 187.50\nTotal Withdrawals 12.50",
  ]), "application/pdf");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows.map((row) => [row.sourcePage, row.amount, row.direction]), [[1, "100.00", "deposit"], [2, "12.50", "withdrawal"]]);
  assert.equal(parsed.rows[1].sourceRegion, "page:2;line:2");
  assert.equal(parsed.openingBalance, "100.00"); assert.equal(parsed.closingBalance, "187.50");
  assert.equal(parsed.totalDeposits, "100.00"); assert.equal(parsed.totalWithdrawals, "12.50");
});

test("rejects ambiguous amount rows and marks PDF extraction for review", async () => {
  const parsed = await parseBankStatement(Buffer.from("Date,Description,Amount,Debit\n2026-01-01,Test,1.00,1.00"), "text/csv");
  assert.match(parsed.errors[0], /ambiguous/i);
  assert.match((await parseBankStatement(Buffer.from("%PDF-"), "application/pdf")).errors[0], /extraction failed/i);
  const ambiguousPdf = await parseBankStatement(representativePdf(["Account 1234\nDate Description Amount Balance\n2026-01-02 Ambiguous 10.00 20.00 30.00"]), "application/pdf");
  assert.match(ambiguousPdf.errors[0], /ambiguous transaction layout/i);
  assert.deepEqual(ambiguousPdf.rows, []);
});

test("parses aligned PDF debit and credit columns without confusing the running balance", async () => {
  const header = `${"Date".padEnd(11)}${"Description".padEnd(20)}${"Debit".padEnd(12)}${"Credit".padEnd(12)}Balance`;
  const row = (date: string, description: string, debit: string, credit: string, balance: string) =>
    `${date.padEnd(11)}${description.padEnd(20)}${debit.padEnd(12)}${credit.padEnd(12)}${balance}`;
  const parsed = await parseBankStatement(representativePdf([
    `Account 1234 Statement Period 01/01/2026 to 01/31/2026\n${header}\n${row("2026-01-02", "Groceries", "12.50", "", "87.50")}\n${row("2026-01-03", "Payroll", "", "100.00", "187.50")}`,
  ]), "application/pdf");
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.rows.map((row) => [row.amount, row.direction, row.runningBalance]), [
    ["12.50", "withdrawal", "87.50"],
    ["100.00", "deposit", "187.50"],
  ]);
});

test("distinguishes legitimate repeated rows while keeping fingerprints stable across replays", async () => {
  const bytes = Buffer.from("Date,Description,Amount\n2026-01-01,Coffee,-5.00\n2026-01-01,Coffee,-5.00");
  const first = await parseBankStatement(bytes, "text/csv");
  const replay = await parseBankStatement(bytes, "text/csv");
  assert.notEqual(first.rows[0].evidenceFingerprint, first.rows[1].evidenceFingerprint);
  assert.deepEqual(first.rows.map((row) => row.evidenceFingerprint), replay.rows.map((row) => row.evidenceFingerprint));
});

test("rejects oversized structured evidence before XLSX/CSV parsing", async () => {
  const parsed = await parseBankStatement(
    Buffer.alloc(BANK_STATEMENT_PARSER_LIMITS.maxInputBytes + 1),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.match(parsed.errors[0], /safe parser size limit/i);
  assert.deepEqual(parsed.rows, []);
});

test("keeps vulnerable XLSX parsing disabled for RC1", async () => {
  const parsed = await parseBankStatement(
    Buffer.from("PK\u0003\u0004not-opened-by-the-api"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.deepEqual(parsed.rows, []);
  assert.match(parsed.errors[0], /XLSX parsing is disabled for RC1/i);
});