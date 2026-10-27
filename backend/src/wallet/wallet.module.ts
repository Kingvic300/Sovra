import { Module } from "@nestjs/common";
import { TatumService } from "./tatum.service.js";
import { WalletController } from "./wallet.controller.js";

@Module({
  controllers: [WalletController],
  providers: [TatumService],
  exports: [TatumService],
})
export class WalletModule {}
