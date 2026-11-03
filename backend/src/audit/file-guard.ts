/**
 * Decides what an uploaded file really is and whether it's safe to open, before any parser sees it.
 *
 * - The type comes from the file's bytes (magic numbers), never from its name or the browser's
 *   MIME type, which an attacker controls. A name only breaks ties between text formats.
 * - Office files are ZIP archives. Their central directory is read without decompressing anything,
 *   and the file is refused if it would expand too far (zip bomb), has too many entries, carries
 *   macros, or isn't the workbook or document it claims to be.
 * - Text must be valid UTF-8 with no NUL bytes. Control characters and chat-template tokens a model
 *   might treat as instructions are stripped.
 * - Cell text that would run as a spreadsheet formula (=, +, @ at the start) is neutralised.
 * - Text that tries to instruct the AI is detected and reported to the user as a finding.
 *
 * Pure functions: no I/O, nothing stored.
 */

export type FileKind = "pdf" | "xlsx" | "docx" | "image" | "csv" | "ofx" | "qif" | "json" | "text";
export type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export type Sniffed = { kind: FileKind; image?: ImageType };

export class UnsafeFileError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Office archives may not expand past this, whatever the compressed size. */
export const MAX_UNZIPPED_BYTES = 40 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 2000;
/** Real XML compresses about 10-30x; bombs go far beyond. */
const MAX_COMPRESSION_RATIO = 200;

const startsWith = (b: Buffer, bytes: number[], offset = 0) => bytes.every((v, i) => b[offset + i] === v);
const ascii = (b: Buffer, start: number, end: number) => b.subarray(start, end).toString("latin1");

type ZipEntry = { name: string; compressed: number; uncompressed: number; encrypted: boolean };

/** Reads a ZIP's central directory. Nothing is inflated. */
export function zipEntries(buf: Buffer): ZipEntry[] {
  // End of central directory: signature 0x06054b50, within the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new UnsafeFileError("That file looks like an Office document but its archive is damaged.", "unreadable_file");
  const count = buf.readUInt16LE(eocd + 10);
  const offset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || offset === 0xffffffff) throw new UnsafeFileError("ZIP64 archives aren't accepted. Save the file again and retry.", "unsupported_file");
  if (count > MAX_ZIP_ENTRIES) throw new UnsafeFileError("That file has too many parts to be a normal document.", "unsafe_file");

  const entries: ZipEntry[] = [];
  let p = offset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new UnsafeFileError("That file looks like an Office document but its archive is damaged.", "unreadable_file");
    }
    const flags = buf.readUInt16LE(p + 8);
    const compressed = buf.readUInt32LE(p + 20);
    const uncompressed = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    entries.push({ name, compressed, uncompressed, encrypted: (flags & 1) === 1 });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Refuses archives that would blow up memory, hide macros or aren't what they claim. */
