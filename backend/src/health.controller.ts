import { Controller, Get, Inject } from "@nestjs/common";
import { AI_PROVIDER, type AiProvider } from "./ai/ai.provider.js";
import { DatabaseService } from "./database/database.service.js";
import { MemwalService } from "./memory/memwal.service.js";
import { TatumService } from "./wallet/tatum.service.js";

/** Liveness plus which integrations this deployment has keys for. */
@Controller("health")
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly tatum: TatumService,
    private readonly memory: MemwalService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  @Get()
  health() {
    return {
      status: "ok",
      services: {
        database: this.database.available,
        tatum: this.tatum.configured,
        walrusMemory: this.memory.configured,
        ai: this.ai.configured,
      },
    };
  }
}
