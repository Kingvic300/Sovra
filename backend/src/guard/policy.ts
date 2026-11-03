/**
 * Spending guard: decides whether a payment should go ahead before anyone, person or AI agent,
 * sends it. Sovra never moves money; a wallet or agent asks first and acts on the answer.
 *
 * Pure functions only: callers load the history and pass it in, so every rule is testable offline.
 */
import { z } from "zod";
import { CATEGORY_IDS, merchantKey } from "../shared/categories.js";

const money = z.number().min(0).max(1_000_000_000);
const nullableMoney = money.nullable();
const payeeList = z.array(z.string().trim().min(1).max(120)).max(200);

export const PolicyRules = z.object({
  /** Never allow a single payment above this. */
  maxPerPayment: nullableMoney.default(null),
  /** Total approved payments in one day (UTC) may not pass this. */
  dailyLimit: nullableMoney.default(null),
  /** Payments above this need the user's approval. */
  approvalAbove: nullableMoney.default(500),
  /** First payment to someone new needs approval above this. */
  newPayeeApprovalAbove: nullableMoney.default(100),
  /** Payee names or addresses that are always refused. */
  blockedPayees: payeeList.default([]),
  /** Payee names or addresses the user vouches for: no new-payee or lookalike warnings. */
  trustedPayees: payeeList.default([]),
  blockedCategories: z.array(z.enum(CATEGORY_IDS)).max(CATEGORY_IDS.length).default([]),
  /** Ask first when a payment would push a budget over its limit this month. */
  respectBudgets: z.boolean().default(true),
});
export type PolicyRules = z.infer<typeof PolicyRules>;
export const DEFAULT_RULES: PolicyRules = PolicyRules.parse({});

export const PaymentRequest = z.object({
  payee: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(1_000_000_000),
  category: z.enum(CATEGORY_IDS).optional(),
  /** A wallet address (Sui, NEAR, EVM...). Checked for address poisoning. */
  payeeAddress: z.string().trim().min(3).max(128).optional(),
  /** What the payment is for, as the requester describes it. Checked for scam language. */
  memo: z.string().trim().max(500).optional(),
});
export type PaymentRequest = z.infer<typeof PaymentRequest>;

export type Severity = "info" | "low" | "medium" | "high";
export type Reason = { code: string; severity: Severity; message: string };
export type Decision = "allow" | "needs_approval" | "deny";

/** What the guard knows about the user, loaded by the caller. */
export type GuardContext = {
  /** Payee names the user has paid before (statement merchants and approved checks). */
  knownPayees: string[];
  /** Wallet addresses the user has paid before. */
  knownAddresses: string[];
  /** Past amounts paid to this payee, for spotting unusual sizes. */
  pastAmountsToPayee: number[];
  /** Approved spending already counted today. */
  approvedToday: number;
  /** The budget this payment falls in, if there is one. */
  budget?: { label: string; limit: number; projected: number };
};

/** Limits that apply when an agent key asks, on top of the user's rules. */
export type AgentScope = {
  name: string;
  monthlyAllowance: number;
  /** Approved so far this month with this key. */
  usedThisMonth: number;
  maxPerPayment: number | null;
  categories: string[];
  expired: boolean;
  revoked: boolean;
};

export type GuardResult = { decision: Decision; risk: number; reasons: Reason[] };

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lowercase, homoglyphs folded to letters, punctuation dropped: "PayPaI Inc." and "paypal" match. */
export function foldName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[а]/g, "a")
    .replace(/[е]/g, "e")
    .replace(/[о]/g, "o")
    .replace(/[р]/g, "p")
    .replace(/[с]/g, "c")
    .replace(/[х]/g, "x")
    // Greek lookalikes.
    .replace(/[\u03b1]/g, "a")
    .replace(/[\u03b5]/g, "e")
    .replace(/[\u03b9]/g, "i")
    .replace(/[\u03ba]/g, "k")
    .replace(/[\u03bd]/g, "v")
    .replace(/[\u03bf]/g, "o")
    .replace(/[\u03c1]/g, "p")
    .replace(/[\u03c4]/g, "t")
    .replace(/0/g, "o")
    .replace(/[1|!]/g, "l")
    .replace(/3/g, "e")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/rn/g, "m")
    .replace(/vv/g, "w")
    .replace(/\b(inc|ltd|llc|plc|co|corp|limited|official|support|billing|payments?)\b/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/i/g, "l");
}

export function editDistance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const normAddress = (a: string) => a.trim().toLowerCase().replace(/^0x/, "");
const sameName = (a: string, b: string) => (merchantKey(a) || a.toLowerCase()) === (merchantKey(b) || b.toLowerCase());

/** Mixed scripts in one word (Latin with Cyrillic or Greek) is a classic spoofing trick. */
const MIXED_SCRIPT = /(?=.*[A-Za-z])(?=.*[Ͱ-ϿЀ-ӿ])/;

