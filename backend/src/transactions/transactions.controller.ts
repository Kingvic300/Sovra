import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { CurrentSession, type Session } from "../auth/session.js";
import { SessionGuard } from "../auth/session.guard.js";
import { badRequest } from "../common/errors.js";
import { ZodPipe } from "../common/zod.pipe.js";
import { CATEGORY_IDS } from "../shared/categories.js";
import { TransactionsService } from "./transactions.service.js";

const MAX_CSV_BYTES = 5 * 1024 * 1024;

const ListQuery = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM").optional(),
  category: z.enum(CATEGORY_IDS).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
const ImportQuery = z.object({
  preview: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
  dateOrder: z.enum(["dmy", "mdy"]).optional(),
});
const ImportBody = z.object({ accountName: z.string().trim().max(80).optional() });
const PatchBody = z.object({ category: z.enum(CATEGORY_IDS), remember: z.boolean().default(false) });

@Controller("transactions")
@UseGuards(SessionGuard)
export class TransactionsController {
  constructor(private readonly txs: TransactionsService) {}

  @Get()
  async list(@CurrentSession() s: Session, @Query(new ZodPipe(ListQuery)) q: z.infer<typeof ListQuery>) {
    return { transactions: await this.txs.list(s.address, q) };
  }

  /** multipart/form-data with a `file` field. Add `?preview=1` to check the columns without saving. */
  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_CSV_BYTES } }))
  import(
    @CurrentSession() s: Session,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query(new ZodPipe(ImportQuery)) q: z.infer<typeof ImportQuery>,
    @Body(new ZodPipe(ImportBody)) body: z.infer<typeof ImportBody>,
  ) {
    if (!file) throw badRequest("Attach the statement as a `file` field.", "file_missing");
    if (!/\.csv$/i.test(file.originalname) && !/csv|text\/plain/.test(file.mimetype)) {
      throw badRequest("Only CSV statements are supported.", "unsupported_file");
    }
    return this.txs.importCsv(
      s,
      { content: file.buffer.toString("utf8"), filename: file.originalname },
      { preview: q.preview, dateOrder: q.dateOrder, accountName: body.accountName },
    );
  }

  @Patch(":id")
  update(
    @CurrentSession() s: Session,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(PatchBody)) body: z.infer<typeof PatchBody>,
  ) {
    return this.txs.updateCategory(s.address, id, body);
  }
}
