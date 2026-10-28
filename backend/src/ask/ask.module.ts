import { Body, Controller, Delete, Get, HttpCode, Module, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AiModule } from "../ai/ai.module.js";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { BudgetsModule } from "../budgets/budgets.module.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { GoalsModule } from "../goals/goals.module.js";
import { MemoryModule } from "../memory/memory.module.js";
import { RecurringModule } from "../recurring/recurring.module.js";
import { RateLimit } from "../security/rate-limit.js";
import { TransactionsModule } from "../transactions/transactions.module.js";
import { WalletModule } from "../wallet/wallet.module.js";
import { AskService } from "./ask.service.js";

const AskBody = z.object({ question: z.string().trim().min(2).max(1000) });
const HistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** Id of the oldest message already shown. */
  before: z.string().uuid().optional(),
});

@Controller("ask")
@UseGuards(SessionGuard)
export class AskController {
  constructor(private readonly asker: AskService) {}

  @Post()
  @HttpCode(200)
  @RateLimit("ask")
  ask(@CurrentSession() s: Session, @Body(new ZodPipe(AskBody)) body: z.infer<typeof AskBody>) {
    return this.asker.ask(s, body.question);
  }

  @Get("history")
  history(@CurrentSession() s: Session, @Query(new ZodPipe(HistoryQuery)) q: z.infer<typeof HistoryQuery>) {
    return this.asker.history(s.address, q);
  }

  @Delete("history")
  clearHistory(@CurrentSession() s: Session) {
    return this.asker.clearHistory(s.address);
  }
}

@Module({
  imports: [AiModule, MemoryModule, BudgetsModule, GoalsModule, RecurringModule, TransactionsModule, WalletModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
