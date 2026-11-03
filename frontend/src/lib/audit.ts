/** Types and calls for the private expense auditor (backend: /api/audit). */

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";
export type Check = { id: string; scope: "gateway" | "model" | "gpu" | "response"; label: string; status: CheckStatus; detail: string };

export type Verification = {
  verified: boolean;
  model: string;
  nonce: string;
  attestedAt: number;
  signingAddress: string | null;
  checks: Check[];
  images: string[];
  chatId?: string;
  requestHash?: string;
  responseHash?: string;
  signature?: string;
};

export type Severity = "low" | "medium" | "high";
export type AuditRow = {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  source: string;
  category: string;
  kind: "statement" | "receipt";
};
export type AuditResult = {
  model: string;
  rows: AuditRow[];
  totals: { category: string; label: string; spent: number; count: number }[];
  moneyIn: number;
  moneyOut: number;
  flags: { refs: string[]; severity: Severity; title: string; reason: string }[];
  signals: { kind: string; rowIds: string[]; severity: Severity; detail: string }[];
  summary: string;
  files: { name: string; kind: "statement" | "receipt"; rows: number; truncated: boolean }[];
  verification: Verification;
  retention: "none";
};

export type AuditFailure = { message: string; code: string; verification?: Verification };

export const SAMPLE_FILES = [
  { path: "/samples/northwind-checking-oct-2026.csv", label: "Bank statement, October (CSV)" },
  { path: "/samples/northwind-checking-sep-2026.csv", label: "Bank statement, September (CSV)" },
  { path: "/samples/brightwater-card-oct-2026.xlsx", label: "Card statement, October (Excel)" },
  { path: "/samples/receipt-greenleaf-grocers.txt", label: "Grocery receipt (text)" },
  { path: "/samples/receipt-harbor-light-cafe.txt", label: "Restaurant receipt (text)" },
  { path: "/samples/receipt-pixelport-photo.jpg", label: "Online order receipt (photo)" },
];

const TYPES: Record<string, string> = {
  csv: "text/csv",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
};

/** What the picker accepts. The server checks each file's real type from its bytes anyway. */
export const ACCEPT = [
  ".csv,.tsv,.txt,.md,.json,.pdf,.xlsx,.docx,.ofx,.qfx,.qif,.jpg,.jpeg,.png,.webp,.gif",
  "text/*,application/pdf,application/json,image/jpeg,image/png,image/webp,image/gif",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

export async function loadSamples(): Promise<File[]> {
  return Promise.all(
    SAMPLE_FILES.map(async (s) => {
      const res = await fetch(s.path);
      const blob = await res.blob();
      const name = s.path.split("/").pop()!;
      return new File([blob], name, { type: TYPES[name.split(".").pop() ?? ""] ?? blob.type });
    }),
  );
}

async function readError(res: Response): Promise<AuditFailure> {
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string }; verification?: Verification } | null;
  return {
    code: body?.error?.code ?? "http_error",
    message: body?.error?.message ?? (res.status === 429 ? "Too many audits from here. Wait a little and try again." : "The audit failed. Try again."),
    verification: body?.verification,
  };
}

/** Uploads files for one audit. Nothing is saved: the backend returns the result and forgets it. */
export async function runAudit(files: File[]): Promise<{ ok: true; result: AuditResult } | { ok: false; error: AuditFailure }> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  let res: Response;
  try {
    res = await fetch("/api/audit", { method: "POST", body: form, credentials: "omit", cache: "no-store" });
  } catch {
    return { ok: false, error: { code: "network", message: "Can't reach the auditor. Check your connection." } };
  }
  if (!res.ok) return { ok: false, error: await readError(res) };
  return { ok: true, result: (await res.json()) as AuditResult };
}

export async function fetchAttestation(): Promise<{ ok: true; verification: Verification } | { ok: false; error: AuditFailure }> {
  let res: Response;
  try {
    res = await fetch("/api/audit/attestation", { credentials: "omit", cache: "no-store" });
  } catch {
    return { ok: false, error: { code: "network", message: "Can't reach the auditor." } };
  }
  if (!res.ok) return { ok: false, error: await readError(res) };
  return { ok: true, verification: (await res.json()) as Verification };
}

export const amount = (n: number) => Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
