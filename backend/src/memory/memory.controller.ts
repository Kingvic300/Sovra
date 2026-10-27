import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { MEMORY_KINDS, MemwalService, type MemoryKind } from "./memwal.service.js";

const KindEnum = z.enum(MEMORY_KINDS as [MemoryKind, ...MemoryKind[]]);
const ListQuery = z.object({ kind: KindEnum.optional() });
const CreateBody = z.object({
  kind: KindEnum,
  text: z.string().trim().min(3).max(500),
  source: z.string().trim().max(80).default("You told Sovra"),
});
const RecallBody = z.object({
  query: z.string().trim().min(2).max(500),
  limit: z.number().int().min(1).max(20).default(5),
});

@Controller("memories")
@UseGuards(SessionGuard)
export class MemoryController {
  constructor(private readonly memory: MemwalService) {}

  @Get()
  async list(@CurrentSession() s: Session, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return { memories: await this.memory.list(s.address, q.kind) };
  }

  @Post()
  async create(@CurrentSession() s: Session, @Body(new ZodPipe(CreateBody)) body: z.infer<typeof CreateBody>) {
    return { memory: await this.memory.remember(s.address, body) };
  }

  @Post("recall")
  @HttpCode(200)
  async recall(@CurrentSession() s: Session, @Body(new ZodPipe(RecallBody)) body: z.infer<typeof RecallBody>) {
    return { results: await this.memory.recall(s.address, body.query, body.limit) };
  }

  @Delete(":id")
  forget(@CurrentSession() s: Session, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.memory.forget(s.address, id);
  }
}
