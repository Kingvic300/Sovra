import { Body, Controller, Delete, Get, HttpCode, Put, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { AuthService } from "../auth/auth.service.js";
import { CurrentSession, SESSION_COOKIE, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { RateLimit } from "../security/rate-limit.js";
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

const DeleteBody = z.object({
  /** The account address from GET /me, as explicit confirmation. */
  confirm: z.string().min(1).max(200),
});

@Controller("me")
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  get(@CurrentSession() session: Session) {
    return this.me.get(session);
  }

  @Put("profile")
  save(@CurrentSession() session: Session, @Body(new ZodPipe(ProfileBody)) body: z.infer<typeof ProfileBody>) {
    return this.me.save(session, body);
  }

  /** Everything Sovra stores about the user, as a JSON download. */
  @Get("export")
  @RateLimit("export")
  async export(@CurrentSession() session: Session, @Res({ passthrough: true }) res: Response) {
    const data = await this.me.exportData(session);
    res.setHeader("Content-Disposition", `attachment; filename="sovra-export-${data.exportedAt.slice(0, 10)}.json"`);
    return data;
  }

  /** Deletes the account and its data, then ends the session. */
  @Delete()
  @HttpCode(200)
  async delete(
    @CurrentSession() session: Session,
    @Body(new ZodPipe(DeleteBody)) body: z.infer<typeof DeleteBody>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.me.deleteAccount(session, body.confirm);
    const { maxAge: _maxAge, ...options } = this.auth.cookieOptions();
    res.clearCookie(SESSION_COOKIE, options);
    return result;
  }
}
