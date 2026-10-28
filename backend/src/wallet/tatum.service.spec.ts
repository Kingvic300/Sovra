import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../common/errors.js";
import { loadEnv } from "../config/env.js";
import { TatumService, USDC_COIN_TYPE, formatUnits } from "./tatum.service.js";

const ME = "0x" + "a".repeat(64);
const SHOP = "0x" + "b".repeat(64);
const SUI = "0x2::sui::SUI";

const env = (tatumKey?: string) =>
  loadEnv({ SESSION_SECRET: "test-session-secret-not-for-production", ...(tatumKey ? { TATUM_API_KEY: tatumKey } : {}) });

/** TatumService with its GraphQL client replaced, so nothing leaves the process. */
function withFakeClient(fake: { query?: (...args: unknown[]) => Promise<unknown>; getBalance?: () => Promise<unknown> }) {
  const service = new TatumService(env("fake-key"));
  (service as unknown as { tatum: unknown }).tatum = { query: fake.query, core: { getBalance: fake.getBalance } };
  return service;
}

const tx = (digest: string, changes: { owner: string; coin: string; amount: string }[], extra: Record<string, unknown> = {}) => ({
  digest,
  sender: { address: ME },
  effects: {
    timestamp: "2026-10-20T10:00:00Z",
    status: "SUCCESS",
    balanceChanges: { nodes: changes.map((c) => ({ owner: { address: c.owner }, coinType: { repr: c.coin }, amount: c.amount })) },
    ...extra,
  },
});

describe("formatUnits", () => {
  it("formats raw integer amounts with the given decimals", () => {
    assert.equal(formatUnits(1_500_000n, 6), "1.5");
    assert.equal(formatUnits(1n, 6), "0.000001");
    assert.equal(formatUnits(42_000_000n, 6), "42");
    assert.equal(formatUnits(0n, 6), "0");
    assert.equal(formatUnits(-2_250_000n, 6), "-2.25");
  });
});

describe("TatumService", () => {
  it("is not configured without TATUM_API_KEY and answers 503", async () => {
    const service = new TatumService(env());
    assert.equal(service.configured, false);
    await assert.rejects(
      service.getUsdcBalance(ME),
      (err: unknown) => err instanceof AppError && err.code === "not_configured" && err.getStatus() === 503,
    );
  });

  it("still offers a client for sign-in verification without a key", () => {
    assert.ok(new TatumService(env()).verificationClient);
  });

  it("reads the USDC balance", async () => {
    let asked: unknown;
    const service = withFakeClient({
      getBalance: async (...args: unknown[]) => {
        asked = args[0];
        return { balance: { balance: "1032400000" } };
      },
    });
    assert.deepEqual(await service.getUsdcBalance(ME), { raw: "1032400000", usdc: "1032.4" });
    assert.deepEqual(asked, { owner: ME, coinType: USDC_COIN_TYPE });
  });

  it("turns upstream failures into 502 upstream_failed", async () => {
    const service = withFakeClient({
      getBalance: async () => {
        throw new Error("boom");
      },
    });
    await assert.rejects(service.getUsdcBalance(ME), (err: unknown) => err instanceof AppError && err.code === "upstream_failed");
  });

  it("reduces transactions to USDC movements in and out of the address, newest first", async () => {
    const service = withFakeClient({
      query: async () => ({
        data: {
          transactions: {
            nodes: [
              // Oldest: paid a shop 12.5 USDC.
              tx("d1", [
                { owner: ME, coin: USDC_COIN_TYPE, amount: "-12500000" },
                { owner: SHOP, coin: USDC_COIN_TYPE, amount: "12500000" },
                { owner: ME, coin: SUI, amount: "-1000" },
              ]),
              // Only gas moved: not a USDC transfer.
              tx("d2", [{ owner: ME, coin: SUI, amount: "-1000" }]),
              // Newest: received 100 USDC, failed status.
              tx(
                "d3",
                [
                  { owner: ME, coin: USDC_COIN_TYPE, amount: "100000000" },
                  { owner: SHOP, coin: USDC_COIN_TYPE, amount: "-100000000" },
                ],
                { status: "FAILURE" },
              ),
            ],
          },
        },
      }),
    });

    assert.deepEqual(await service.getRecentUsdcTransfers(ME, 10), [
      { digest: "d3", date: "2026-10-20T10:00:00Z", direction: "in", amount: "100", counterparty: SHOP, status: "failure" },
      { digest: "d1", date: "2026-10-20T10:00:00Z", direction: "out", amount: "12.5", counterparty: SHOP, status: "success" },
    ]);
  });

  it("reports GraphQL errors as upstream failures", async () => {
    const service = withFakeClient({ query: async () => ({ errors: [{ message: "bad filter" }] }) });
    await assert.rejects(
      service.getRecentUsdcTransfers(ME),
      (err: unknown) => err instanceof AppError && err.code === "upstream_failed" && /bad filter/.test(err.message),
    );
  });
});