const SCAM_PHRASES: [RegExp, string][] = [
  [/\bgift ?cards?\b/i, "asks for gift cards"],
  [/\b(seed|recovery) phrase\b|\bprivate key\b|\bmnemonic\b/i, "mentions a seed phrase or private key"],
  [/\b(urgent(ly)?|immediately|right now|within \d+ (minutes?|hours?)|final notice|last warning)\b/i, "pushes urgency"],
  [/\b(verify|unlock|reactivate|restore) (your )?(account|wallet|card)\b|\baccount (will be )?(suspended|locked|closed)\b/i, "claims your account needs verifying"],
  [/\b(double|triple|guaranteed) (your )?(money|crypto|returns?|profits?)\b|\bguaranteed returns?\b/i, "promises guaranteed returns"],
  [/\b(customs|release|clearance|processing|unlock) fee\b|\bfee to (receive|release|claim)\b/i, "asks for a fee to release money"],
  [/\b(irs|hmrc|tax office|police|court|firs)\b.{0,40}\b(pay|fine|penalty|arrest)\b/i, "claims to be a tax office or the police"],
  [/\b(refund|overpaid|overpayment)\b.{0,40}\b(send|return|pay) (back|the difference)\b/i, "asks you to send back an 'overpayment'"],
  [/\b(lottery|prize|winner|inheritance|airdrop claim)\b/i, "mentions a prize, lottery or inheritance"],
  [/\b(wrong number|investment (mentor|coach)|pig butchering)\b/i, "matches a known investment-scam script"],
];

/** Scam and spoofing signs in one payment request. Each comes with a risk weight. */
export function scamSignals(req: PaymentRequest, ctx: GuardContext, trusted: string[]): { reason: Reason; weight: number }[] {
  const out: { reason: Reason; weight: number }[] = [];
  const isTrusted = trusted.some((t) => sameName(t, req.payee) || (req.payeeAddress && normAddress(t) === normAddress(req.payeeAddress)));
  const known = ctx.knownPayees.some((p) => sameName(p, req.payee));

  if (!isTrusted && !known) {
    // Lookalike: folds to the same name, or one or two edits away, from someone the user already pays.
    const folded = foldName(req.payee);
    const lookalike = folded.length >= 4 && ctx.knownPayees.find((p) => {
      const f = foldName(p);
      return f.length >= 4 && (f === folded || (editDistance(f, folded) <= (f.length >= 8 ? 2 : 1) && f !== folded));
    });
    if (lookalike) {
      out.push({
        weight: 45,
        reason: { code: "lookalike_payee", severity: "high", message: `"${req.payee}" looks like "${lookalike}", someone you already pay, but isn't the same name.` },
      });
    }
    if (MIXED_SCRIPT.test(req.payee)) {
      out.push({ weight: 35, reason: { code: "mixed_script", severity: "high", message: `"${req.payee}" mixes alphabets, a common way to fake a familiar name.` } });
    }
  }

  if (req.payeeAddress && !isTrusted) {
    const a = normAddress(req.payeeAddress);
    const knownAddr = ctx.knownAddresses.map(normAddress);
    if (!knownAddr.includes(a)) {
      const poisoned = knownAddr.find((k) => k.length >= 10 && a.length === k.length && k.slice(0, 4) === a.slice(0, 4) && k.slice(-4) === a.slice(-4));
      if (poisoned) {
        out.push({
          weight: 60,
          reason: {
            code: "address_poisoning",
            severity: "high",
            message: `This address starts and ends like one you've paid before (${req.payeeAddress.slice(0, 6)}…${req.payeeAddress.slice(-4)}) but the middle differs. That's address poisoning: check every character.`,
          },
        });
      }
    }
  }

  const memo = `${req.memo ?? ""} ${req.payee}`;
  for (const [pattern, what] of SCAM_PHRASES) {
    if (pattern.test(memo)) out.push({ weight: 25, reason: { code: "scam_language", severity: "medium", message: `The request ${what}, which scams often do.` } });
  }

  if (!known && !isTrusted && req.amount >= 100 && req.amount % 100 === 0) {
    out.push({ weight: 10, reason: { code: "round_new_payee", severity: "low", message: `A round ${fmt(req.amount)} to someone new. Scam requests are often round numbers.` } });
  }

  if (ctx.pastAmountsToPayee.length >= 2) {
    const sorted = [...ctx.pastAmountsToPayee].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (req.amount >= median * 3 && req.amount - median >= 20) {
      out.push({
        weight: 20,
        reason: { code: "unusual_amount", severity: "medium", message: `${fmt(req.amount)} is ${(req.amount / median).toFixed(1)}x what you usually pay ${req.payee} (${fmt(median)}).` },
      });
    }
  }
  return out;
}

