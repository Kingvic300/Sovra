import { Module } from "@nestjs/common";
import { AI_PROVIDER } from "./ai.provider.js";
import { GroqAiProvider } from "./groq.provider.js";

/** Binds the AI provider. Swap the class here to change vendors. */
@Module({
  providers: [{ provide: AI_PROVIDER, useClass: GroqAiProvider }],
  exports: [AI_PROVIDER],
})
export class AiModule {}
