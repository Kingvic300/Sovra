import { Module } from "@nestjs/common";
import { TatumService } from "./tatum.service.js";
import { WalletSyncService } from "./wallet-sync.service.js";
import { WalletController } from "./wallet.controller.js";

@Module({
  controllers: [WalletController],
  providers: [TatumService, WalletSyncService],
  exports: [TatumService, WalletSyncService],
})
export class WalletModule {}
