import { Injectable, Logger } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Session } from "../auth/session.js";
import { DatabaseService } from "../database/database.service.js";
import { budgets, goals, profiles, users } from "../database/schema.js";
import { MemwalService } from "../memory/memwal.service.js";
import type { CategoryId } from "../shared/categories.js";
import { goalSentence, limitSentence, paydaySentence } from "../shared/memory-text.js";

export type ProfileInput = {
  name: string;
  onboarded: boolean;
  goal?: { name: string; target: number; due: string } | null;
  limit?: { category: CategoryId; amount: number } | null;
  payday?: number | "irregular" | null;
  sources: { csv: boolean; sui: boolean };
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
      memories.push(await this.rememberSafely(session.address, "goal", goalSentence(input.goal)));
    }
    if (input.limit && changed(input.limit, previous?.limit)) {
      await db
        .insert(budgets)
        .values({ userAddress: session.address, category: input.limit.category, limit: String(input.limit.amount) })
        .onConflictDoUpdate({ target: [budgets.userAddress, budgets.category], set: { limit: String(input.limit.amount) } });
      memories.push(await this.rememberSafely(session.address, "limit", limitSentence(input.limit)));
    }
    if (input.payday != null && changed(String(input.payday), previous?.payday)) {
      memories.push(await this.rememberSafely(session.address, "preference", paydaySentence(input.payday)));
    }

    return { profile: this.toApi(saved), memories };
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
    };
  }
}
