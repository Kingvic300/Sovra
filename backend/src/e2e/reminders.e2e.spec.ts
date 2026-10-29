import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { loadEnv } from "../config/env.js";
import type { DatabaseService } from "../database/database.service.js";
import { reminders, users } from "../database/schema.js";
import { RecurringService, recurringId } from "../recurring/recurring.module.js";
import { JobScheduler, JobsService, RemindersService } from "../reminders/reminders.module.js";
import {
  FakeAi,
  FakeMemWal,
  FakeSuiGraphQL,
  TEST_SESSION_SECRET,
  createTestApp,
  csvForm,
  flushBackgroundWork,
  signIn,
  tatumWithFakeChain,
  type TestApp,
  type TestClient,
} from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

const DAY = 86_400_000;
/** The fixed clock for generator tests: Monday 15 June 2026, noon UTC. */
const FIXED = new Date("2026-06-15T12:00:00Z");
const fixedDay = (offset: number) => new Date(FIXED.getTime() + offset * DAY).toISOString().slice(0, 10);
const realDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);

/** Netflix monthly (next charge the day after `day(0)`), plus a cinema trip earlier this month. */
const statement = (day: (offset: number) => string) =>
  ["Date,Description,Amount", ...[-89, -59, -29].map((n) => `${day(n)},Netflix,-17.99`), `${day(0)},Filmhouse Cinemas,-10`].join("\n");

const CRON_SECRET = "c".repeat(48);

