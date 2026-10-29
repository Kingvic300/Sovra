import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { CATEGORIES, type CategoryId } from "@/lib/demo-data";
import { money, shortDate, signedMoney } from "@/lib/format";
import { useToast } from "@/lib/toast-context";

type PreviewRow = { date: string; merchant: string; amount: number; category: CategoryId; learned: boolean };
/** A workbook with several sheets becomes one account per sheet; `accounts` lists them. */
type PreviewAccount = { name: string; total: number; closingBalance: number | null };
type Preview = {
  total: number;
  closingBalance: number | null;
  accounts?: PreviewAccount[];
  rows: PreviewRow[];
  skipped: { line: number; reason: string }[];
};
type Imported = {
  imported: number;
  account: { name: string };
  accounts?: { name: string; imported: number }[];
  categorizedBy: { rules: number; ai: number; keywords: number };
};

/** Statement files the backend reads: CSV as is, the first table in an Excel workbook, a PDF's text through the AI model. */
const ACCEPTED = /\.(csv|xlsx|pdf)$/i;
const ACCEPT_ATTR =
  ".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Sends the statement to the backend. With `preview`, nothing is saved. */
function upload<T>(file: File, preview: boolean) {
  const body = new FormData();
  body.append("file", file);
  return api<T>(`/transactions/import${preview ? "?preview=1" : ""}`, { method: "POST", body });
}

export function CsvDrop() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const toast = useToast();
  const { data, reload } = useAppData();
  const live = data.source === "live";

  function fail(title: string, e: unknown) {
    toast.error({ title, description: e instanceof ApiError ? e.message : "Try again in a moment." });
  }

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!ACCEPTED.test(f.name)) {
      toast.error({
        title: `Sovra can't read ${f.name}`,
        description: "Upload a CSV, Excel (.xlsx) or PDF statement from your bank.",
      });
      return;
    }
    if (/\.pdf$/i.test(f.name) && !live) {
      toast.error({ title: "PDFs need a signed-in account", description: "The demo reads CSV and Excel files. Sign in to import a PDF." });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error({ title: "That file is over 5 MB", description: "Export a shorter date range and try again." });
      return;
    }
    setFile(f);
    setPreview(null);
    if (!live) {
      toast.success({ title: `${f.name} is ready`, description: "Sovra will show a preview before importing." });
      return;
    }
    setBusy(true);
    try {
      setPreview(await upload<Preview>(f, true));
    } catch (e) {
      setFile(null);
      fail(`Couldn't read ${f.name}`, e);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!file) return;
    setBusy(true);
    try {
      const res = await upload<Imported>(file, false);
      await reload();
      const learned = res.categorizedBy.rules;
      toast.success({
        title: `${res.imported} transactions imported`,
        description: `${
          res.accounts && res.accounts.length > 1
            ? `Added ${res.accounts.map((a) => `${a.imported} to ${a.name}`).join(" and ")}.`
            : `Added to ${res.account.name}.`
        }${learned ? ` ${learned} filed by rules Sovra learned from you.` : ""}`,
      });
      setFile(null);
      setPreview(null);
    } catch (e) {
      fail("Couldn't import the statement", e);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setFile(null);
    setPreview(null);
    if (input.current) input.current.value = "";
  }

  if (preview && file) {
    return (
      <div className="rounded-card border border-line px-5 py-5">
        <p>
          <span className="font-semibold">{file.name}</span>: {preview.total} transactions
          {preview.closingBalance !== null && <>, ending balance {money(preview.closingBalance)}</>}.
          {preview.skipped.length > 0 && (
            <span className="text-muted"> {preview.skipped.length} rows skipped because they couldn't be read.</span>
          )}
        </p>
        {preview.accounts && preview.accounts.length > 1 && (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-lg bg-porcelain px-3.5 py-2.5 text-[14px]">
            <li className="text-[13px] font-semibold text-muted">Sovra will create {preview.accounts.length} accounts, one per sheet</li>
            {preview.accounts.map((a) => (
              <li key={a.name} className="flex justify-between gap-3">
                <span className="font-medium">{a.name}</span>
                <span className="text-muted tabular-nums">
                  {a.total} transactions{a.closingBalance !== null && <>, {money(a.closingBalance)}</>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ul className="mt-3 divide-y divide-line text-[14px]">
          {preview.rows.slice(0, 5).map((r, i) => (
            <li key={i} className="grid grid-cols-[52px_1fr_auto] gap-3 py-2">
              <span className="text-muted tabular-nums">{shortDate(r.date)}</span>
              <span className="min-w-0 truncate">
                {r.merchant} <span className="text-muted">{CATEGORIES[r.category]}</span>
                {r.learned && <span className="ml-1.5 text-cobalt">learned</span>}
              </span>
              <span className={`font-semibold tabular-nums ${r.amount > 0 ? "text-gain" : ""}`}>{signedMoney(r.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={confirm} disabled={busy || preview.total === 0}>
            {busy ? "Importing" : `Import ${preview.total} transactions`}
          </Button>
          <Button size="sm" variant="secondary" onClick={cancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void pick(e.dataTransfer.files);
      }}
      className={`flex flex-col items-center rounded-card border-2 border-dashed px-5 py-7 text-center transition-colors ${
        over ? "border-cobalt bg-cobalt-soft" : "border-line"
      }`}
    >
      <Upload className="size-5 text-cobalt" aria-hidden />
      {busy ? (
        <p className="mt-2">
          Reading {file?.name}…
          {file && /\.pdf$/i.test(file.name) && <span className="block text-[13px] text-muted">PDFs can take up to a minute.</span>}
        </p>
      ) : file ? (
        <p className="mt-2">
          <span className="font-semibold">{file.name}</span> is ready. Sovra will match columns and show a preview before importing.
        </p>
      ) : (
        <>
          <p className="mt-2 font-semibold">Drop a bank statement here</p>
          <p className="text-[13px] text-muted">CSV, Excel (.xlsx) or PDF. Date, description and amount are enough.</p>
        </>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="mt-3 text-sm font-semibold text-cobalt hover:underline disabled:opacity-50"
      >
        {file ? "Choose a different file" : "Choose file"}
      </button>
      <input ref={input} type="file" accept={ACCEPT_ATTR} className="sr-only" onChange={(e) => void pick(e.target.files)} />
    </div>
  );
}