/**
 * The guard's decision for one payment. Deny beats needs_approval beats allow. Agents never get
 * needs_approval for scams: a risky agent payment is denied, and the user sees it in the log.
 */
export function evaluate(req: PaymentRequest, rules: PolicyRules, ctx: GuardContext, agent?: AgentScope): GuardResult {
  const reasons: Reason[] = [];
  let decision: Decision = "allow";
  const deny = (r: Reason) => {
    reasons.push(r);
    decision = "deny";
  };
  const ask = (r: Reason) => {
    reasons.push(r);
    if (decision === "allow") decision = "needs_approval";
  };

  const matches = (entry: string) => sameName(entry, req.payee) || (req.payeeAddress !== undefined && normAddress(entry) === normAddress(req.payeeAddress));

  // Agent key scope: like a NEAR function-call key, it can't do more than it was granted.
  if (agent) {
    if (agent.revoked) deny({ code: "key_revoked", severity: "high", message: `The key "${agent.name}" was revoked.` });
    if (agent.expired) deny({ code: "key_expired", severity: "high", message: `The key "${agent.name}" has expired.` });
    if (agent.usedThisMonth + req.amount > agent.monthlyAllowance) {
      deny({
        code: "allowance_exceeded",
        severity: "high",
        message: `This would take "${agent.name}" to ${fmt(agent.usedThisMonth + req.amount)} this month; its allowance is ${fmt(agent.monthlyAllowance)}.`,
      });
    }
    if (agent.maxPerPayment !== null && req.amount > agent.maxPerPayment) {
      deny({ code: "agent_max_per_payment", severity: "high", message: `"${agent.name}" may pay at most ${fmt(agent.maxPerPayment)} at once.` });
    }
    if (agent.categories.length && (!req.category || !agent.categories.includes(req.category))) {
      deny({
        code: "agent_category",
        severity: "high",
        message: `"${agent.name}" may only pay for ${agent.categories.join(", ")}${req.category ? `, not ${req.category}` : "; this payment has no category"}.`,
      });
    }
  }

  if (rules.blockedPayees.some(matches)) deny({ code: "blocked_payee", severity: "high", message: `You blocked payments to ${req.payee}.` });
  if (req.category && rules.blockedCategories.includes(req.category)) {
    deny({ code: "blocked_category", severity: "high", message: `You blocked payments in ${req.category}.` });
  }
  if (rules.maxPerPayment !== null && req.amount > rules.maxPerPayment) {
    deny({ code: "max_per_payment", severity: "high", message: `${fmt(req.amount)} is above your limit of ${fmt(rules.maxPerPayment)} per payment.` });
  }
  if (rules.dailyLimit !== null && ctx.approvedToday + req.amount > rules.dailyLimit) {
    deny({
      code: "daily_limit",
      severity: "high",
      message: `This would bring today's approved spending to ${fmt(ctx.approvedToday + req.amount)}; your daily limit is ${fmt(rules.dailyLimit)}.`,
    });
  }

  const trusted = rules.trustedPayees.some(matches);
  const known = ctx.knownPayees.some((p) => sameName(p, req.payee));
  if (rules.approvalAbove !== null && req.amount > rules.approvalAbove) {
    ask({ code: "approval_above", severity: "medium", message: `Payments above ${fmt(rules.approvalAbove)} need your approval.` });
  }
  if (!known && !trusted && rules.newPayeeApprovalAbove !== null && req.amount > rules.newPayeeApprovalAbove) {
    ask({ code: "new_payee", severity: "medium", message: `You haven't paid ${req.payee} before, and ${fmt(req.amount)} is above your ${fmt(rules.newPayeeApprovalAbove)} limit for new payees.` });
  }
  if (rules.respectBudgets && ctx.budget && ctx.budget.projected + req.amount > ctx.budget.limit) {
    ask({
      code: "budget_over",
      severity: "medium",
      message: `${ctx.budget.label} would reach ${fmt(ctx.budget.projected + req.amount)} of its ${fmt(ctx.budget.limit)} budget this month.`,
    });
  }

  const signals = scamSignals(req, ctx, rules.trustedPayees);
  const risk = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));
  reasons.push(...signals.map((s) => s.reason));
  if (risk >= 60) {
    if (agent) deny({ code: "high_risk", severity: "high", message: `Risk ${risk}/100: too risky for an agent to pay without you.` });
    else ask({ code: "high_risk", severity: "high", message: `Risk ${risk}/100: check this payment carefully before sending.` });
  } else if (risk >= 25) {
    ask({ code: "elevated_risk", severity: "medium", message: `Risk ${risk}/100: worth a second look.` });
  }

  if (decision === "allow" && !reasons.length) {
    reasons.push({ code: "ok", severity: "info", message: known || trusted ? `Within your rules, to someone you've paid before.` : "Within your rules." });
  }
  return { decision, risk, reasons };
}