describe("scheduled reminders", () => {
  let database: TestDatabase;
  let api: TestApp;
  let service: RemindersService;
  let memwal: FakeMemWal;
  let ai: FakeAi;
  let chain: FakeSuiGraphQL;

  before(async () => {
    database = await createTestDatabase();
    memwal = new FakeMemWal();
    ai = new FakeAi();
    chain = new FakeSuiGraphQL();
    api = await createTestApp({ database, memwal, ai, tatum: tatumWithFakeChain(chain), env: { CRON_SECRET } });
    service = api.app.get(RemindersService);
  });

  after(async () => {
    await flushBackgroundWork();
    await api.close();
    await database.close();
  });

  async function user(day: (offset: number) => string, limit = 20) {
    const client = api.client();
    const { address } = await signIn(client);
    await client.request("POST", "/transactions/import", { form: csvForm(statement(day)) });
    await client.put("/budgets/entertainment", { limit });
    return { client, address };
  }

  const rowsOf = (address: string) => database.db.select().from(reminders).where(eq(reminders.userAddress, address));

  it("reminds about renewals due soon and budgets projected to go over", async () => {
    const { address } = await user(fixedDay);
    assert.deepEqual(await service.refreshFor(address, FIXED), { created: 2, updated: 0, resolved: 0 });

    const open = await service.list(address, FIXED);
    assert.deepEqual(
      open.map(({ kind, title, body, tone, to, dueDate }) => ({ kind, title, body, tone, to, dueDate })),
      [
        {
          kind: "budget_over",
          title: "Entertainment will go over",
          body: "Netflix renews before the month ends, taking it to $28 of $20.",
          tone: "over",
          to: "/app/budgets",
          dueDate: "2026-06-01",
        },
        {
          kind: "renewal",
          title: "Netflix renews on 16 Jun",
          body: "$17.99 from your entertainment budget.",
          tone: "caution",
          to: "/app/recurring",
          dueDate: "2026-06-16",
        },
      ],
    );
  });

  it("creates nothing new when run again", async () => {
    const { address } = await user(fixedDay);
    await service.refreshFor(address, FIXED);
    assert.deepEqual(await service.refreshFor(address, FIXED), { created: 0, updated: 0, resolved: 0 });
    await Promise.all([service.refreshFor(address, FIXED), service.refreshFor(address, FIXED)]);
    assert.equal((await rowsOf(address)).length, 2);
  });

  it("only reminds about renewals within REMINDER_DAYS_AHEAD", async () => {
    const { address } = await user(fixedDay, 100);
    // The renewal is the day after FIXED. Three days ahead gets a reminder; four is too early.
    const threeDaysAhead = new Date(FIXED.getTime() - 2 * DAY);
    assert.equal((await service.list(address, new Date(threeDaysAhead.getTime() - DAY))).length, 0);
    assert.equal((await service.list(address, threeDaysAhead)).length, 1);
  });

  it("drops reminders for a paused charge and a budget back under its limit, and brings them back on resume", async () => {
    const { address } = await user(fixedDay);
    await service.refreshFor(address, FIXED);
    const recurring = api.app.get(RecurringService);
    const session = { address, method: "google" as const };

    assert.equal((await recurring.setStatus(session, recurringId("netflix"), "paused", FIXED)).changed, true);
    assert.deepEqual(await service.refreshFor(address, FIXED), { created: 0, updated: 0, resolved: 2 });
    assert.deepEqual(await service.list(address, FIXED), []);

    await recurring.setStatus(session, recurringId("netflix"), "active", FIXED);
    assert.equal((await service.list(address, FIXED)).length, 2);
    assert.equal((await rowsOf(address)).length, 2, "reopened, not duplicated");
  });

  it("keeps dismissed reminders dismissed, even when their numbers change", async () => {
    const { client, address } = await user(fixedDay);
    const [first] = await service.list(address, FIXED);
    assert.equal(first.kind, "budget_over");
    await service.dismiss(address, first.id, FIXED);
    // More spending changes the budget reminder's text; it must stay dismissed.
    await client.request("POST", "/transactions/import", { form: csvForm(`Date,Description,Amount\n${fixedDay(0)},Steam,-5`) });
    assert.equal((await service.refreshFor(address, FIXED)).updated, 1);
    const open = await service.list(address, FIXED);
    assert.equal(open.length, 1);
    assert.ok(!open.some((r) => r.id === first.id));
  });

  it("keeps a separate budget reminder per month and hides past ones", async () => {
    const { address } = await user(fixedDay);
    await service.refreshFor(address, FIXED);
    const nextMonth = new Date("2026-07-14T12:00:00Z");
    await service.refreshFor(address, nextMonth);
    const titles = (await service.list(address, nextMonth)).map((r) => `${r.kind} ${r.dueDate}`);
    assert.ok(!titles.includes("budget_over 2026-06-01"), "June's reminder isn't shown in July");
    assert.ok(!titles.includes("renewal 2026-06-16"));
  });

  it("lists and dismisses through the API, for the signed-in user only", async () => {
    const owner = await user(realDay);
    const res = await owner.client.get("/reminders");
    assert.equal(res.status, 200);
    assert.ok(res.body.reminders.length >= 1);
    const reminder = res.body.reminders[0];
    assert.deepEqual(Object.keys(reminder).sort(), ["body", "createdAt", "dueDate", "id", "kind", "title", "to", "tone"]);

    const other = api.client();
    await signIn(other);
    assert.deepEqual((await other.get("/reminders")).body.reminders, []);
    assert.equal((await other.post(`/reminders/${reminder.id}/dismiss`)).status, 404);

    assert.deepEqual((await owner.client.post(`/reminders/${reminder.id}/dismiss`)).body, { id: reminder.id, dismissed: true });
    assert.deepEqual((await owner.client.post(`/reminders/${reminder.id}/dismiss`)).body, { id: reminder.id, dismissed: true });
    assert.ok(!(await owner.client.get("/reminders")).body.reminders.some((r: { id: string }) => r.id === reminder.id));
    assert.equal((await owner.client.post("/reminders/00000000-0000-0000-0000-000000000000/dismiss")).status, 404);
    assert.equal((await owner.client.post("/reminders/not-a-uuid/dismiss")).status, 400);
  });

  it("requires a session", async () => {
    const client = api.client();
    assert.equal((await client.get("/reminders")).status, 401);
    assert.equal((await client.post("/reminders/00000000-0000-0000-0000-000000000000/dismiss")).status, 401);
  });

  describe("the job endpoint", () => {
    const run = (client: TestClient, authorization?: string) =>
      client.request("POST", "/internal/jobs/run", authorization ? { headers: { authorization } } : {});

    it("rejects a missing or wrong secret without revealing it", async () => {
      const client = api.client();
      for (const auth of [undefined, "Bearer wrong", `Bearer ${CRON_SECRET}x`, CRON_SECRET, `Basic ${CRON_SECRET}`]) {
        const res = await run(client, auth);
        assert.equal(res.status, 401, String(auth));
        assert.ok(!JSON.stringify(res.body).includes(CRON_SECRET));
      }
    });

    it("cleans up demos and refreshes every user's reminders, without paid calls", async () => {
      const { address } = await user(realDay);
      const demo = api.client();
      const expired = (await demo.post("/auth/demo")).body.user.address as string;
      await database.db.update(users).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(users.address, expired));
      const paid = { walrus: memwal.calls, ai: ai.answers.length + ai.categorized.length, tatum: chain.queries + chain.balanceReads };

      const res = await run(api.client(), `Bearer ${CRON_SECRET}`);
      assert.equal(res.status, 200);
      assert.ok(res.body.demoAccountsDeleted >= 1);
      assert.ok(res.body.reminders.users >= 1);
      assert.equal(res.body.reminders.failed, 0);
      assert.ok((await rowsOf(address)).length >= 1);
      assert.equal((await database.db.select().from(users).where(eq(users.address, expired))).length, 0);

      const again = await run(api.client(), `Bearer ${CRON_SECRET}`);
      assert.equal(again.body.reminders.created, 0, "a second run creates nothing");
      assert.deepEqual(
        { walrus: memwal.calls, ai: ai.answers.length + ai.categorized.length, tatum: chain.queries + chain.balanceReads },
        paid,
        "jobs never call Walrus, Groq or Tatum",
      );
    });

    it("leaves deleted accounts alone", async () => {
      const { address } = await user(realDay);
      await api.app.get(JobsService).runAll();
      await database.db.delete(users).where(eq(users.address, address));
      assert.equal((await rowsOf(address)).length, 0, "reminders go with the account");
      await api.app.get(JobsService).runAll();
      assert.equal((await rowsOf(address)).length, 0, "and the job doesn't bring them back");
    });
  });
});

