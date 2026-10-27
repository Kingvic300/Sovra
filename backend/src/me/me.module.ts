import { Module } from "@nestjs/common";
import { MemoryModule } from "../memory/memory.module.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";

@Module({
  imports: [MemoryModule],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
