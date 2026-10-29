import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { normalizeSuiAddress, isValidSuiAddress } from "@mysten/sui/utils";
import { and, eq, gt, isNotNull, lt, ne, sql, type SQL } from "drizzle-orm";
import { badRequest, conflict, unauthorized } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { DatabaseService } from "../database/database.service.js";
import { authNonces, users } from "../database/schema.js";
import { TatumService } from "../wallet/tatum.service.js";
import { DemoService } from "./demo.service.js";
import { dummyHash, hashPassword, verifyPassword } from "./password.js";
import { SESSION_TTL_SECONDS, type Session } from "./session.js";

const NONCE_TTL_MS = 5 * 60 * 1000;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  /** Used only when there is no database (local dev). Single-process only. */
  private readonly memoryNonces = new Map<string, { address: string; expiresAt: number }>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly database: DatabaseService,
    private readonly tatum: TatumService,
    private readonly demoAccounts: DemoService,
  ) {}

  /** Builds the exact message the wallet signs. The nonce makes each sign-in single-use. */
  async createChallenge(rawAddress: string) {
    const address = this.parseAddress(rawAddress);
    const nonce = randomBytes(16).toString("hex");
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + NONCE_TTL_MS);

    if (this.database.available) {
      const db = this.database.db;
      await db.delete(authNonces).where(lt(authNonces.expiresAt, issuedAt));
      await db.insert(authNonces).values({ nonce, address, expiresAt });
    } else {
      this.memoryNonces.set(nonce, { address, expiresAt: expiresAt.getTime() });
    }

    const message = [
      "Sign in to Sovra",
      "",
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      `Issued: ${issuedAt.toISOString()}`,
      `Expires: ${expiresAt.toISOString()}`,
    ].join("\n");
    return { message, expiresAt: expiresAt.toISOString() };
  }

  /** Checks the zkLogin signature over the challenge, consumes the nonce and returns a session. */
  async verify(input: { address: string; message: string; signature: string; name?: string; email?: string }) {
    const address = this.parseAddress(input.address);
    const fields = Object.fromEntries(
      input.message
        .split("\n")
        .map((line) => line.split(": "))
        .filter((p) => p.length === 2),
    ) as Record<string, string>;
    if (!fields.Nonce || fields.Address !== address) throw unauthorized("This sign-in request doesn't match your address.");

    await this.consumeNonce(fields.Nonce, address);

    try {
      await verifyPersonalMessageSignature(new TextEncoder().encode(input.message), input.signature, {
        address,
        client: this.tatum.verificationClient,
      });
    } catch (err) {
      this.logger.warn(`Signature rejected for ${address}: ${err instanceof Error ? err.message : String(err)}`);
      throw unauthorized("We couldn't verify your sign-in. Try again.");
    }

    const session: Session = { address, method: "google", name: input.name, email: input.email };
    await this.upsertUser(session);
    return session;
  }

  /**
   * Creates an email account. It gets a random address nobody holds keys for, like a demo account,
   * so every table keyed by address works; its wallet routes are refused (see WalletController).
   */
  async signUp(input: { email: string; password: string; name?: string }) {
    const db = this.database.db;
    const email = normalizeEmail(input.email);
    if (await this.passwordAccount(email)) throw conflict("An account with this email already exists. Sign in instead.", "email_taken");

    const session: Session = {
      address: normalizeSuiAddress(`0x${randomBytes(32).toString("hex")}`),
      method: "email",
      name: input.name?.trim() || undefined,
      email,
    };
    const inserted = await db
      .insert(users)
      .values({ ...session, passwordHash: await hashPassword(input.password) })
      .onConflictDoNothing()
      .returning({ address: users.address });
    // Two sign-ups for one email at once: the unique index lets only one through.
    if (inserted.length === 0) throw conflict("An account with this email already exists. Sign in instead.", "email_taken");
    return session;
  }

  /** Signs in to an email account, or to a wallet account that added email sign-in (it keeps its wallet). */
  async logIn(input: { email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const user = await this.passwordAccount(email);
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash()));
    if (!user || !ok || user.method === "demo") throw unauthorized("That email and password don't match an account.");
    const session: Session = { address: user.address, method: user.method, name: user.name ?? undefined, email };
    return session;
  }

  /**
   * Lets a wallet account also sign in with email and password, or changes them.
   * The wallet still works; both sign-ins open the same account.
   */
  async setPassword(current: Session, input: { email: string; password: string }) {
    if (current.method !== "google") throw badRequest("Only wallet accounts can add email sign-in.", "not_wallet_account");
    const email = normalizeEmail(input.email);
    const owner = await this.passwordAccount(email);
    if (owner && owner.address !== current.address) {
      throw conflict("Another account already signs in with this email.", "email_taken");
    }
    const updated = await this.database.db
      .update(users)
      .set({ email, passwordHash: await hashPassword(input.password) })
      .where(eq(users.address, current.address))
      .returning({ address: users.address })
      // The unique index settles two accounts claiming one email at the same moment.
      .catch(() => {
        throw conflict("Another account already signs in with this email.", "email_taken");
      });
    if (updated.length === 0) throw unauthorized();
    return { ...current, email };
  }

  /** The account that signs in with this email, if any. */
  private async passwordAccount(email: string) {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNotNull(users.passwordHash), ne(users.method, "demo")));
    return user;
  }

  /** A fresh, seeded demo account for this visitor. */
  demo() {
    return this.demoAccounts.create();
  }

  /** Demo sessions last exactly as long as their demo account. */
  ttlSeconds(session: Pick<Session, "method">) {
    return session.method === "demo" ? this.demoAccounts.ttlSeconds : SESSION_TTL_SECONDS;
  }

  sign(session: Session) {
    return this.jwt.signAsync(
      { sub: session.address, method: session.method, name: session.name, email: session.email },
      { expiresIn: this.ttlSeconds(session) },
    );
  }

  cookieOptions(session: Pick<Session, "method"> = { method: "google" }) {
    return {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: this.env.NODE_ENV === "production",
      path: "/",
      maxAge: this.ttlSeconds(session) * 1000,
    };
  }

  private parseAddress(raw: string) {
    const address = normalizeSuiAddress(raw.trim());
    if (!isValidSuiAddress(address)) throw badRequest("That isn't a valid Sui address.", "invalid_address");
    return address;
  }

  private async consumeNonce(nonce: string, address: string) {
    const now = new Date();
    if (this.database.available) {
      const deleted = await this.database.db
        .delete(authNonces)
        .where(and(eq(authNonces.nonce, nonce), eq(authNonces.address, address), gt(authNonces.expiresAt, now)))
        .returning();
      if (deleted.length === 0) throw unauthorized("This sign-in request expired. Start again.");
      return;
    }
    const entry = this.memoryNonces.get(nonce);
    this.memoryNonces.delete(nonce);
    if (!entry || entry.address !== address || entry.expiresAt < now.getTime()) {
      throw unauthorized("This sign-in request expired. Start again.");
    }
  }

  /**
   * Records the user when a database is configured; sessions still work without one.
   * Only the profile fields this sign-in provided are updated, so a sign-in without
   * Google claims neither fails nor wipes the name and email saved earlier.
   */
  private async upsertUser(session: Session) {
    if (!this.database.available) return;
    const insert = this.database.db
      .insert(users)
      .values({ address: session.address, method: session.method, name: session.name, email: session.email });
    const set: { name?: string; email?: SQL } = {};
    if (session.name !== undefined) set.name = session.name;
    // A sign-in email only changes through setPassword, never through a wallet sign-in.
    if (session.email !== undefined) {
      set.email = sql`case when ${users.passwordHash} is null then ${session.email} else ${users.email} end`;
    }
    await (Object.keys(set).length
      ? insert.onConflictDoUpdate({ target: users.address, set })
      : insert.onConflictDoNothing());
  }
}