export function checkOfficeArchive(buf: Buffer): "xlsx" | "docx" {
  const entries = zipEntries(buf);
  const names = new Set(entries.map((e) => e.name));
  let total = 0;
  for (const e of entries) {
    if (e.encrypted) throw new UnsafeFileError("That file is password-protected. Remove the password and try again.", "unreadable_file");
    total += e.uncompressed;
    if (e.compressed > 0 && e.uncompressed / e.compressed > MAX_COMPRESSION_RATIO && e.uncompressed > 1024 * 1024) {
      throw new UnsafeFileError("That file expands far more than a real document would, so it wasn't opened.", "unsafe_file");
    }
  }
  if (total > MAX_UNZIPPED_BYTES) throw new UnsafeFileError("That file is too large once unpacked. Split it or export a CSV.", "unsafe_file");
  if ([...names].some((n) => /vbaProject\.bin$|\/activeX\//i.test(n))) {
    throw new UnsafeFileError("That file contains macros or ActiveX controls, so it wasn't opened. Save it as a plain .xlsx or .docx.", "unsafe_file");
  }
  if (!names.has("[Content_Types].xml")) throw new UnsafeFileError("That file isn't a valid Office document.", "unsupported_file");
  if (names.has("xl/workbook.xml")) return "xlsx";
  if (names.has("word/document.xml")) return "docx";
  throw new UnsafeFileError("Only Excel workbooks (.xlsx) and Word documents (.docx) are accepted from Office.", "unsupported_file");
}

function isUtf8Text(buf: Buffer) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/** What the file really is, from its bytes. Throws UnsafeFileError for anything else. */
export function sniff(buf: Buffer, filename: string): Sniffed {
  const name = filename.toLowerCase();
  if (buf.length === 0) throw new UnsafeFileError(`${filename} is empty.`, "unreadable_file");

  if (ascii(buf, 0, 5) === "%PDF-") return { kind: "pdf" };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return { kind: checkOfficeArchive(buf) };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "image", image: "image/png" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: "image", image: "image/jpeg" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return { kind: "image", image: "image/webp" };
  if (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a") return { kind: "image", image: "image/gif" };

  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new UnsafeFileError(`${filename} is an old Office format (.xls/.doc) or a password-protected file. Save it as .xlsx, .docx or CSV.`, "unsupported_file");
  }
  if (ascii(buf, 4, 8) === "ftyp" && /heic|heix|mif1|avif/.test(ascii(buf, 8, 12))) {
    throw new UnsafeFileError(`${filename} is a HEIC/AVIF photo. Export it as JPG or PNG and try again.`, "unsupported_file");
  }

  // Strip a UTF-8 or UTF-16 byte order mark before the text checks.
  const body = startsWith(buf, [0xef, 0xbb, 0xbf]) ? buf.subarray(3) : buf;
  if (startsWith(buf, [0xff, 0xfe]) || startsWith(buf, [0xfe, 0xff])) {
    throw new UnsafeFileError(`${filename} is UTF-16 text. Save it as UTF-8 and try again.`, "unsupported_file");
  }
  if (!isUtf8Text(body)) throw new UnsafeFileError(`${filename} isn't a file type the auditor reads.`, "unsupported_file");

  const head = body.subarray(0, 4096).toString("utf8");
  if (/<OFX>|OFXHEADER:/i.test(head) || /\.(ofx|qfx)$/.test(name)) return { kind: "ofx" };
  if (/^\s*!Type:/im.test(head) || name.endsWith(".qif")) return { kind: "qif" };
  if (name.endsWith(".json") || /^\s*[[{]/.test(head)) {
    try {
      JSON.parse(body.toString("utf8"));
      return { kind: "json" };
    } catch {
      /* not JSON after all: read as text */
    }
  }
  if (/\.(csv|tsv)$/.test(name)) return { kind: "csv" };
  return { kind: "text" };
}

/** Chat-template and reasoning tokens that could make text look like part of the conversation. */
const TEMPLATE_TOKENS = /<\|[^|>]{1,40}\|>|<\/?(think|system|assistant|user|tool_call|tool_response)>|\[\/?INST\]|<<\/?SYS>>/gi;

/** Plain text fit to put in a prompt: no control characters or chat-template tokens. */
export function cleanText(text: string, maxChars: number) {
  return text
    .normalize("NFKC")
    .replace(TEMPLATE_TOKENS, " ")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .slice(0, maxChars);
}

/** A description or cell value with spreadsheet-formula triggers removed and its length capped. */
export function cleanCell(value: string, maxChars = 200) {
  return cleanText(value, maxChars * 2)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[=+@\t\r]+/, "")
    .trim()
    .slice(0, maxChars);
}

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your|the)\b[^.\n]{0,20}\b(instructions?|prompts?|rules?|directions?)\b/i,
  /\b(you are now|act as|pretend to be|new instructions?|system prompt|developer mode|jailbreak)\b/i,
  /\b(do not|don't|never)\s+(flag|report|mention|list)\b/i,
  /\b(mark|report|treat)\b[^.\n]{0,30}\b(as|is)\s+(normal|safe|legitimate|fine|approved)\b[^.\n]{0,30}\b(ai|assistant|model|auditor)\b/i,
  /\b(ai|assistant|model|auditor|llm|chatbot)\s*[:,-]\s*(please\s+)?(ignore|approve|skip|report|say|output|respond)\b/i,
];

/** Lines in a document that try to instruct the auditor. Returned verbatim (shortened) for the report. */
export function findInjection(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split(/\n/)) {
    if (INJECTION_PATTERNS.some((p) => p.test(line))) hits.push(line.trim().slice(0, 160));
    if (hits.length >= 3) break;
  }
  return hits;
}
