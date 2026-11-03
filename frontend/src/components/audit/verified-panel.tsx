import { useState } from "react";
import { BadgeCheck, ChevronDown, CircleAlert, CircleCheck, CircleMinus, CircleX, ShieldAlert } from "lucide-react";
import type { Check, CheckStatus, Verification } from "@/lib/audit";

const SCOPES: { scope: Check["scope"]; title: string; hint: string }[] = [
  { scope: "gateway", title: "NEAR AI gateway (Intel TDX)", hint: "The API server your request passes through runs in a confidential VM." },
  { scope: "model", title: "Model server (Intel TDX)", hint: "The machine serving the model runs in a confidential VM with the attested software." },
  { scope: "gpu", title: "GPU (NVIDIA confidential computing)", hint: "The GPU is genuine and in confidential-computing mode." },
  { scope: "response", title: "Signed answer", hint: "The answer you got was signed by the key that lives inside the attested TEE." },
];

const ICON: Record<CheckStatus, { icon: typeof CircleCheck; className: string; label: string }> = {
  pass: { icon: CircleCheck, className: "text-gain", label: "Passed" },
  warn: { icon: CircleAlert, className: "text-caution", label: "Passed with a warning" },
  fail: { icon: CircleX, className: "text-over", label: "Failed" },
  skipped: { icon: CircleMinus, className: "text-muted", label: "Not run" },
};

const short = (hex?: string | null) => (hex && hex.length > 22 ? `${hex.slice(0, 12)}…${hex.slice(-8)}` : (hex ?? "—"));

export function VerifiedPanel({ verification, pending }: { verification: Verification; pending?: boolean }) {
  const [showDetail, setShowDetail] = useState(false);
  const failed = verification.checks.filter((c) => c.status === "fail").length;
  const passed = verification.checks.filter((c) => c.status === "pass").length;
  const signed = verification.checks.some((c) => c.scope === "response");
  const ok = failed === 0 && verification.checks.length > 0;

  return (
    <section className="rounded-card bg-card p-5 shadow-card" aria-labelledby="verified-title">
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${ok ? "bg-gain-soft text-gain" : "bg-over-soft text-over"}`}>
          {ok ? <BadgeCheck className="size-6" aria-hidden /> : <ShieldAlert className="size-6" aria-hidden />}
        </span>
        <div className="min-w-0">
          <h2 id="verified-title" className="text-lg font-bold">
            {ok ? (signed ? "Verified" : "TEE verified") : "Not verified"}
          </h2>
          <p className="text-[14px] text-muted">
            {ok
              ? signed
                ? `${passed} checks passed. The analysis ran inside an attested TEE and the answer is signed by its key.`
                : `${passed} checks passed. Fresh attestation, no data sent.`
              : `${failed} check${failed === 1 ? "" : "s"} failed.${pending ? "" : " Your files were not sent to the model."}`}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {SCOPES.map(({ scope, title, hint }) => {
          const checks = verification.checks.filter((c) => c.scope === scope);
          if (!checks.length) return null;
          return (
            <div key={scope}>
              <h3 className="text-[14px] font-semibold">{title}</h3>
              <p className="text-[12.5px] text-muted">{hint}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {checks.map((c) => {
                  const { icon: Icon, className, label } = ICON[c.status];
                  return (
                    <li key={c.id} className="flex gap-2 text-[13.5px]">
                      <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} aria-label={label} />
                      <span className="min-w-0">
                        {c.label}
                        {showDetail && <span className="block break-all font-mono text-[11.5px] text-muted">{c.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        aria-expanded={showDetail}
        className="mt-4 inline-flex items-center gap-1 text-[13px] font-semibold text-cobalt hover:underline"
      >
        <ChevronDown className={`size-4 transition-transform ${showDetail ? "rotate-180" : ""}`} aria-hidden />
        {showDetail ? "Hide evidence" : "Show evidence"}
      </button>

      {showDetail && (
        <dl className="mt-3 grid gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[12.5px] sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">Model</dt>
          <dd className="break-all font-mono">{verification.model}</dd>
          <dt className="text-muted">Our nonce</dt>
          <dd className="break-all font-mono" title={verification.nonce}>{short(verification.nonce)}</dd>
          <dt className="text-muted">Attested at</dt>
          <dd>{new Date(verification.attestedAt).toLocaleString()}</dd>
          <dt className="text-muted">TEE signing key</dt>
          <dd className="break-all font-mono">{verification.signingAddress ?? "—"}</dd>
          {verification.chatId && (
            <>
              <dt className="text-muted">Completion</dt>
              <dd className="break-all font-mono">{verification.chatId}</dd>
              <dt className="text-muted">SHA-256 request</dt>
              <dd className="break-all font-mono" title={verification.requestHash}>{short(verification.requestHash)}</dd>
              <dt className="text-muted">SHA-256 response</dt>
              <dd className="break-all font-mono" title={verification.responseHash}>{short(verification.responseHash)}</dd>
            </>
          )}
          {verification.images.length > 0 && (
            <>
              <dt className="text-muted">Attested images</dt>
              <dd className="font-mono">
                <ul>
                  {verification.images.map((i) => (
                    <li key={i} className="break-all">{i.replace(/@sha256:([0-9a-f]{12})[0-9a-f]+/, "@sha256:$1…")}</li>
                  ))}
                </ul>
                <span className="font-sans text-muted">Digests come from the attested compose file. Build provenance isn't checked here.</span>
              </dd>
            </>
          )}
        </dl>
      )}
    </section>
  );
}
