import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import ExcelJS from "exceljs";
import { FakeAi, createTestApp, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

/** A one-page PDF whose text layer holds `lines`; with no lines it has no text, like a scan. */
function pdf(lines: string[]) {
  const text = lines.map((l, i) => `BT /F1 10 Tf 40 ${780 - i * 14} Td (${l.replace(/[()\\]/g, "")}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

async function xlsx() {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Statement");
  sheet.addRow(["First Bank: account statement"]);
  sheet.addRow([]);
  sheet.addRow(["Date", "Description", "Amount", "Balance"]);
  sheet.addRow([new Date(Date.UTC(2026, 9, 1)), "Shoprite", -38.2, 961.8]);
  sheet.addRow([new Date(Date.UTC(2026, 9, 2)), "Upwork payout", 650, 1611.8]);
  return Buffer.from(await book.xlsx.writeBuffer());
}

const form = (data: Buffer, filename: string, type: string) => {
  const f = new FormData();
  f.append("file", new Blob([new Uint8Array(data)], { type }), filename);
  return f;
};
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("statement import from Excel and PDF", () => {
  let database: TestDatabase;
  let api: TestApp;
  const ai = new FakeAi();

  before(async () => {
    database = await createTestDatabase();
    api = await createTestApp({ database, ai });
  });

  after(async () => {
    await api.close();
    await database.close();
  });

  it("reads the table in an Excel workbook, below any title rows", async () => {
    const client = api.client();
    await signIn(client);
    const preview = await client.request("POST", "/transactions/import?preview=1", { form: form(await xlsx(), "oct.xlsx", XLSX) });
    assert.equal(preview.status, 201);
    assert.equal(preview.body.total, 2);
    assert.equal(preview.body.closingBalance, 1611.8);
    assert.deepEqual(
      preview.body.rows.map((r: { date: string; merchant: string; amount: number }) => [r.date, r.merchant, r.amount]),
      [["2026-10-01", "Shoprite", -38.2], ["2026-10-02", "Upwork payout", 650]],
    );

    const saved = await client.request("POST", "/transactions/import", { form: form(await xlsx(), "oct.xlsx", XLSX) });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.imported, 2);
    assert.equal(saved.body.account.name, "oct");
  });

  it("reads a PDF's transactions with the AI model, once for preview and import", async () => {
    const client = api.client();
    await signIn(client);
    ai.statementRows = [
      { date: "2026-10-03", description: "Bolt", amount: -6.2, balance: 500 },
      { date: "2026-10-04", description: "Toptal invoice", amount: 1180, balance: 1680 },
    ];
    const statement = pdf(["Statement for October 2026", "03 Oct  Bolt  -6.20  500.00", "04 Oct  Toptal invoice  1,180.00  1,680.00"]);
    const before = ai.extracted.length;

    const preview = await client.request("POST", "/transactions/import?preview=1", { form: form(statement, "oct.pdf", "application/pdf") });
    assert.equal(preview.status, 201);
    assert.equal(preview.body.total, 2);
    assert.equal(preview.body.closingBalance, 1680);
    assert.match(ai.extracted.at(-1) ?? "", /Toptal invoice/, "the model gets the PDF's text");

    const saved = await client.request("POST", "/transactions/import", { form: form(statement, "oct.pdf", "application/pdf") });
    assert.equal(saved.status, 201);
    assert.equal(saved.body.imported, 2);
    assert.equal(ai.extracted.length, before + 1, "the import reuses the preview's reading");
  });

  it("explains a PDF with no text instead of guessing", async () => {
    const client = api.client();
    await signIn(client);
    const res = await client.request("POST", "/transactions/import?preview=1", { form: form(pdf([]), "scan.pdf", "application/pdf") });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "no_text");
  });

  it("keeps PDFs out of demo accounts, which never call the AI model", async () => {
    const client = api.client();
    await client.post("/auth/demo");
    const res = await client.request("POST", "/transactions/import?preview=1", {
      form: form(pdf(["03 Oct Bolt -6.20"]), "oct.pdf", "application/pdf"),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "pdf_not_in_demo");
  });

  it("refuses other file types", async () => {
    const client = api.client();
    await signIn(client);
    const res = await client.request("POST", "/transactions/import?preview=1", { form: form(Buffer.from("hi"), "notes.docx", "application/msword") });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "unsupported_file");
  });
});
