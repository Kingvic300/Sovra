import { randomBytes } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { normalizeSuiAddress, isValidSuiAddress } from "@mysten/sui/utils";
import { and, eq, gt, lt } from "drizzle-orm";
import { badRequest, unauthorized } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { DatabaseService } from "../database/database.service.js";
import { authNonces, users } from "../database/schema.js";
import { TatumService } from "../wallet/tatum.service.js";
import { DemoService } from "./demo.service.js";
import { SESSION_TTL_SECONDS, type Session } from "./session.js";

const NONCE_TTL_MS = 5 * 60 * 1000;

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
    const set = Object.fromEntries(
      Object.entries({ name: session.name, email: session.email }).filter(([, value]) => value !== undefined),
    );
    await (Object.keys(set).length
      ? insert.onConflictDoUpdate({ target: users.address, set })
      : insert.onConflictDoNothing());
  }
}
