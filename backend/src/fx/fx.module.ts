import { Global, Module } from "@nestjs/common";
import { CurrencyService } from "./currency.service.js";
import { FxController } from "./fx.controller.js";
import { FxService } from "./fx.service.js";

@Global()
@Module({ controllers: [FxController], providers: [FxService, CurrencyService], exports: [FxService, CurrencyService] })
export class FxModule {}
