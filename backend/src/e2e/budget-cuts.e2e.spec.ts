import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { HttpStatus } from "@nestjs/common";
import type { Session } from "../auth/session.js";
import { AppError } from "../common/errors.js";
import { CutsService } from "../cuts/cuts.module.js";
import { merchantKey } from "../shared/categories.js";
import { FakeAi, FakeMemWal, createTestApp, csvForm, flushBackgroundWork, signIn, type TestApp } from "../testing/test-app.js";
import { createTestDatabase, type TestDatabase } from "../testing/test-database.js";

/** Plans are made as of this moment, so renewals and habits fall on known dates. */
const NOW = new Date("2026-06-10T12:00:00Z");

/**
 * June so far: Filmhouse twice (60) against an $80 entertainment limit, with Netflix (15.99) and
 * Spotify (10) still to renew: 85.99 projected. Bolt rides: 50 against a $40 transport limit.
 */
const HISTORY = [
  "Date,Description,Amount",
  ...["03-15", "04-15", "05-15"].map((d) => `2026-${d},Netflix,-15.99`),
  ...["03-12", "04-12", "05-12"].map((d) => `2026-${d},Spotify,-10`),
  ...["03-20", "04-05", "04-25", "05-10", "05-30", "06-03", "06-08"].map((d) => `2026-${d},Filmhouse,-30`),
  ...["03-15", "03-29", "04-12", "04-26", "05-10", "05-24", "06-01", "06-07"].map((d) => `2026-${d},Bolt,-25`),
].join("\n");

const CATEGORIES = {
  [merchantKey("Netflix")]: "entertainment",
  [merchantKey("Spotify")]: "entertainment",
  [merchantKey("Filmhouse")]: "entertainment",
  [merchantKey("Bolt")]: "transport",
} as const;

const SAFETY = "Late Bolt rides home count as safety for me, so I keep them.";

