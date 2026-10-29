import { Module } from "@nestjs/common";
import { AccountsModule } from "./accounts/accounts.module.js";
import { AiModule } from "./ai/ai.module.js";
import { AskModule } from "./ask/ask.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BudgetsModule } from "./budgets/budgets.module.js";
import { ConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { GoalsModule } from "./goals/goals.module.js";
import { HealthController } from "./health.controller.js";
import { MeModule } from "./me/me.module.js";
import { MemoryModule } from "./memory/memory.module.js";
import { RecurringModule } from "./recurring/recurring.module.js";
import { SecurityModule } from "./security/security.module.js";
import { TransactionsModule } from "./transactions/transactions.module.js";
import { FxModule } from "./fx/fx.module.js";
import { WalletModule } from "./wallet/wallet.module.js";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    SecurityModule,
    AiModule,
    FxModule,
    WalletModule,
    MemoryModule,
    MeModule,
    TransactionsModule,
    AccountsModule,
    BudgetsModule,
    GoalsModule,
    RecurringModule,
    AskModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
