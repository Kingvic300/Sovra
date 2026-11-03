import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bot, Check, Copy, KeyRound, Loader2, ShieldHalf, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClass } from "@/components/ui/field-class";
import { Chip, Field, MoneyInput } from "@/components/ui/form-controls";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { ApiError } from "@/lib/api";
import { useAppData } from "@/lib/app-data";
import { CATEGORIES, type CategoryId } from "@/lib/demo-data";
import { money, shortDate } from "@/lib/format";
import {
  agentSnippet,
  DECISION,
  guardApi,
  type AgentKey,
  type CheckResult,
  type GuardCheck,
  type GuardPolicy,
  type NewKeyInput,
  type Reason,
} from "@/lib/guard";
import { useToast } from "@/lib/toast-context";
import { useTitle } from "@/lib/use-title";

const SPEND_CATEGORIES = (Object.keys(CATEGORIES) as CategoryId[]).filter((c) => c !== "income" && c !== "uncategorized");

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Try again.");

/** Amount input where empty means "no limit". */
function OptionalMoney({ value, onChange, placeholder = "No limit" }: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <input
      className={`${fieldClass} tabular-nums`}
      inputMode="decimal"
      value={value ?? ""}
      placeholder={placeholder}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^0-9.]/g, "");
        onChange(raw === "" ? null : Number(raw) || 0);
      }}
    />
  );
}

const listText = (list: string[]) => list.join("\n");
const parseList = (text: string) =>
  [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))].slice(0, 200);

function ReasonList({ reasons }: { reasons: Reason[] }) {
  const tone = { info: "text-muted", low: "text-muted", medium: "text-caution", high: "text-over" } as const;
  return (
    <ul className="flex flex-col gap-1.5">
      {reasons.map((r, i) => (
        <li key={i} className={`text-[14px] ${tone[r.severity]}`}>
          {r.message}
        </li>
      ))}
    </ul>
  );
}

function DecisionBadge({ decision }: { decision: GuardCheck["decision"] }) {
  const d = DECISION[decision];
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${d.className}`}>{d.label}</span>;
}

function RiskMeter({ risk }: { risk: number }) {
  const tone = risk >= 60 ? "bg-over" : risk >= 25 ? "bg-caution" : "bg-gain";
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted">
      <span>Risk</span>
      <div className="h-2 w-28 rounded-full bg-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={risk} aria-label="Risk">
        <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.max(4, risk)}%` }} />
      </div>
      <span className="font-semibold tabular-nums text-ink">{risk}/100</span>
    </div>
  );
}

