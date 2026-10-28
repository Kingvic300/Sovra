import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { and, eq, lt } from "drizzle-orm";
import { ENV, type Env } from "../config/env.js";
import { DatabaseService } from "../database/database.service.js";
import { users } from "../database/schema.js";
import { seedDemoData } from "./demo-seed.js";
import type { Session } from "./session.js";

export const DEMO_NAME = "Ada Okafor";

/**
 * Demo accounts: one per visitor, with a random address nobody can sign in to, sample data,
 * and an expiry after which the account and everything in it is deleted.
 */
@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);
  readonly ttlSeconds: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly database: DatabaseService,
  ) {
    this.ttlSeconds = env.DEMO_TTL_HOURS * 3600;
  }

  /** Creates and seeds a fresh demo account. Without a database the session works but has no data. */
  async create(now = new Date()): Promise<Session> {
    const session: Session = { address: normalizeSuiAddress(`0x${randomBytes(32).toString("hex")}`), method: "demo", name: DEMO_NAME };
    if (!this.database.available) return session;

    // Starting a demo is the natural moment to clear out old ones, and works on hosts without a scheduler.
    await this.cleanupExpired(now).catch((err: unknown) =>
      this.logger.warn(`Demo cleanup failed: ${err instanceof Error ? err.message : String(err)}`),
    );
    const expiresAt = new Date(now.getTime() + this.ttlSeconds * 1000);
    await this.database.db.transaction(async (tx) => {
      await tx.insert(users).values({ address: session.address, method: "demo", name: DEMO_NAME, expiresAt });
      await seedDemoData(tx, session.address, now);
    });
    return session;
  }

  /**
   * True while a demo account exists and hasn't expired. Old shared-demo sessions have no expiry and fail.
   * Without a database there is nothing to look up, so only the session's own expiry applies.
   */
  async isActive(address: string, now = new Date()) {
    if (!this.database.available) return true;
    const [row] = await this.database.db
      .select({ expiresAt: users.expiresAt })
      .from(users)
      .where(and(eq(users.address, address), eq(users.method, "demo")));
    return Boolean(row?.expiresAt && row.expiresAt > now);
  }

  /**
   * Deletes expired demo accounts; their rows in every user table go with them (ON DELETE CASCADE).
   * Only rows with an expiry are touched, so real accounts and the legacy shared demo are never deleted here.
   */
  async cleanupExpired(now = new Date()) {
    const deleted = await this.database.db
      .delete(users)
      .where(and(eq(users.method, "demo"), lt(users.expiresAt, now)))
      .returning({ address: users.address });
    if (deleted.length) this.logger.log(`Deleted ${deleted.length} expired demo account(s).`);
    return deleted.length;
  }
}
