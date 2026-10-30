import { Injectable, Logger } from "@nestjs/common";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Session } from "../auth/session.js";
import { badRequest, notFound } from "../common/errors.js";
import { DatabaseService } from "../database/database.service.js";
import { authNonces, budgets, goals, memories, profiles, users } from "../database/schema.js";
import { MemwalService } from "../memory/memwal.service.js";
import type { CategoryId } from "../shared/categories.js";
import { goalSentence, limitSentence, paydaySentence } from "../shared/memory-text.js";
import { USER_DATA_TABLES } from "./user-data.js";

export type ProfileInput = {
  name: string;
  onboarded: boolean;
  goal?: { name: string; target: number; due: string } | null;
  limit?: { category: CategoryId; amount: number } | null;
  payday?: number | "irregular" | null;
  sources: { csv: boolean; sui: boolean };
  currency?: string;
};

/** JSON with object keys sorted. Postgres jsonb reorders keys, so plain JSON.stringify can't compare saved values. */
const canonicalJson = (value: unknown) =>
  JSON.stringify(value ?? null, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v,
  );

type MemoryOutcome = { kind: string; text: string; status: "saved" | "skipped" | "failed"; reason?: string };

@Injectable()
export class MeService {
  private readonly logger = new Logger(MeService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly memory: MemwalService,
  ) {}

  async get(session: Session) {
    if (!this.database.available) return { user: session, profile: null, passwordEmail: null };
    const db = this.database.db;
    const [[profile], [user]] = await Promise.all([
      db.select().from(profiles).where(eq(profiles.userAddress, session.address)),
      db.select({ email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.address, session.address)),
    ]);
    return {
      user: session,
      profile: profile ? this.toApi(profile) : null,
      /** The email this account can sign in with, when it has a password. */
      passwordEmail: user?.passwordHash ? user.email : null,
    };
  }

  /**
   * Saves the profile. When goal, limit or payday change, they also become a goal row / budget row
   * and a Walrus memory, worded the same way the onboarding screen previews them.
   */
  async save(session: Session, input: ProfileInput) {
    const db = this.database.db;
    await db
      .insert(users)
      .values({ address: session.address, method: session.method, name: session.name, email: session.email })
      .onConflictDoNothing();

    const [previous] = await db.select().from(profiles).where(eq(profiles.userAddress, session.address));
    const values = {
      name: input.name,
      onboarded: input.onboarded,
      goal: input.goal ?? null,
      limit: input.limit ?? null,
      payday: input.payday == null ? null : String(input.payday),
      sources: input.sources,
      currency: input.currency ?? previous?.currency ?? null,
      updatedAt: new Date(),
    };
    const [saved] = await db
      .insert(profiles)
      .values({ userAddress: session.address, ...values })
      .onConflictDoUpdate({ target: profiles.userAddress, set: values })
      .returning();

    const memories: MemoryOutcome[] = [];
    const changed = (a: unknown, b: unknown) => canonicalJson(a) !== canonicalJson(b);

    if (input.goal && changed(input.goal, previous?.goal)) {
      await db.insert(goals).values({
        userAddress: session.address,
        name: input.goal.name,
        target: String(input.goal.target),
        due: input.goal.due,
      });
      memories.push(await this.rememberSafely(session.address, "goal", goalSentence(input.goal, values.currency ?? undefined)));
    }
    if (input.limit && changed(input.limit, previous?.limit)) {
      await db
        .insert(budgets)
        .values({ userAddress: session.address, category: input.limit.category, limit: String(input.limit.amount) })
        .onConflictDoUpdate({ target: [budgets.userAddress, budgets.category], set: { limit: String(input.limit.amount) } });
      memories.push(await this.rememberSafely(session.address, "limit", limitSentence(input.limit, values.currency ?? undefined)));
    }
    if (input.payday != null && changed(String(input.payday), previous?.payday)) {
      memories.push(await this.rememberSafely(session.address, "preference", paydaySentence(input.payday)));
    }

    return { profile: this.toApi(saved), memories };
  }

