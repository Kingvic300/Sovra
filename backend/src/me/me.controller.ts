import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CATEGORY_IDS } from "../shared/categories.js";
import { MeService } from "./me.service.js";

const ProfileBody = z.object({
  name: z.string().trim().min(1).max(80),
  onboarded: z.boolean(),
  goal: z
    .object({
      name: z.string().trim().min(1).max(80),
      target: z.number().positive().max(10_000_000),
      due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "due must be YYYY-MM-DD"),
    })
    .nullish(),
  limit: z
    .object({ category: z.enum(CATEGORY_IDS), amount: z.number().positive().max(10_000_000) })
    .nullish(),
  payday: z.union([z.number().int().min(1).max(31), z.literal("irregular")]).nullish(),
  sources: z.object({ csv: z.boolean(), sui: z.boolean() }),
});

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  get(@CurrentSession() session: Session) {
    return this.me.get(session);
  }

  @Put("profile")
  save(@CurrentSession() session: Session, @Body(new ZodPipe(ProfileBody)) body: z.infer<typeof ProfileBody>) {
    return this.me.save(session, body);
  }
}
