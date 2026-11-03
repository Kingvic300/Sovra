/**
 * Readers for the statement formats the auditor accepts besides CSV and PDF. Each one returns plain
 * rows or plain text; none evaluates formulas, follows links or runs embedded code. Nothing stored.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { worksheetRows } from "../transactions/statement-reader.service.js";
import { cleanCell } from "./file-guard.js";

export type PlainRow = { date: string; description: string; amount: number };

const iso = (y: string, m: string, d: string) => {
  const date = `${y.padStart(4, "20")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date) ? date : null;
};

const toAmount = (raw: string) => {
  const n = Number(raw.replace(/[,\s]/g, ""));
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? Math.round(n * 100) / 100 : null;
};

/** OFX / QFX (SGML or XML flavour): every <STMTTRN> with its date, amount and payee. */
export function parseOfx(text: string): PlainRow[] {
  const rows: PlainRow[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const field = (block: string, tag: string) => block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
  for (const block of blocks.slice(0, 5000)) {
    const posted = field(block, "DTPOSTED");
    const date = posted.length >= 8 ? iso(posted.slice(0, 4), posted.slice(4, 6), posted.slice(6, 8)) : null;
    const amount = toAmount(field(block, "TRNAMT"));
    const description = cleanCell(field(block, "NAME") || field(block, "MEMO") || field(block, "PAYEE"));
    if (date && amount !== null && amount !== 0 && description) rows.push({ date, description, amount });
  }
  return rows;
}

/** QIF: records end with "^"; D date, T (or U) amount, P payee, M memo. */
export function parseQif(text: string, dateOrder: "dmy" | "mdy" = "mdy"): PlainRow[] {
  const rows: PlainRow[] = [];
  let cur: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("!")) continue;
    if (line === "^") {
      const m = (cur.D ?? "").match(/^(\d{1,2})[/.-](\d{1,2})['/.-]\s?(\d{2,4})$/);
      const date = m ? (dateOrder === "mdy" ? iso(m[3], m[1], m[2]) : iso(m[3], m[2], m[1])) : null;
      const amount = toAmount(cur.T ?? cur.U ?? "");
      const description = cleanCell(cur.P || cur.M || "");
      if (date && amount !== null && amount !== 0 && description) rows.push({ date, description, amount });
      cur = {};
      if (rows.length >= 5000) break;
      continue;
    }
    cur[line[0]] = line.slice(1);
  }
  return rows;
}

/** Word .docx: the text of every paragraph and table cell. Only word/document.xml is inflated. */
export async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>|<w:br\/>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Excel .xlsx: every sheet as rows of text cells. Formulas give their cached result, never the
 * formula; links, macros and external references are ignored.
 */
export async function workbookText(buffer: Buffer, maxRows = 2000): Promise<{ name: string; rows: string[][] }[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.worksheets.map((sheet) => ({
    name: sheet.name,
    rows: worksheetRows(sheet)
      .slice(0, maxRows)
      .map((r) => r.map((c) => cleanCell(c, 120))),
  }));
}
