/** Spending guard: types and calls for /api/guard. */
import { api } from "@/lib/api";
import type { CategoryId } from "@/lib/demo-data";

export type Decision = "allow" | "needs_approval" | "deny";
export type Reason = { code: string; severity: "info" | "low" | "medium" | "high"; message: string };

export type GuardPolicy = {
  maxPerPayment: number | null;
  dailyLimit: number | null;
  approvalAbove: number | null;
  newPayeeApprovalAbove: number | null;
  blockedPayees: string[];
  trustedPayees: string[];
  blockedCategories: CategoryId[];
  respectBudgets: boolean;
};

export type AgentKey = {
  id: string;
  name: string;
  prefix: string;
  monthlyAllowance: number;
  maxPerPayment: number | null;
  categories: CategoryId[];
  usedThisMonth: number;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
};

export type GuardCheck = {
  id: string;
  payee: string;
  payeeAddress: string | null;
  amount: number;
  category: CategoryId | null;
  memo: string | null;
  decision: Decision;
  risk: number;
  reasons: Reason[];
  agent: string | null;
  createdAt: string;
};

export type CheckResult = { id: string; checkedAt: string; decision: Decision; risk: number; reasons: Reason[] };

export type PaymentInput = { payee: string; amount: number; category?: CategoryId; payeeAddress?: string; memo?: string };

export type NewKeyInput = {
  name: string;
  monthlyAllowance: number;
  maxPerPayment: number | null;
  categories: CategoryId[];
  expiresInDays: number | null;
};

export const guardApi = {
  overview: () => api<{ policy: GuardPolicy; keys: AgentKey[]; checks: GuardCheck[]; agentPaymentsBlocked: number }>("/guard"),
  savePolicy: (policy: GuardPolicy) => api<{ policy: GuardPolicy }>("/guard/policy", { method: "PUT", json: policy }),
  check: (payment: PaymentInput) => api<CheckResult>("/guard/check", { method: "POST", json: payment }),
  createKey: (input: NewKeyInput) => api<{ id: string; key: string }>("/guard/keys", { method: "POST", json: input }),
  revokeKey: (id: string) => api<null>(`/guard/keys/${id}`, { method: "DELETE" }),
};

export const DECISION: Record<Decision, { label: string; className: string }> = {
  allow: { label: "Allowed", className: "bg-gain-soft text-gain" },
  needs_approval: { label: "Ask first", className: "bg-caution-soft text-caution" },
  deny: { label: "Blocked", className: "bg-over-soft text-over" },
};

/** How an agent calls the guard. Shown once, next to a new key. */
export function agentSnippet(key: string, origin: string) {
  return `curl -s ${origin}/api/guard/agent/check \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"payee":"Netflix","amount":17.99,"category":"entertainment"}'
# Pay only when "decision" is "allow".`;
}
