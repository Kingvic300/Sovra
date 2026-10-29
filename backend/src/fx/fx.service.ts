import { Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { DEFAULT_CURRENCY } from "../shared/currency.js";

/** Free daily rates, no key. Their terms ask apps to credit them, which the frontend does next to converted totals. */
export const FX_SOURCE = { name: "ExchangeRate-API", url: "https://www.exchangerate-api.com" };
const RATES_URL = "https://open.er-api.com/v6/latest/USD";
const REFRESH_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 10_000;

const RatesResponse = z.object({
  result: z.literal("success"),
  time_last_update_utc: z.string(),
  rates: z.record(z.string(), z.number().positive()),
});

/** Units of each currency per 1 USD, and the day they're from. */
export type FxRates = { date: string; rates: Record<string, number> };

/**
 * Converts between currencies with daily rates, fetched at most every 12 hours and kept in memory.
 * When rates can't be fetched, conversion between different currencies answers null, never a guess.
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private cached: { at: number; value: FxRates } | null = null;
  private inflight: Promise<FxRates | null> | null = null;

  async rates(): Promise<FxRates | null> {
    if (this.cached && Date.now() - this.cached.at < REFRESH_MS) return this.cached.value;
    this.inflight ??= this.fetchRates().finally(() => (this.inflight = null));
    return (await this.inflight) ?? this.cached?.value ?? null;
  }

  /** Multiplier from one currency to another, or null without a rate for either. */
  async rate(from: string, to: string) {
    if (from === to) return 1;
    const fx = await this.rates();
    const a = fx?.rates[from];
    const b = fx?.rates[to];
    return a && b ? b / a : null;
  }

  /** A converter for many amounts into `to`, after one rates lookup. */
  async converterTo(to: string) {
    const fx = await this.rates();
    return {
      fx,
      convert(amount: number, from: string | null | undefined): number | null {
        const source = from ?? to;
        if (source === to) return amount;
        const a = fx?.rates[source];
        const b = fx?.rates[to];
        return a && b ? Math.round(((amount * b) / a) * 100) / 100 : null;
      },
    };
  }

  protected async fetchRates(): Promise<FxRates | null> {
    try {
      const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const parsed = RatesResponse.safeParse(await res.json());
      if (!parsed.success) throw new Error("unexpected rates response");
      const value = { date: new Date(parsed.data.time_last_update_utc).toISOString().slice(0, 10), rates: { ...parsed.data.rates, [DEFAULT_CURRENCY]: 1 } };
      this.cached = { at: Date.now(), value };
      return value;
    } catch (err) {
      this.logger.warn(`Exchange rates unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