  /**
   * Everything Sovra stores about the user, as JSON: the account (without the password hash) and
   * every row of every user-data table, forgotten memories included.
   */
  async exportData(session: Session, now = new Date()) {
    const db = this.database.db;
    const [user] = await db.select().from(users).where(eq(users.address, session.address));
    if (!user) throw notFound("Account");
    const { passwordHash: _passwordHash, ...account } = user;
    const data: Record<string, unknown[]> = {};
    for (const [name, { table, owner }] of Object.entries(USER_DATA_TABLES)) {
      data[name] = await db.select().from(table).where(eq(owner, session.address));
    }
    return {
      format: "sovra-export",
      version: 1,
      exportedAt: now.toISOString(),
      account,
      data,
      notes: [
        "Amounts are exact decimal strings in US dollars; USDC on Sui counts as dollars.",
        "memories includes ones you forgot (forgottenAt is set). Sovra no longer shows or uses those.",
        "Memories written to Walrus are stored there encrypted; their text is here, the encrypted copies are not.",
      ],
    };
  }

  /**
   * Deletes the account and everything Sovra holds about it, in one transaction: every user-data
   * table (by cascade from `users`) and pending sign-in challenges. `confirm` must be the account
   * address, so nothing is deleted by accident. Data outside Sovra's database is listed in `retained`.
   */
  async deleteAccount(session: Session, confirm: string) {
    if (confirm.trim().toLowerCase() !== session.address.toLowerCase()) {
      throw badRequest("To delete your account, confirm with your account address.", "confirmation_mismatch");
    }
    return this.database.db.transaction(async (tx) => {
      const removed: Record<string, number> = {};
      for (const [name, { table, owner }] of Object.entries(USER_DATA_TABLES)) {
        const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(table).where(eq(owner, session.address));
        removed[name] = Number(count);
      }
      const [{ onWalrus }] = await tx
        .select({ onWalrus: sql<number>`count(*)::int` })
        .from(memories)
        .where(and(eq(memories.userAddress, session.address), isNotNull(memories.blobId)));

      await tx.delete(authNonces).where(eq(authNonces.address, session.address));
      const deleted = await tx.delete(users).where(eq(users.address, session.address)).returning({ address: users.address });
      if (deleted.length === 0) throw notFound("Account");

      return {
        deleted: true,
        address: session.address,
        removed,
        retained: [
          ...(Number(onWalrus) > 0
            ? [
                `${Number(onWalrus)} memories were written to Walrus Memory. Their encrypted copies stay on Walrus until their storage period ends, because Walrus Memory has no delete. Sovra deleted its index of them, so they are never listed, recalled or used again.`,
              ]
            : []),
          "Transactions on the Sui blockchain are public and permanent. Sovra only read them, and can't remove them.",
          "Questions you asked Ask Sovra were sent to Groq to be answered; Groq's own retention policy applies to those requests.",
        ],
      };
    });
  }

  /** A profile save shouldn't fail because Walrus Memory is down or not configured. */
  private async rememberSafely(address: string, kind: "goal" | "limit" | "preference", text: string): Promise<MemoryOutcome> {
    if (!(await this.memory.availableFor(address))) return { kind, text, status: "skipped", reason: "not_configured" };
    try {
      await this.memory.remember(address, { kind, text, source: "You told Sovra" });
      return { kind, text, status: "saved" };
    } catch (err) {
      this.logger.warn(`Could not remember ${kind} for ${address}: ${err instanceof Error ? err.message : String(err)}`);
      return { kind, text, status: "failed" };
    }
  }

  private toApi(p: typeof profiles.$inferSelect) {
    return {
      name: p.name,
      onboarded: p.onboarded,
      goal: p.goal ?? undefined,
      limit: p.limit ?? undefined,
      payday: p.payday == null ? undefined : p.payday === "irregular" ? "irregular" : Number(p.payday),
      sources: p.sources,
      currency: p.currency ?? "USD",
    };
  }
}
