import { Controller, Get, Header, HttpStatus, Module, Post, Res, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { badRequest } from "../common/errors.js";
import { RateLimit } from "../security/rate-limit.js";
import { CsvService } from "../transactions/csv.service.js";
import { AuditError, AuditService } from "./audit.service.js";

const MAX_FILES = 6;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Private expense auditor. Open to anyone (no account), rate-limited per IP.
 *
 * NOTHING IS KEPT: no session is read, no database is touched, uploads stay in memory and are
 * zeroed before the handler returns, and responses are marked `Cache-Control: no-store`.
 */
@Controller("audit")
export class AuditController {
  constructor(private readonly audits: AuditService) {}

  @Get("status")
  status() {
    return { configured: this.audits.configured, model: this.audits.model, retention: "none" };
  }

  /** Fetches and verifies a fresh attestation report. Sends no user data. */
  @Get("attestation")
  @RateLimit("audit")
  @Header("Cache-Control", "no-store")
  attestation() {
    return this.audits.attest();
  }

  /** multipart/form-data with up to six `files`: CSV or PDF statements, receipts as PDF or text. */
  @Post()
  @RateLimit("audit")
  @Header("Cache-Control", "no-store")
  @UseInterceptors(FilesInterceptor("files", MAX_FILES, { limits: { fileSize: MAX_FILE_BYTES } }))
  async audit(@UploadedFiles() files: Express.Multer.File[] | undefined, @Res({ passthrough: true }) res: Response) {
    if (!files?.length) throw badRequest("Attach at least one statement or receipt as `files`.", "file_missing");
    try {
      return await this.audits.audit(files.map((f) => ({ buffer: f.buffer, filename: f.originalname, mimetype: f.mimetype })));
    } catch (err) {
      // Failed audits still return the attestation checks that ran, so the user sees why.
      if (err instanceof AuditError && err.verification) {
        res.status(err.getStatus() ?? HttpStatus.BAD_GATEWAY);
        return { error: { code: err.code, message: err.message }, verification: err.verification };
      }
      throw err;
    } finally {
      // Overwrite the uploaded bytes so they don't linger in memory until garbage collection.
      for (const f of files) f.buffer.fill(0);
    }
  }
}

@Module({ controllers: [AuditController], providers: [AuditService, CsvService] })
export class AuditModule {}
