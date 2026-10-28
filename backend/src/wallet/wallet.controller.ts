import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { ZodPipe } from "../common/zod.pipe.js";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { TatumService, USDC_COIN_TYPE, USDC_DECIMALS } from "./tatum.service.js";

const TransfersQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25) });

/** USDC held at the user's zkLogin address, read from Sui mainnet through Tatum. */
@Controller("wallet")
@UseGuards(SessionGuard)
export class WalletController {
  constructor(private readonly tatum: TatumService) {}

  @Get("balance")
  async balance(@CurrentSession() session: Session) {
    const { raw, usdc } = await this.tatum.getUsdcBalance(session.address);
    // `usdc` stays an exact decimal string; `amount` is the same value as a number for display and comparisons.
    return { address: session.address, coinType: USDC_COIN_TYPE, raw, usdc, amount: Number(usdc), syncedAt: new Date().toISOString() };
  }

  @Get("transactions")
  async transactions(
    @CurrentSession() session: Session,
    @Query(new ZodPipe(TransfersQuery)) query: z.infer<typeof TransfersQuery>,
  ) {
    return { transfers: await this.tatum.getRecentUsdcTransfers(session.address, query.limit) };
  }

  /** What the top-up screen shows. Needs no Tatum key: it's the user's own address. */
  @Get("deposit")
  deposit(@CurrentSession() session: Session) {
    return {
      address: session.address,
      network: "sui:mainnet",
      token: "USDC",
      coinType: USDC_COIN_TYPE,
      decimals: USDC_DECIMALS,
    };
  }
}
