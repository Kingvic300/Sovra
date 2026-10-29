import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CURRENCY_CODE } from "../shared/currency.js";
import { FX_SOURCE, FxService } from "./fx.service.js";

const RateQuery = z.object({ currency: z.string().trim().toUpperCase().regex(CURRENCY_CODE, "currency must be an ISO 4217 code") });

@Controller("fx")
@UseGuards(SessionGuard)
export class FxController {
  constructor(private readonly fx: FxService) {}

  /** Units of `currency` per 1 USD, for example amounts during setup. `perUsd` is null when unknown. */
  @Get("rate")
  async rate(@Query(new ZodPipe(RateQuery)) q: z.infer<typeof RateQuery>) {
    const rates = await this.fx.rates();
    return { currency: q.currency, perUsd: rates?.rates[q.currency] ?? null, date: rates?.date ?? null, source: FX_SOURCE };
  }
}
