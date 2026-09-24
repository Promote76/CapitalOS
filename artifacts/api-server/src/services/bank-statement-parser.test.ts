import assert from "node:assert/strict";
import test from "node:test";
import { BANK_STATEMENT_PARSER_LIMITS, parseBankStatement } from "./bank-statement-parser";

function representativePdf(pages: string[]) {
  const objects: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`];
  pages.forEach((page, index) => {
    const pageId = 3 + index * 2; const contentId = pageId + 1;
    const stream = `BT /F1 5 Tf 50 750 Td ${page.split("\n").map((line, lineIndex) => `${lineIndex ? "0 -8 Td " : ""}(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" ")} ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
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

test("parses Wells Fargo Everyday Checking activity tables with wrapped descriptions and summary metadata", async () => {
  const activityHeader = [
    "                         Check                                                                                 Deposits/        Withdrawals/       Ending daily",
    "       Date             Number Description                                                                     Additions         Subtractions          balance",
  ].join("\n");
  const parsed = await parseBankStatement(representativePdf([
    [
      "Wells Fargo Everyday Checking",
      "September 8, 2026 Page 1 of 4",
      "Statement period activity summary                                      Account number: XXXX1259 (primary account)",
      "Beginning balance on 8/10                                                  $0.00",
      "Deposits/Additions                                                      8,705.94",
      "Withdrawals/Subtractions                                              - 7,374.79",
      "Ending balance on 9/8                                                 $1,331.15",
    ].join("\n"),
    [
      "Transaction history",
      activityHeader,
      "       8/12                    Stevens Transpor Comchek DD 260811 2219919089 Wells                               200.00                                 200.00",
      "                               Fargo Bank, NA",
      "       8/14                    Stevens Transpor Comchek DD 260813 2219919089 Wells                              1,340.00                              1,540.00",
      "                               Fargo Bank, NA",
      "       8/17                    Purchase authorized on 08/14 Rouses Market #86 Baton Rouge                                               23.17",
      "                               LA S306227049802082 Card 8843",
    ].join("\n"),
    [
      "Transaction History (continued)",
      activityHeader,
      "       8/18                    Promotion Bonus                                                                    325.00",
      "       8/18                    Purchase authorized on 08/17 Wal-Mart #0839 Baton Rouge LA                                                1.94         1,682.22",
      "                               S356229843299692 Card 8843",
    ].join("\n"),
    [
      "Transaction History (continued)",
      activityHeader,
      "       9/8                     Purchase authorized on 09/07 Pilot #0035 S Bend IN                                                       4.54          1,331.15",
      "                               P000000147271234 Card 8895",
      "      Totals                                                                                                $8,705.94           $7,374.79",
    ].join("\n"),
  ]), "application/pdf");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.errorKind, null);
  assert.equal(parsed.rows.length, 6);
  assert.deepEqual(parsed.rows.slice(0, 3).map((row) => [row.postedDate, row.amount, row.direction, row.runningBalance]), [
    ["2026-08-12", "200.00", "deposit", "200.00"],
    ["2026-08-14", "1340.00", "deposit", "1540.00"],
    ["2026-08-17", "23.17", "withdrawal", null],
  ]);
  assert.match(parsed.rows[0].description, /Fargo Bank, NA/);
  assert.equal(parsed.rows.at(-1)?.runningBalance, "1331.15");
  assert.equal(parsed.openingBalance, "0.00");
  assert.equal(parsed.closingBalance, "1331.15");
  assert.equal(parsed.totalDeposits, "8705.94");
  assert.equal(parsed.totalWithdrawals, "7374.79");
  assert.equal(parsed.accountLastFour, "1259");
  assert.equal(parsed.statementStart, "2026-08-10");
  assert.equal(parsed.statementEnd, "2026-09-08");
});

test("rejects ambiguous amount rows and marks PDF extraction for review", async () => {
  const parsed = await parseBankStatement(Buffer.from("Date,Description,Amount,Debit\n2026-01-01,Test,1.00,1.00"), "text/csv");
  assert.match(parsed.errors[0], /ambiguous/i);
  const extractionFailure = await parseBankStatement(Buffer.from("%PDF-"), "application/pdf");
  assert.match(extractionFailure.errors[0], /extraction failed/i);
  assert.equal(extractionFailure.errorKind, "extraction");
  const formatFailure = await parseBankStatement(representativePdf(["Account 1234 Statement Period 01/01/2026 to 01/31/2026\n2026-01-01 Transaction 1.00"]), "application/pdf");
  assert.equal(formatFailure.errorKind, "format");
  const ambiguousPdf = await parseBankStatement(representativePdf(["Account 1234\nDate Description Amount Balance\n2026-01-02 Ambiguous 10.00 20.00 30.00"]), "application/pdf");
  assert.match(ambiguousPdf.errors[0], /ambiguous transaction layout/i);
  assert.equal(ambiguousPdf.errorKind, "row_parsing");
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

test("assigns Wells Fargo short dates across a December to January statement rollover", async () => {
  const parsed = await parseBankStatement(representativePdf([
    [
      "Wells Fargo Everyday Checking",
      "January 8, 2026 Page 1 of 1",
      "Statement period activity summary                                      Account number: XXXX1259",
      "Beginning balance on 12/10                                                $100.00",
      "Deposits/Additions                                                       25.00",
      "Withdrawals/Subtractions                                              - 10.00",
      "Ending balance on 1/8                                                    $115.00",
      "Transaction history",
      "                         Check                                                                                 Deposits/        Withdrawals/       Ending daily",
      "       Date             Number Description                                                                     Additions         Subtractions          balance",
      "      12/20                    Synthetic deposit                                                                  25.00                                 125.00",
      "        1/3                    Synthetic purchase                                                                                 10.00           115.00",
      "      Totals                                                                                                  $25.00              $10.00",
    ].join("\n"),
  ]), "application/pdf");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.statementStart, "2025-12-10");
  assert.equal(parsed.statementEnd, "2026-01-08");
  assert.deepEqual(parsed.rows.map((row) => row.postedDate), ["2025-12-20", "2026-01-03"]);
});

test("fails closed when Wells Fargo row totals do not reconcile to the statement summary", async () => {
  const parsed = await parseBankStatement(representativePdf([
    [
      "Wells Fargo Everyday Checking",
      "September 8, 2026 Page 1 of 1",
      "Statement period activity summary                                      Account number: XXXX1259",
      "Beginning balance on 8/10                                                 $0.00",
      "Deposits/Additions                                                      200.00",
      "Withdrawals/Subtractions                                               -23.17",
      "Ending balance on 9/8                                                   $176.83",
      "Transaction history",
      "                         Check                                                                                 Deposits/        Withdrawals/       Ending daily",
      "       Date             Number Description                                                                     Additions         Subtractions          balance",
      "       8/12                    Synthetic deposit                                                                  199.99                                 199.99",
      "       8/17                    Synthetic purchase                                                                                 23.17           176.82",
      "      Totals                                                                                                 $200.00              $23.17",
    ].join("\n"),
  ]), "application/pdf");
  assert.equal(parsed.errorKind, "row_parsing");
  assert.match(parsed.errors.join(" "), /do not reconcile/i);
  assert.deepEqual(parsed.rows, []);
});
