import { createHash, randomBytes } from "node:crypto";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { and, desc, eq, gte, isNotNull, isNull, sql, sum } from "drizzle-orm";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { BudgetsModule } from "../budgets/budgets.module.js";
import { BudgetsService } from "../budgets/budgets.service.js";
import { notFound, unauthorized } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DatabaseService } from "../database/database.service.js";
import { agentKeys, guardChecks, guardPolicies, transactions, users } from "../database/schema.js";
import { RateLimit } from "../security/rate-limit.js";
import { CATEGORY_IDS, merchantKey } from "../shared/categories.js";
import { type AgentScope, DEFAULT_RULES, evaluate, type GuardContext, PaymentRequest, PolicyRules } from "./policy.js";

/** Agent keys look like `sovra_ak_<43 url-safe characters>`; only their SHA-256 is stored. */
const KEY_PREFIX = "sovra_ak_";
const KNOWN_PAYEE_ROWS = 2000;

const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");
const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
const dayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

const NewKey = z.object({
  name: z.string().trim().min(1).max(60),
  monthlyAllowance: z.number().positive().max(1_000_000_000),
  maxPerPayment: z.number().positive().max(1_000_000_000).nullable().default(null),
  categories: z.array(z.enum(CATEGORY_IDS)).max(CATEGORY_IDS.length).default([]),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(30),
});

@Injectable()
export class GuardService {
  constructor(
    private readonly database: DatabaseService,
    private readonly budgets: BudgetsService,
  ) {}

  private async ensureUser(session: Session) {
    await this.database.db
      .insert(users)
      .values({ address: session.address, method: session.method, name: session.name })
      .onConflictDoNothing();
  }

  async policy(address: string): Promise<PolicyRules> {
    const [row] = await this.database.db.select().from(guardPolicies).where(eq(guardPolicies.userAddress, address));
    // Stored rules are re-parsed so rules added later get their defaults.
    return row ? PolicyRules.parse(row.rules) : DEFAULT_RULES;
  }

  async setPolicy(session: Session, rules: PolicyRules) {
    await this.ensureUser(session);
    await this.database.db
      .insert(guardPolicies)
      .values({ userAddress: session.address, rules })
      .onConflictDoUpdate({ target: guardPolicies.userAddress, set: { rules, updatedAt: new Date() } });
    return rules;
  }

  private async usedThisMonth(keyId: string, now: Date) {
    const [row] = await this.database.db
      .select({ total: sum(guardChecks.amount) })
      .from(guardChecks)
      .where(and(eq(guardChecks.agentKeyId, keyId), eq(guardChecks.decision, "allow"), gte(guardChecks.createdAt, monthStart(now))));
    return Number(row?.total ?? 0);
  }

  async keys(address: string, now = new Date()) {
    const rows = await this.database.db.select().from(agentKeys).where(eq(agentKeys.userAddress, address)).orderBy(desc(agentKeys.createdAt));
    return Promise.all(
      rows.map(async (k) => ({
        id: k.id,
        name: k.name,
        prefix: k.prefix,
        monthlyAllowance: Number(k.monthlyAllowance),
        maxPerPayment: k.maxPerPayment == null ? null : Number(k.maxPerPayment),
        categories: k.categories,
        usedThisMonth: await this.usedThisMonth(k.id, now),
        expiresAt: k.expiresAt?.toISOString() ?? null,
        revokedAt: k.revokedAt?.toISOString() ?? null,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        createdAt: k.createdAt.toISOString(),
      })),
    );
  }

  /** Creates a key and returns it once. Sovra keeps only its hash, so it can't be shown again. */
  async createKey(session: Session, input: z.infer<typeof NewKey>, now = new Date()) {
    await this.ensureUser(session);
    const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
    const [row] = await this.database.db
      .insert(agentKeys)
      .values({
        userAddress: session.address,
        name: input.name,
        keyHash: hashKey(key),
        prefix: key.slice(0, KEY_PREFIX.length + 6),
        monthlyAllowance: String(input.monthlyAllowance),
        maxPerPayment: input.maxPerPayment == null ? null : String(input.maxPerPayment),
        categories: input.categories,
        expiresAt: input.expiresInDays ? new Date(now.getTime() + input.expiresInDays * 86_400_000) : null,
      })
      .returning({ id: agentKeys.id });
    return { id: row.id, key };
  }