describe("job endpoint without CRON_SECRET", () => {
  it("doesn't exist", async () => {
    const api = await createTestApp();
    try {
      const res = await api.client().request("POST", "/internal/jobs/run", { headers: { authorization: "Bearer anything" } });
      assert.equal(res.status, 404);
    } finally {
      await api.close();
    }
  });
});

describe("JobScheduler", () => {
  const env = (minutes: string) => loadEnv({ SESSION_SECRET: TEST_SESSION_SECRET, JOBS_INTERVAL_MINUTES: minutes });
  const db = { available: true } as unknown as DatabaseService;

  it("is off unless JOBS_INTERVAL_MINUTES is set, and needs a database", () => {
    const jobs = { runAll: async () => ({}) } as unknown as JobsService;
    const off = new JobScheduler(env("0"), db, jobs);
    off.onApplicationBootstrap();
    assert.equal(off.enabled, false);

    const noDb = new JobScheduler(env("5"), { available: false } as unknown as DatabaseService, jobs);
    noDb.onApplicationBootstrap();
    assert.equal(noDb.enabled, false);

    const on = new JobScheduler(env("5"), db, jobs);
    on.onApplicationBootstrap();
    assert.equal(on.enabled, true);
    on.onModuleDestroy();
    assert.equal(on.enabled, false);
  });

  it("never runs two jobs at once and survives a failed run", { timeout: 10_000 }, async () => {
    let release!: () => void;
    let runs = 0;
    const jobs = {
      runAll: () => {
        runs++;
        return new Promise<void>((resolve) => (release = resolve));
      },
    } as unknown as JobsService;
    const scheduler = new JobScheduler(env("5"), db, jobs);
    const first = scheduler.tick();
    assert.equal(await scheduler.tick(), false, "skipped while the first run is going");
    release();
    assert.equal(await first, true);
    assert.equal(runs, 1);

    const failing = new JobScheduler(env("5"), db, { runAll: async () => Promise.reject(new Error("db down")) } as unknown as JobsService);
    assert.equal(await failing.tick(), false);
    assert.equal(await failing.tick(), false, "and tries again next time");
  });

  it("rejects a short CRON_SECRET", () => {
    const exit = process.exit;
    const error = console.error;
    let code: number | undefined;
    process.exit = ((c?: number) => {
      code = c;
      throw new Error("exit");
    }) as typeof process.exit;
    console.error = () => {};
    try {
      assert.throws(() => loadEnv({ SESSION_SECRET: TEST_SESSION_SECRET, CRON_SECRET: "short" }), /exit/);
      assert.equal(code, 1);
    } finally {
      process.exit = exit;
      console.error = error;
    }
  });
});
