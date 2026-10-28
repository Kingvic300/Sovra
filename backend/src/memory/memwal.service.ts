import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { MemWal } from "@mysten-incubation/memwal";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { notConfigured, notFound, upstreamFailed } from "../common/errors.js";
import { ENV, type Env } from "../config/env.js";
import { DatabaseService } from "../database/database.service.js";
import { memories, users } from "../database/schema.js";

export type MemoryKind = "goal" | "limit" | "correction" | "preference" | "decision";
export const MEMORY_KINDS: MemoryKind[] = ["goal", "limit", "correction", "preference", "decision"];

/** Prefix written into each memory so recall results carry their kind back. */
const TAG = /^\[sovra:(goal|limit|correction|preference|decision)\]\s*/;

export const namespaceFor = (address: string) => `sovra-${address.toLowerCase()}`;

/**
 * Walrus Memory through the mainnet relayer. One app account; each user gets their own namespace.
 * Every memory is also indexed in Postgres (text, kind, blob id, forgotten flag) because the relayer
 * lists memories without their text and has no delete endpoint.
 */
@Injectable()
export class MemwalService implements OnModuleDestroy {
  private readonly logger = new Logger(MemwalService.name);
  private readonly client: MemWal | null;

  constructor(
    @Inject(ENV) env: Env,
    private readonly database: DatabaseService,
  ) {
    this.client =
      env.MEMWAL_KEY && env.MEMWAL_ACCOUNT_ID
        ? MemWal.create({ key: env.MEMWAL_KEY, accountId: env.MEMWAL_ACCOUNT_ID, serverUrl: env.MEMWAL_SERVER_URL })
        : null;
    if (!this.client) this.logger.warn("MEMWAL_KEY / MEMWAL_ACCOUNT_ID not set. Memory routes will answer 503.");
  }

  get configured() {
    return this.client !== null;
  }

  private get memwal(): MemWal {
    if (!this.client) throw notConfigured("Walrus Memory (MEMWAL_KEY, MEMWAL_ACCOUNT_ID)");
    return this.client;
  }

  /**
   * Indexes the memory, sends it to the relayer, and finishes the Walrus upload in the background.
   * Returns as soon as the relayer accepts the job. Demo accounts never reach Walrus: their
   * memories live only in the local index (status "local") and are deleted with the demo.
   */
  async remember(address: string, input: { kind: MemoryKind; text: string; source: string }) {
    if (await this.isDemo(address)) {
      const [local] = await this.database.db
        .insert(memories)
        .values({ userAddress: address, kind: input.kind, text: input.text, source: input.source, status: "local" })
        .returning();
      return local;
    }
    const memwal = this.memwal;
    const db = this.database.db;
    const [row] = await db
      .insert(memories)
      .values({ userAddress: address, kind: input.kind, text: input.text, source: input.source })
      .returning();

    try {
      const accepted = await memwal.remember(`[sovra:${input.kind}] ${input.text}`, namespaceFor(address));
      await db.update(memories).set({ jobId: accepted.job_id }).where(eq(memories.id, row.id));
      void this.finishUpload(row.id, accepted.job_id);
      return { ...row, jobId: accepted.job_id };
    } catch (err) {
      await db.update(memories).set({ status: "failed" }).where(eq(memories.id, row.id));
      throw upstreamFailed("Walrus Memory", err instanceof Error ? err.message : undefined);
    }
  }

  private async finishUpload(id: string, jobId: string) {
    try {
      const result = await this.memwal.waitForRememberJob(jobId, { timeoutMs: 120_000 });
      await this.database.db.update(memories).set({ status: "stored", blobId: result.blob_id }).where(eq(memories.id, id));
    } catch (err) {
      this.logger.warn(`Memory ${id} upload did not finish: ${err instanceof Error ? err.message : String(err)}`);
      await this.database.db.update(memories).set({ status: "failed" }).where(eq(memories.id, id));
    }
  }