  async revokeKey(address: string, id: string) {
    const [row] = await this.database.db
      .update(agentKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(agentKeys.id, id), eq(agentKeys.userAddress, address), isNull(agentKeys.revokedAt)))
      .returning({ id: agentKeys.id });
    if (!row) throw notFound("Active agent key");
  }

  /** Resolves a bearer key to its owner. Revoked and expired keys still resolve, so the check can say why it refused. */
  async keyFromHeader(authorization: string | undefined) {
    const key = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    if (!key || !key.startsWith(KEY_PREFIX)) throw unauthorized("Send an agent key as `Authorization: Bearer sovra_ak_...`.");
    const [row] = await this.database.db.select().from(agentKeys).where(eq(agentKeys.keyHash, hashKey(key)));
    if (!row) throw unauthorized("That agent key isn't valid.");
    return row;
  }

  private async context(address: string, req: PaymentRequest, now: Date): Promise<GuardContext> {
    const db = this.database.db;
    const key = merchantKey(req.payee) || req.payee.toLowerCase();
    const [merchants, approved, today] = await Promise.all([
      db
        .select({ merchant: transactions.merchant, merchantKey: transactions.merchantKey, amount: transactions.amount })
        .from(transactions)
        .where(eq(transactions.userAddress, address))
        .orderBy(desc(transactions.date))
        .limit(KNOWN_PAYEE_ROWS),
      db
        .select({ payee: guardChecks.payee, payeeAddress: guardChecks.payeeAddress, amount: guardChecks.amount })
        .from(guardChecks)
        .where(and(eq(guardChecks.userAddress, address), eq(guardChecks.decision, "allow")))
        .orderBy(desc(guardChecks.createdAt))
        .limit(KNOWN_PAYEE_ROWS),
      db
        .select({ total: sum(guardChecks.amount) })
        .from(guardChecks)
        .where(and(eq(guardChecks.userAddress, address), eq(guardChecks.decision, "allow"), gte(guardChecks.createdAt, dayStart(now)))),
    ]);

    let budget: GuardContext["budget"];
    if (req.category) {
      const list = await this.budgets.list(address, now.toISOString().slice(0, 7), now).catch(() => null);
      const b = list?.budgets.find((x) => x.category === req.category);
      if (b) budget = { label: b.label, limit: b.limit, projected: b.projected };
    }

    const sameKey = (name: string) => (merchantKey(name) || name.toLowerCase()) === key;
    return {
      knownPayees: [...new Set([...merchants.filter((m) => Number(m.amount) < 0).map((m) => m.merchant), ...approved.map((a) => a.payee)])],
      knownAddresses: [...new Set(approved.map((a) => a.payeeAddress).filter((a): a is string => Boolean(a)))],
      pastAmountsToPayee: [
        ...merchants.filter((m) => m.merchantKey === key && Number(m.amount) < 0).map((m) => -Number(m.amount)),
        ...approved.filter((a) => sameKey(a.payee)).map((a) => Number(a.amount)),
      ].slice(0, 50),
      approvedToday: Number(today[0]?.total ?? 0),
      budget,
    };
  }

  async check(address: string, req: PaymentRequest, agent?: typeof agentKeys.$inferSelect, now = new Date()) {
    const [rules, ctx] = await Promise.all([this.policy(address), this.context(address, req, now)]);
    const scope: AgentScope | undefined = agent && {
      name: agent.name,
      monthlyAllowance: Number(agent.monthlyAllowance),
      usedThisMonth: await this.usedThisMonth(agent.id, now),
      maxPerPayment: agent.maxPerPayment == null ? null : Number(agent.maxPerPayment),
      categories: agent.categories,
      expired: Boolean(agent.expiresAt && agent.expiresAt <= now),
      revoked: Boolean(agent.revokedAt),
    };
    const result = evaluate(req, rules, ctx, scope);

    const [row] = await this.database.db
      .insert(guardChecks)
      .values({
        userAddress: address,
        agentKeyId: agent?.id ?? null,
        payee: req.payee,
        payeeAddress: req.payeeAddress ?? null,
        amount: String(req.amount),
        category: req.category ?? null,
        memo: req.memo ?? null,
        decision: result.decision,
        risk: result.risk,
        reasons: result.reasons,
      })
      .returning({ id: guardChecks.id, createdAt: guardChecks.createdAt });
    if (agent) await this.database.db.update(agentKeys).set({ lastUsedAt: now }).where(eq(agentKeys.id, agent.id));

    return {
      id: row.id,
      checkedAt: row.createdAt.toISOString(),
      ...result,
      ...(scope && { allowance: { monthly: scope.monthlyAllowance, used: scope.usedThisMonth + (result.decision === "allow" ? req.amount : 0) } }),
    };
  }

  async recent(address: string, limit = 30) {
    const rows = await this.database.db
      .select({ check: guardChecks, agent: agentKeys.name })
      .from(guardChecks)
      .leftJoin(agentKeys, eq(agentKeys.id, guardChecks.agentKeyId))
      .where(eq(guardChecks.userAddress, address))
      .orderBy(desc(guardChecks.createdAt))
      .limit(limit);
    return rows.map(({ check: c, agent }) => ({
      id: c.id,
      payee: c.payee,
      payeeAddress: c.payeeAddress,
      amount: Number(c.amount),
      category: c.category,
      memo: c.memo,
      decision: c.decision,
      risk: c.risk,
      reasons: c.reasons,
      agent: agent ?? null,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async overview(address: string) {
    const [policy, keys, checks, blocked] = await Promise.all([
      this.policy(address),
      this.keys(address),
      this.recent(address),
      this.database.db
        .select({ n: sql<number>`count(*)::int` })
        .from(guardChecks)
        .where(and(eq(guardChecks.userAddress, address), eq(guardChecks.decision, "deny"), isNotNull(guardChecks.agentKeyId))),
    ]);
    return { policy, keys, checks, agentPaymentsBlocked: blocked[0]?.n ?? 0 };
  }
}

@Controller("guard")
export class GuardController {
  constructor(private readonly guard: GuardService) {}

  @Get()
  @UseGuards(SessionGuard)
  overview(@CurrentSession() s: Session) {
    return this.guard.overview(s.address);
  }

  @Put("policy")
  @UseGuards(SessionGuard)
  async setPolicy(@CurrentSession() s: Session, @Body(new ZodPipe(PolicyRules)) rules: PolicyRules) {
    return { policy: await this.guard.setPolicy(s, rules) };
  }

  /** Check a payment you are about to make yourself. */
  @Post("check")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @RateLimit("guard")
  check(@CurrentSession() s: Session, @Body(new ZodPipe(PaymentRequest)) req: PaymentRequest) {
    return this.guard.check(s.address, req);
  }

  @Post("keys")
  @UseGuards(SessionGuard)
  createKey(@CurrentSession() s: Session, @Body(new ZodPipe(NewKey)) body: z.infer<typeof NewKey>) {
    return this.guard.createKey(s, body);
  }

  @Delete("keys/:id")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async revokeKey(@CurrentSession() s: Session, @Param("id", new ParseUUIDPipe()) id: string) {
    await this.guard.revokeKey(s.address, id);
  }

  /**
   * For AI agents: `Authorization: Bearer sovra_ak_...`, no session. The key can do nothing but ask
   * this question, within its allowance and categories. Sovra never moves money; the agent pays only
   * when the answer is "allow".
   */
  @Post("agent/check")
  @HttpCode(200)
  @RateLimit("guard")
  async agentCheck(@Headers("authorization") authorization: string | undefined, @Body(new ZodPipe(PaymentRequest)) req: PaymentRequest) {
    const key = await this.guard.keyFromHeader(authorization);
    return this.guard.check(key.userAddress, req, key);
  }
}

@Module({ imports: [BudgetsModule], controllers: [GuardController], providers: [GuardService] })
export class GuardModule {}