describe("budget cuts", () => {
  let database: TestDatabase;
  let api: TestApp;
  let ai: FakeAi;
  let cuts: CutsService;

  before(async () => {
    database = await createTestDatabase();
    ai = new FakeAi(true, CATEGORIES);
    api = await createTestApp({ database, ai, memwal: new FakeMemWal() });
    cuts = api.app.get(CutsService);
  });

  after(async () => {
    await flushBackgroundWork();
    await api.close();
    await database.close();
  });

  async function overBudgetUser() {
    const client = api.client();
    const { address } = await signIn(client);
    assert.equal((await client.request("POST", "/transactions/import", { form: csvForm(HISTORY) })).status, 201);
    await client.put("/budgets/entertainment", { limit: 80 });
    await client.put("/budgets/transport", { limit: 40 });
    assert.equal((await client.post("/memories", { kind: "decision", text: SAFETY })).status, 201);
    await flushBackgroundWork();
    const session: Session = { address, method: "google" };
    return { client, session };
  }

  it("builds candidates from the user's own renewals and habits and recomputes every saving", async () => {
    ai.cutResult = (input) => ({
      summary: "Pause Netflix and skip one film to stay under, keeping your laptop fund on track.",
      cuts: [
        { id: input.candidates.find((c) => c.merchant === "Netflix")!.id, visits: null, why: "Netflix renews on Monday.", memory: null },
        { id: "skip:filmhouse", visits: 5, why: "Skip a film.", memory: null },
        { id: "pause:made-up", visits: null, why: "Not real.", memory: null },
      ],
      kept: [{ id: "skip:bolt", why: "You said late rides home keep you safe." }],
    });
    const { session } = await overBudgetUser();
    const plan = await cuts.plan(session, undefined, NOW);

    const input = ai.cutPlans.at(-1)!;
    assert.deepEqual(
      input.targets.map(({ category, limit, projected, over }) => ({ category, limit, projected, over })),
      [
        { category: "entertainment", limit: 80, projected: 85.99, over: 5.99 },
        { category: "transport", limit: 40, projected: 50, over: 10 },
      ],
    );
    assert.deepEqual(
      input.candidates.map((c) => (c.kind === "pause" ? [c.merchant, c.kind, c.saving] : [c.merchant, c.kind, c.perVisit, c.maxSkips])),
      [
        ["Spotify", "pause", 10],
        ["Netflix", "pause", 15.99],
        ["Filmhouse", "skip", 30, 2],
        ["Bolt", "skip", 25, 2],
      ],
    );
    assert.ok(input.memories.includes(SAFETY), "the model sees what the user said about Bolt");

    assert.equal(plan.status, "planned");
    assert.equal(plan.by, "ai");
    assert.deepEqual(
      plan.cuts.map(({ merchant, kind, visits, saving }) => ({ merchant, kind, visits, saving })),
      [
        { merchant: "Netflix", kind: "pause", visits: null, saving: 15.99 },
        { merchant: "Filmhouse", kind: "skip", visits: 2, saving: 60 },
      ],
    );
    assert.equal(plan.cuts[0].recurringId, input.candidates[1].id.slice("pause:".length));
    assert.deepEqual(plan.kept.map((k) => k.merchant), ["Bolt"]);
    assert.equal(plan.totalSaving, 75.99);
    assert.deepEqual(plan.targets.map((t) => [t.category, t.after]), [
      ["entertainment", 10],
      ["transport", 50],
    ]);
    assert.equal(plan.closesGap, false);
    ai.cutResult = undefined;
  });

  it("falls back to rules when the AI model fails, still keeping what a memory protects", async () => {
    const { session } = await overBudgetUser();
    ai.failure = new AppError(HttpStatus.BAD_GATEWAY, "ai_upstream_error", "down");
    try {
      const plan = await cuts.plan(session, "entertainment", NOW);
      assert.equal(plan.by, "rules");
      assert.match(plan.note ?? "", /simple rules/);
      // Netflix alone (15.99) covers the 5.99 gap.
      assert.deepEqual(plan.cuts.map((c) => c.merchant), ["Netflix"]);
      assert.equal(plan.closesGap, true);
      assert.match(plan.summary, /Entertainment ends at \$70 of \$80/);

      const transport = await cuts.plan(session, "transport", NOW);
      assert.deepEqual(transport.cuts, []);
      assert.deepEqual(transport.kept.map((k) => k.merchant), ["Bolt"]);
    } finally {
      ai.failure = undefined;
    }
  });

  it("says when a budget is on track or missing instead of inventing cuts", async () => {
    const { client, session } = await overBudgetUser();
    await client.put("/budgets/entertainment", { limit: 500 });
    const onTrack = await cuts.plan(session, "entertainment", NOW);
    assert.equal(onTrack.status, "on_track");
    assert.match(onTrack.summary, /Entertainment is on track/);
    assert.deepEqual(onTrack.cuts, []);

    const none = await cuts.plan(session, "food", NOW);
    assert.equal(none.status, "on_track");
    assert.match(none.summary, /no budget for that category/);
  });

  it("points to next month when this month's spending can't be cut any more", async () => {
    const client = api.client();
    const { address } = await signIn(client);
    const csv = ["Date,Description,Amount", "2026-06-05,Lagos Grill,-300", "2026-06-06,Shoprite,-40"].join("\n");
    await client.request("POST", "/transactions/import", { form: csvForm(csv) });
    await client.put("/budgets/food", { limit: 100 });
    const tx = (await client.get("/transactions")).body.transactions as { id: string; category: string }[];
    for (const t of tx) if (t.category !== "food") await client.patch(`/transactions/${t.id}`, { category: "food", remember: false });

    const before = ai.cutPlans.length;
    const plan = await cuts.plan({ address, method: "google" }, undefined, NOW);
    assert.equal(plan.status, "nothing_to_cut");
    assert.match(plan.summary, /already happened/);
    assert.match(plan.summary, /next month, start with food and groceries: Lagos Grill \(\$300 over 1 payment\)/);
    assert.equal(ai.cutPlans.length, before, "no AI call when there is nothing to choose from");
  });

  it("serves POST /budgets/cuts to signed-in users only and checks the category", async () => {
    const { client } = await overBudgetUser();
    const res = await client.post("/budgets/cuts", {});
    assert.equal(res.status, 200);
    assert.ok(["planned", "on_track", "nothing_to_cut"].includes(res.body.status));
    assert.equal((await client.post("/budgets/cuts", { category: "yachts" })).status, 400);
    assert.equal((await api.client().post("/budgets/cuts", {})).status, 401);
  });
});
