import { Module } from "@nestjs/common";
import { MemoryController } from "./memory.controller.js";
import { MemwalService } from "./memwal.service.js";

@Module({
  controllers: [MemoryController],
  providers: [MemwalService],
  exports: [MemwalService],
})
export class MemoryModule {}
