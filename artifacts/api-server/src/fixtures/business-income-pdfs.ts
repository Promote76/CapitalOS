function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function textStream(lines: string[]) {
  const commands = ["BT", "/F1 10 Tf", "50 760 Td"];
  for (const [index, line] of lines.entries()) {
    if (index > 0) commands.push("0 -16 Td");
    commands.push(`(${escapePdfText(line)}) Tj`);
  }
  commands.push("ET");
  return commands.join("\n");
}

function pdfFromPages(pages: string[][]) {
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  for (const [index, page] of pages.entries()) {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const content = textStream(page);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const chunks = ["%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n"];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join(""), "binary"));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""), "binary");
  chunks.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "binary");
}

export function settlementPdfFixture() {
  return pdfFromPages([
    [
      "Acme Marketplace Provider",
      "Settlement statement period 2026-08-01 through 2026-08-31",
      "Paid date 2026-09-03",
      "Gross earnings $1,250.00",
      "Service revenue $900.00",
      "Subscription revenue $350.00",
    ],
    [
      "Settlement detail",
      "Processor fee $50.00",
      "Withholding tax $200.00",
      "Total deductions $250.00",
      "Net amount paid $1,000.00",
    ],
  ]);
}

export function profitLossPdfFixture() {
  return pdfFromPages([
    [
      "Acme Business Company",
      "Profit and Loss statement period 2026-08-01 through 2026-08-31",
      "Total revenue $2,000.00",
      "Service revenue $1,400.00",
      "Product revenue $600.00",
    ],
    [
      "Operating expenses",
      "Contractor expense $500.00",
      "Software expense $200.00",
      "Total expenses $700.00",
      "Net profit $1,300.00",
    ],
  ]);
}

export function ambiguousSettlementPdfFixture() {
  return pdfFromPages([[
    "Ambiguous Provider",
    "Settlement statement period 2026-08-01 through 2026-08-31",
    "Gross earnings $1,250.00",
    "Gross earnings $1,200.00",
    "Total deductions $250.00",
    "Net amount paid $1,000.00",
  ]]);
}