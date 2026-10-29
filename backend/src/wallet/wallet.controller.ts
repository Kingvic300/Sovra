import { type CanActivate, Controller, type ExecutionContext, Get, HttpCode, Injectable, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { conflict } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CurrentSession, type RequestWithSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { RateLimit } from "../security/rate-limit.js";
import { TatumService, USDC_COIN_TYPE, USDC_DECIMALS } from "./tatum.service.js";
import { WalletSyncService } from "./wallet-sync.service.js";

const TransfersQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).default(25) });

/**
 * Email accounts' addresses are ids nobody holds keys for. Showing one as a deposit address
 * would let someone send USDC that can never be spent, so these routes refuse them.
 */
@Injectable()
class HasWalletGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const session = ctx.switchToHttp().getRequest<RequestWithSession>().session;
    if (session?.method === "email") throw conflict("Connect a Sui wallet to see balances or top up.", "no_wallet");
    return true;
  }
}

/** USDC held at the user's Sui address, read from Sui mainnet through Tatum. */
@Controller("wallet")
@UseGuards(SessionGuard, HasWalletGuard)
export class WalletController {
  constructor(
    private readonly tatum: TatumService,
    private readonly walletSync: WalletSyncService,
  ) {}

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

  /**
   * Imports the wallet's USDC transfers into transactions (read-only) and refreshes the Sui
   * account's balance. Safe to call repeatedly: transfers are de-duplicated by digest.
   */
  @Post("sync")
  @HttpCode(200)
  @RateLimit("walletSync")
  sync(@CurrentSession() session: Session) {
    return this.walletSync.sync(session);
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