function CheckForm({ onChecked }: { onChecked: () => void }) {
  const toast = useToast();
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<CategoryId | "">("");
  const [address, setAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!payee.trim() || !(amount > 0)) return;
    setBusy(true);
    try {
      setResult(
        await guardApi.check({
          payee: payee.trim(),
          amount,
          category: category || undefined,
          payeeAddress: address.trim() || undefined,
          memo: memo.trim() || undefined,
        }),
      );
      onChecked();
    } catch (err) {
      toast.error({ title: "Couldn't check that payment", description: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Check a payment before you send it">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Who you're paying">
          <input className={fieldClass} value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Netflix, a landlord, a shop" maxLength={120} />
        </Field>
        <Field label="Amount">
          <MoneyInput value={amount} onChange={setAmount} placeholder="0.00" />
        </Field>
        <Field label="Category" hint="Lets the guard check your budget.">
          <select className={fieldClass} value={category} onChange={(e) => setCategory(e.target.value as CategoryId | "")}>
            <option value="">Not sure</option>
            {SPEND_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Wallet address (optional)" hint="Checked for address poisoning.">
          <input className={`${fieldClass} font-mono text-[14px]`} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" maxLength={128} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="What they told you it's for (optional)" hint="Paste the message or invoice text. The guard looks for scam language.">
            <textarea className={`${fieldClass} h-20 py-3`} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={500} />
          </Field>
        </div>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" disabled={busy || !payee.trim() || !(amount > 0)}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldHalf className="size-4" aria-hidden />}
            Check payment
          </Button>
        </div>
      </form>

      {result && (
        <div className="mt-5 rounded-xl border border-line p-4" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DecisionBadge decision={result.decision} />
            <RiskMeter risk={result.risk} />
          </div>
          <div className="mt-3">
            <ReasonList reasons={result.reasons} />
          </div>
        </div>
      )}
    </Panel>
  );
}

function RulesPanel({ policy, onSaved }: { policy: GuardPolicy; onSaved: (p: GuardPolicy) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState(policy);
  const [blocked, setBlocked] = useState(listText(policy.blockedPayees));
  const [trusted, setTrusted] = useState(listText(policy.trustedPayees));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof GuardPolicy>(k: K, v: GuardPolicy[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { policy: saved } = await guardApi.savePolicy({ ...draft, blockedPayees: parseList(blocked), trustedPayees: parseList(trusted) });
      onSaved(saved);
      toast.success("Rules saved");
    } catch (err) {
      toast.error({ title: "Couldn't save your rules", description: errorText(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Your rules">
      <form onSubmit={save} className="flex flex-col gap-4">
        <Field label="Ask me first above">
          <OptionalMoney value={draft.approvalAbove} onChange={(v) => set("approvalAbove", v)} placeholder="Never ask" />
        </Field>
        <Field label="Ask before a first payment to someone new above">
          <OptionalMoney value={draft.newPayeeApprovalAbove} onChange={(v) => set("newPayeeApprovalAbove", v)} placeholder="Never ask" />
        </Field>
        <Field label="Never allow one payment above">
          <OptionalMoney value={draft.maxPerPayment} onChange={(v) => set("maxPerPayment", v)} />
        </Field>
        <Field label="Daily limit">
          <OptionalMoney value={draft.dailyLimit} onChange={(v) => set("dailyLimit", v)} />
        </Field>
        <Field label="Always block these payees" hint="One per line. Names or wallet addresses.">
          <textarea className={`${fieldClass} h-20 py-3`} value={blocked} onChange={(e) => setBlocked(e.target.value)} />
        </Field>
        <Field label="Payees you trust" hint="No new-payee or lookalike warnings for these.">
          <textarea className={`${fieldClass} h-20 py-3`} value={trusted} onChange={(e) => setTrusted(e.target.value)} />
        </Field>
        <div>
          <span className="mb-2 block text-[14px] font-semibold">Block whole categories</span>
          <div className="flex flex-wrap gap-2">
            {SPEND_CATEGORIES.map((c) => (
              <Chip
                key={c}
                active={draft.blockedCategories.includes(c)}
                onClick={() =>
                  set("blockedCategories", draft.blockedCategories.includes(c) ? draft.blockedCategories.filter((x) => x !== c) : [...draft.blockedCategories, c])
                }
              >
                {CATEGORIES[c]}
              </Chip>
            ))}
          </div>
        </div>
        <label className="flex items-start gap-3 text-[14px]">
          <input type="checkbox" className="mt-1 size-4 accent-cobalt" checked={draft.respectBudgets} onChange={(e) => set("respectBudgets", e.target.checked)} />
          <span>Ask first when a payment would push a budget over its limit</span>
        </label>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save rules
        </Button>
      </form>
    </Panel>
  );
}

function NewKeyForm({ onCreated }: { onCreated: (key: string) => void }) {
  const toast = useToast();
  const [input, setInput] = useState<NewKeyInput>({ name: "", monthlyAllowance: 0, maxPerPayment: null, categories: [], expiresInDays: 30 });
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!input.name.trim() || !(input.monthlyAllowance > 0)) return;
    setBusy(true);
    try {
      const { key } = await guardApi.createKey({ ...input, name: input.name.trim() });
      onCreated(key);
      setInput({ name: "", monthlyAllowance: 0, maxPerPayment: null, categories: [], expiresInDays: 30 });
    } catch (err) {
      toast.error({ title: "Couldn't create the key", description: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 border-t border-line pt-4">
      <Field label="Agent name">
        <input className={fieldClass} value={input.name} onChange={(e) => setInput({ ...input, name: e.target.value })} placeholder="Bills assistant" maxLength={60} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monthly allowance">
          <MoneyInput value={input.monthlyAllowance} onChange={(v) => setInput({ ...input, monthlyAllowance: v })} placeholder="0" />
        </Field>
        <Field label="Max per payment">
          <OptionalMoney value={input.maxPerPayment} onChange={(v) => setInput({ ...input, maxPerPayment: v })} />
        </Field>
      </div>
      <div>
        <span className="mb-2 block text-[14px] font-semibold">Only these categories</span>
        <div className="flex flex-wrap gap-2">
          {SPEND_CATEGORIES.map((c) => (
            <Chip
              key={c}
              active={input.categories.includes(c)}
              onClick={() =>
                setInput({ ...input, categories: input.categories.includes(c) ? input.categories.filter((x) => x !== c) : [...input.categories, c] })
              }
            >
              {CATEGORIES[c]}
            </Chip>
          ))}
        </div>
        <span className="mt-2 block text-[13px] text-muted">None picked means any category.</span>
      </div>
      <Field label="Expires after">
        <select
          className={fieldClass}
          value={input.expiresInDays ?? ""}
          onChange={(e) => setInput({ ...input, expiresInDays: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="7">7 days</option>
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">1 year</option>
          <option value="">Never</option>
        </select>
      </Field>
      <Button type="submit" disabled={busy || !input.name.trim() || !(input.monthlyAllowance > 0)}>
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
        Create agent key
      </Button>
    </form>
  );
}

function KeysPanel({ keys, today, onChange }: { keys: AgentKey[]; today: string; onChange: () => void }) {
  const toast = useToast();
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const snippet = fresh ? agentSnippet(fresh, window.location.origin) : "";

  async function revoke(k: AgentKey) {
    try {
      await guardApi.revokeKey(k.id);
      toast.success(`${k.name} can no longer check payments`);
      onChange();
    } catch (err) {
      toast.error({ title: "Couldn't revoke the key", description: errorText(err) });
    }
  }

  return (
    <Panel title="Agent keys">
      <p className="text-[14px] text-muted">
        Give an AI agent a key that can only ask the guard, only within the allowance you set, like a NEAR function-call key. It can't read your data or move
        money, and you can revoke it any time.
      </p>

      {fresh && (
        <div className="mt-4 rounded-xl bg-ink p-4 text-white">
          <p className="text-[13px] font-semibold">Copy this key now. Sovra keeps only its hash and can't show it again.</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white/10 p-3 font-mono text-[12px] leading-relaxed whitespace-pre">{snippet}</pre>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(snippet).catch(() => {});
              setCopied(true);
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/90 hover:text-white"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy key and example"}
          </button>
        </div>
      )}

      {keys.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {keys.map((k) => {
            const inactive = k.revokedAt ? "Revoked" : k.expiresAt && k.expiresAt.slice(0, 10) < today ? "Expired" : null;
            return (
              <li key={k.id} className={`py-3 ${inactive ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <Bot className="size-4 text-muted" aria-hidden />
                      {k.name}
                      {inactive && <span className="text-[12px] font-normal text-muted">· {inactive}</span>}
                    </p>
                    <p className="font-mono text-[12px] text-muted">{k.prefix}…</p>
                  </div>
                  {!k.revokedAt && (
                    <button
                      type="button"
                      onClick={() => void revoke(k)}
                      aria-label={`Revoke ${k.name}`}
                      className="grid size-8 place-items-center rounded-full text-muted hover:bg-over-soft hover:text-over"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-track">
                  <div className="h-1.5 rounded-full bg-cobalt" style={{ width: `${Math.min(100, (k.usedThisMonth / k.monthlyAllowance) * 100)}%` }} />
                </div>
                <p className="mt-1 text-[12.5px] text-muted">
                  {money(k.usedThisMonth)} of {money(k.monthlyAllowance)} this month
                  {k.maxPerPayment !== null && ` · max ${money(k.maxPerPayment, { whole: true })} each`}
                  {k.categories.length > 0 && ` · ${k.categories.map((c) => CATEGORIES[c]).join(", ")}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4">
        <NewKeyForm
          onCreated={(key) => {
            setFresh(key);
            setCopied(false);
            onChange();
          }}
        />
      </div>
    </Panel>
  );
}

export default function GuardPage() {
  useTitle("Spending guard");
  const { data } = useAppData();
  const live = data.source === "live";
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof guardApi.overview>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    guardApi
      .overview()
      .then((o) => {
        setOverview(o);
        setError(null);
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, []);

  useEffect(() => {
    if (live) load();
  }, [live, load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Spending guard"
        description="Check a payment before it goes out, and give AI agents a key that can only ask, within limits you set. Sovra never moves money: it says allow, ask first or block."
      />

      {!live ? (
        <Panel>
          <p className="text-muted">Sign in to use the spending guard. It checks payments against your own statement, budgets and rules.</p>
        </Panel>
      ) : error ? (
        <div role="alert" className="rounded-card bg-over-soft p-4 text-over">
          {error}
        </div>
      ) : !overview ? (
        <Panel>
          <p className="flex items-center gap-2 text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading your rules…
          </p>
        </Panel>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[1fr_400px]">
          <div className="flex min-w-0 flex-col gap-5">
            <CheckForm onChecked={load} />
            <Panel
              title="Recent decisions"
              action={overview.agentPaymentsBlocked > 0 && <span className="text-[13px] text-muted">{overview.agentPaymentsBlocked} agent payments blocked</span>}
            >
              {overview.checks.length === 0 ? (
                <p className="text-[14px] text-muted">Nothing checked yet. Payments you or your agents check show up here.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {overview.checks.map((c) => (
                    <li key={c.id} className="py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="min-w-0 font-semibold">
                          {c.payee} <span className="font-normal tabular-nums">{money(c.amount)}</span>
                        </span>
                        <DecisionBadge decision={c.decision} />
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {shortDate(c.createdAt.slice(0, 10))} · {c.agent ? `asked by ${c.agent}` : "checked by you"} · risk {c.risk}
                      </p>
                      {c.decision !== "allow" && (
                        <div className="mt-1.5">
                          <ReasonList reasons={c.reasons.filter((r) => r.severity !== "info")} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <aside className="flex flex-col gap-5">
            <KeysPanel keys={overview.keys} today={data.today} onChange={load} />
            <RulesPanel key={JSON.stringify(overview.policy)} policy={overview.policy} onSaved={(policy) => setOverview({ ...overview, policy })} />
          </aside>
        </div>
      )}
    </div>
  );
}