  async list(address: string, kind?: MemoryKind) {
    const filters = [eq(memories.userAddress, address), isNull(memories.forgottenAt)];
    if (kind) filters.push(eq(memories.kind, kind));
    return this.database.db.select().from(memories).where(and(...filters)).orderBy(desc(memories.createdAt));
  }

  /**
   * Semantic search over the user's namespace. Results the user has forgotten are dropped,
   * and matching index rows get their `uses` counter bumped.
   */
  async recall(address: string, query: string, limit = 5) {
    if (await this.isDemo(address)) return this.recallLocally(address, query, limit);
    const memwal = this.memwal;
    const result = await memwal
      .recall({ query, limit: limit * 2, namespace: namespaceFor(address) })
      .catch((err: unknown) => {
        throw upstreamFailed("Walrus Memory", err instanceof Error ? err.message : undefined);
      });

    const blobIds = result.results.map((r) => r.blob_id);
    const indexed = this.database.available && blobIds.length
      ? await this.database.db
          .select()
          .from(memories)
          .where(and(eq(memories.userAddress, address), inArray(memories.blobId, blobIds)))
      : [];
    const byBlob = new Map(indexed.map((m) => [m.blobId, m]));

    const hits = result.results
      .filter((r) => !byBlob.get(r.blob_id)?.forgottenAt)
      .slice(0, limit)
      .map((r) => {
        const match = TAG.exec(r.text);
        const local = byBlob.get(r.blob_id);
        return {
          id: local?.id ?? null,
          blobId: r.blob_id,
          kind: (match?.[1] as MemoryKind | undefined) ?? local?.kind ?? null,
          text: r.text.replace(TAG, ""),
          distance: r.distance,
          createdAt: r.created_at ?? local?.createdAt ?? null,
        };
      });

    const usedIds = hits.map((h) => h.id).filter((id): id is string => id !== null);
    if (usedIds.length) {
      await this.database.db
        .update(memories)
        .set({ uses: sql`${memories.uses} + 1` })
        .where(inArray(memories.id, usedIds));
    }
    return hits;
  }

  /** Whether memories for this address can be stored and recalled, with or without Walrus keys. */
  async availableFor(address: string) {
    return this.configured || (await this.isDemo(address));
  }

  /** Demo recall: rank the local index by how many words of the question each memory shares. No Walrus call. */
  private async recallLocally(address: string, query: string, limit: number) {
    const words = [...new Set(query.toLowerCase().match(/[a-z0-9$]{3,}/g) ?? [])];
    const rows = await this.list(address);
    const hits = rows
      .map((m) => ({ m, score: words.filter((w) => m.text.toLowerCase().includes(w)).length }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score || b.m.uses - a.m.uses)
      .slice(0, limit)
      .map(({ m }) => ({ id: m.id, blobId: null, kind: m.kind, text: m.text, distance: null, createdAt: m.createdAt }));
    if (hits.length) {
      await this.database.db
        .update(memories)
        .set({ uses: sql`${memories.uses} + 1` })
        .where(inArray(memories.id, hits.map((h) => h.id)));
    }
    return hits;
  }

  private async isDemo(address: string) {
    if (!this.database.available) return false;
    const [user] = await this.database.db.select({ method: users.method }).from(users).where(eq(users.address, address));
    return user?.method === "demo";
  }

  /**
   * Stops Sovra from showing or using a memory. The encrypted copy on Walrus is not deleted
   * (the relayer has no delete); it stays until its storage period ends.
   */
  async forget(address: string, id: string) {
    const updated = await this.database.db
      .update(memories)
      .set({ forgottenAt: new Date() })
      .where(and(eq(memories.id, id), eq(memories.userAddress, address), isNull(memories.forgottenAt)))
      .returning({ id: memories.id });
    if (updated.length === 0) throw notFound("Memory");
    return { id, forgotten: true };
  }

  onModuleDestroy() {
    this.client?.destroy();
  }
}
