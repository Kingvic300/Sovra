import { Body, Controller, Delete, Get, HttpCode, Module, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { MemoryModule } from "../memory/memory.module.js";
import { RecurringModule } from "../recurring/recurring.module.js";
import { CATEGORY_IDS, type CategoryId } from "../shared/categories.js";
import { BudgetSuggestionsService } from "./budget-suggestions.js";
import { BudgetsService, currentMonth } from "./budgets.service.js";

export { BudgetsService } from "./budgets.service.js";

const MonthQuery = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM").optional() });
const CategoryParam = z.enum(CATEGORY_IDS);
const LimitBody = z.object({ limit: z.number().positive().max(10_000_000) });
const SuggestionId = z.string().regex(/^[a-z]+:(raise|lower):\d{1,9}$/, "Unknown suggestion id");

@Controller("budgets")
@UseGuards(SessionGuard)
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    private readonly suggestions: BudgetSuggestionsService,
  ) {}

  @Get()
  list(@CurrentSession() s: Session, @Query(new ZodPipe(MonthQuery)) q: z.infer<typeof MonthQuery>) {
    return this.budgets.list(s.address, q.month ?? currentMonth());
  }

  /** Limit changes suggested by deterministic rules over the last three full months. */
  @Get("suggestions")
  async listSuggestions(@CurrentSession() s: Session) {
    return { suggestions: await this.suggestions.list(s.address) };
  }

  @Post("suggestions/:id/accept")
  @HttpCode(200)
  accept(@CurrentSession() s: Session, @Param("id", new ZodPipe(SuggestionId)) id: string) {
    return this.suggestions.decide(s, id, "accepted");
  }

  @Post("suggestions/:id/dismiss")
  @HttpCode(200)
  dismiss(@CurrentSession() s: Session, @Param("id", new ZodPipe(SuggestionId)) id: string) {
    return this.suggestions.decide(s, id, "dismissed");
  }

  @Put(":category")
  set(
    @CurrentSession() s: Session,
    @Param("category", new ZodPipe(CategoryParam)) category: CategoryId,
    @Body(new ZodPipe(LimitBody)) body: z.infer<typeof LimitBody>,
  ) {
    return this.budgets.set(s, category, body.limit);
  }

  @Delete(":category")
  remove(@CurrentSession() s: Session, @Param("category", new ZodPipe(CategoryParam)) category: CategoryId) {
    return this.budgets.remove(s.address, category);
  }
}

@Module({
  imports: [RecurringModule, MemoryModule],
  controllers: [BudgetsController],
  providers: [BudgetsService, BudgetSuggestionsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
