import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, Flag, FlaskConical, Lock, Loader2, RefreshCw, ShieldCheck, Upload, X } from "lucide-react";
import { VerifiedPanel } from "@/components/audit/verified-panel";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import {
  ACCEPT,
  amount,
  fetchAttestation,
  loadSamples,
  runAudit,
  SAMPLE_FILES,
  type AuditFailure,
  type AuditResult,
  type Severity,
  type Verification,
} from "@/lib/audit";
import { useTitle } from "@/lib/use-title";

const MAX_FILES = 6;

const SEVERITY: Record<Severity, { label: string; className: string }> = {
  high: { label: "High", className: "bg-over-soft text-over" },
  medium: { label: "Medium", className: "bg-caution-soft text-caution" },
  low: { label: "Low", className: "bg-track text-muted" },
};

/** `standalone` is the public route (no app shell), which needs its own page padding. */
export default function AuditPage({ standalone = false }: { standalone?: boolean }) {
  useTitle("Private expense audit");
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [failure, setFailure] = useState<AuditFailure | null>(null);
  const [preflight, setPreflight] = useState<Verification | null>(null);
  const [attesting, setAttesting] = useState(true);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function attest() {
    setAttesting(true);
    const res = await fetchAttestation();
    setAttesting(false);
    if (res.ok) setPreflight(res.verification);
    else setFailure(res.error);
  }

  // Check the TEE as soon as the page opens, before anything is uploaded.
  useEffect(() => {
    let live = true;
    void fetchAttestation().then((res) => {
      if (!live) return;
      setAttesting(false);
      if (res.ok) setPreflight(res.verification);
      else setFailure(res.error);
    });
    return () => {
      live = false;
    };
  }, []);

  function add(list: FileList | File[]) {
    setFiles((prev) => {
      const next = [...prev];
      for (const f of list) if (!next.some((p) => p.name === f.name && p.size === f.size)) next.push(f);
      return next.slice(0, MAX_FILES);
    });
    setResult(null);
    setFailure(null);
  }

  async function addSamples() {
    add(await loadSamples());
  }

  async function run() {
    if (!files.length || running) return;
    setRunning(true);
    setFailure(null);
    setResult(null);
    const res = await runAudit(files);
    setRunning(false);
    if (res.ok) setResult(res.result);
    else setFailure(res.error);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) add(e.dataTransfer.files);
  }

  const verification = result?.verification ?? failure?.verification ?? preflight;
  const flaggedIds = new Set(result?.flags.flatMap((f) => f.refs) ?? []);
  const rowsById = new Map(result?.rows.map((r) => [r.id, r]) ?? []);
  const maxSpent = Math.max(1, ...(result?.totals.map((t) => t.spent) ?? []));

  return (
    <div className={`flex flex-col gap-6 ${standalone ? "px-4 pt-8 pb-16 sm:px-8 lg:px-14 lg:pt-12" : ""}`}>
      <PageHeader
        title="Private expense audit"
        description="Upload receipts or a bank statement. A model running inside a trusted execution environment on NEAR AI Cloud sorts your spending and flags anything unusual, and this page shows the proof."
      />

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${dragging ? "border-cobalt bg-cobalt-soft/50" : "border-line"}`}
            >
              <span className="grid size-11 place-items-center rounded-full bg-cobalt-soft text-cobalt">
                <Upload className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-semibold">Drop statements or receipts here</p>
                <p className="max-w-[56ch] text-[13px] text-muted">
                  Statements as CSV, Excel, PDF, OFX/QFX or QIF. Receipts as a photo (JPG, PNG, WebP), PDF, Word or text. Up to {MAX_FILES} files, 5 MB
                  each. Every file is checked for its real type, macros and hidden instructions before it's read.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="secondary" onClick={() => input.current?.click()}>
                  Choose files
                </Button>
                <Button variant="quiet" onClick={() => void addSamples()}>
                  <FlaskConical className="size-4" aria-hidden />
                  Use fictional samples
                </Button>
              </div>
              <input
                ref={input}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) add(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {files.length > 0 && (
              <ul className="mt-4 flex flex-col divide-y divide-line">
                {files.map((f) => (
                  <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{f.name}</span>
                    <span className="text-[12px] text-muted tabular-nums">{(f.size / 1024).toFixed(1)} KB</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                      className="grid size-8 place-items-center rounded-full text-muted hover:bg-porcelain hover:text-ink"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[13px] text-muted">
                <Lock className="size-3.5" aria-hidden />
                Nothing is saved. The server forgets your files when the answer is sent.
              </p>
              <Button onClick={() => void run()} disabled={!files.length || running}>
                {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
                {running ? "Verifying TEE, then auditing…" : "Audit privately"}
              </Button>
            </div>
          </Panel>

          {failure && (
            <div role="alert" className="rounded-card bg-over-soft p-4 text-[14px] text-over">
              <p className="font-semibold">{failure.code === "attestation_failed" ? "Stopped: the TEE did not verify" : "The audit didn't finish"}</p>
              <p className="mt-1">{failure.message}</p>
            </div>
          )}

          {result && (
            <>
              <Panel title="What the auditor found">
                <p className="text-[15px] leading-relaxed">{result.summary}</p>
                <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-[13px]">
                  <div>
                    <dt className="text-muted">Money out</dt>
                    <dd className="text-lg font-bold tabular-nums">{amount(result.moneyOut)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Money in</dt>
                    <dd className="text-lg font-bold tabular-nums">{amount(result.moneyIn)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Flags</dt>
                    <dd className="text-lg font-bold tabular-nums">{result.flags.length}</dd>
                  </div>
                </dl>
              </Panel>

              {result.flags.length > 0 && (
                <Panel title="Flagged for a look">
                  <ul className="flex flex-col gap-3">
                    {result.flags.map((f, i) => (
                      <li key={i} className="rounded-xl border border-line p-3.5">
                        <div className="flex items-start gap-2">
                          <Flag className="mt-0.5 size-4 shrink-0 text-over" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{f.title}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${SEVERITY[f.severity].className}`}>
                                {SEVERITY[f.severity].label}
                              </span>
                            </div>
                            <p className="mt-1 text-[14px] text-muted">{f.reason}</p>
                            {f.refs.length > 0 && (
                              <ul className="mt-2 flex flex-wrap gap-1.5">
                                {f.refs.map((id) => {
                                  const r = rowsById.get(id);
                                  return r ? (
                                    <li key={id} className="rounded-md bg-porcelain px-2 py-1 font-mono text-[12px]">
                                      {r.date || "no date"} · {r.merchant} · {r.amount < 0 ? "−" : "+"}
                                      {amount(r.amount)}
                                    </li>
                                  ) : null;
                                })}
                              </ul>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              {result.signals.length > 0 && (
                <Panel title="Rule-based checks">
                  <p className="mb-3 text-[13px] text-muted">Found by code before the model saw anything. The model confirms or dismisses them above.</p>
                  <ul className="flex flex-col gap-2">
                    {result.signals.map((sig, i) => (
                      <li key={i} className="flex items-start gap-2 text-[14px]">
                        <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${SEVERITY[sig.severity].className}`}>
                          {SEVERITY[sig.severity].label}
                        </span>
                        <span>{sig.detail}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              )}

              <Panel title="Spending by category">
                <ul className="flex flex-col gap-3">
                  {result.totals.map((t) => (
                    <li key={t.category}>
                      <div className="flex justify-between gap-3 text-[14px]">
                        <span>
                          {t.label} <span className="text-muted">· {t.count}</span>
                        </span>
                        <span className="font-semibold tabular-nums">{amount(t.spent)}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-track">
                        <div className="h-2 rounded-full bg-cobalt" style={{ width: `${(t.spent / maxSpent) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={`Transactions (${result.rows.length})`}>
                <div className="-mx-5 overflow-x-auto px-5">
                  <table className="w-full min-w-[560px] text-left text-[13.5px]">
                    <thead className="text-[12px] text-muted">
                      <tr>
                        <th className="py-2 font-semibold">Date</th>
                        <th className="py-2 font-semibold">Merchant</th>
                        <th className="py-2 font-semibold">Category</th>
                        <th className="py-2 text-right font-semibold">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {result.rows.map((r) => (
                        <tr key={r.id} className={flaggedIds.has(r.id) ? "bg-over-soft/60" : ""}>
                          <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{r.date || "—"}</td>
                          <td className="py-2 pr-3">
                            {r.merchant}
                            {r.kind === "receipt" && <span className="ml-1.5 text-[11.5px] text-muted">receipt</span>}
                            {flaggedIds.has(r.id) && <Flag className="ml-1.5 inline size-3.5 text-over" aria-label="Flagged" />}
                          </td>
                          <td className="py-2 pr-3 text-muted">{r.category}</td>
                          <td className={`py-2 text-right tabular-nums ${r.amount > 0 ? "text-gain" : ""}`}>
                            {r.amount < 0 ? "−" : "+"}
                            {amount(r.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          )}

          {!result && !files.length && (
            <Panel title="No real data? Use the fictional samples">
              <p className="text-[14px] text-muted">
                Two months of a made-up checking account, a credit card statement in Excel, and three made-up receipts, one of them a photo. A few problems
                are planted in them: a double charge, a price rise, fees, an overcharged receipt, a subscription billed twice, and a receipt with hidden
                instructions that try to talk the AI out of flagging it. See if the auditor finds them.
              </p>
              <ul className="mt-3 flex flex-col gap-1 text-[14px]">
                {SAMPLE_FILES.map((s) => (
                  <li key={s.path}>
                    <a href={s.path} download className="font-semibold text-cobalt hover:underline">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-24" aria-label="Proof the analysis ran in a TEE">
          {verification ? (
            <VerifiedPanel verification={verification} pending={!result && !failure?.verification} />
          ) : (
            <Panel>
              <p className="flex items-center gap-2 text-[14px] text-muted">
                {attesting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
                {attesting ? "Checking the TEE with a fresh nonce…" : "No attestation yet."}
              </p>
            </Panel>
          )}
          <Button variant="secondary" onClick={() => void attest()} disabled={attesting || running}>
            <RefreshCw className={`size-4 ${attesting ? "animate-spin" : ""}`} aria-hidden />
            Re-check attestation with a new nonce
          </Button>
          <Panel title="What happens to your files">
            <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13.5px] text-muted">
              <li>The server fetches a fresh attestation and verifies the TEE. If anything fails, it stops and sends nothing.</li>
              <li>Your files are read in memory and sent over TLS to the attested model.</li>
              <li>The signed answer is checked against the attested key and returned to you.</li>
              <li>The server zeroes the uploaded bytes. No database, no logs of content, no copies.</li>
            </ol>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
