import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module.js";
import { MemoryModule } from "../memory/memory.module.js";
import { CsvService } from "./csv.service.js";
import { TransactionsController } from "./transactions.controller.js";
import { TransactionsService } from "./transactions.service.js";

@Module({
  imports: [MemoryModule, AiModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, CsvService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
