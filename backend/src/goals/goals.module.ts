import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { notFound } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { DatabaseService } from "../database/database.service.js";
import { goals, users } from "../database/schema.js";

const toApi = (g: typeof goals.$inferSelect) => ({
  id: g.id,
  name: g.name,
  target: Number(g.target),
  saved: Number(g.saved),
  due: g.due,
  weekly: g.weekly == null ? null : Number(g.weekly),
});

const money = z.number().min(0).max(10_000_000);
const GoalBody = z.object({
  name: z.string().trim().min(1).max(80),
  target: money.positive(),
  saved: money.default(0),
  due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "due must be YYYY-MM-DD"),
  weekly: money.nullish(),
});
/** No defaults here: a field left out of a PATCH must keep its value, not reset to the create default. */
const GoalPatch = GoalBody.extend({ saved: money }).partial();

@Injectable()
export class GoalsService {
  constructor(private readonly database: DatabaseService) {}

  async list(address: string) {
    const rows = await this.database.db.select().from(goals).where(eq(goals.userAddress, address)).orderBy(asc(goals.due));
    return rows.map(toApi);
  }

  async create(session: Session, input: z.infer<typeof GoalBody>) {
    const db = this.database.db;
    await db.insert(users).values({ address: session.address, method: session.method, name: session.name }).onConflictDoNothing();
    const [row] = await db
      .insert(goals)
      .values({
        userAddress: session.address,
        name: input.name,
        target: input.target.toFixed(2),
        saved: input.saved.toFixed(2),
        due: input.due,
        weekly: input.weekly == null ? null : input.weekly.toFixed(2),
      })
      .returning();
    return toApi(row);
  }

  async update(address: string, id: string, input: z.infer<typeof GoalPatch>) {
    const set: Partial<typeof goals.$inferInsert> = {};
    if (input.name !== undefined) set.name = input.name;
    if (input.target !== undefined) set.target = input.target.toFixed(2);
    if (input.saved !== undefined) set.saved = input.saved.toFixed(2);
    if (input.due !== undefined) set.due = input.due;
    if (input.weekly !== undefined) set.weekly = input.weekly == null ? null : input.weekly.toFixed(2);
    if (Object.keys(set).length === 0) return this.get(address, id);
    const [row] = await this.database.db
      .update(goals)
      .set(set)
      .where(and(eq(goals.id, id), eq(goals.userAddress, address)))
      .returning();
    if (!row) throw notFound("Goal");
    return toApi(row);
  }

  async remove(address: string, id: string) {
    const deleted = await this.database.db
      .delete(goals)
      .where(and(eq(goals.id, id), eq(goals.userAddress, address)))
      .returning({ id: goals.id });
    if (deleted.length === 0) throw notFound("Goal");
    return { id, deleted: true };
  }

  private async get(address: string, id: string) {
    const [row] = await this.database.db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userAddress, address)));
    if (!row) throw notFound("Goal");
    return toApi(row);
  }
}

@Controller("goals")
@UseGuards(SessionGuard)
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  async list(@CurrentSession() s: Session) {
    return { goals: await this.goals.list(s.address) };
  }

  @Post()
  create(@CurrentSession() s: Session, @Body(new ZodPipe(GoalBody)) body: z.infer<typeof GoalBody>) {
    return this.goals.create(s, body);
  }

  @Patch(":id")
  update(
    @CurrentSession() s: Session,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(GoalPatch)) body: z.infer<typeof GoalPatch>,
  ) {
    return this.goals.update(s.address, id, body);
  }

  @Delete(":id")
  remove(@CurrentSession() s: Session, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.goals.remove(s.address, id);
  }
}

@Module({ controllers: [GoalsController], providers: [GoalsService], exports: [GoalsService] })
export class GoalsModule {}
