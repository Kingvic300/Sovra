import { HttpStatus, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";
import { AppError } from "./errors.js";

/** Validates and parses a request part with a zod schema: `@Body(new ZodPipe(Schema))`. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const message = parsed.error.issues
        .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
        .join("; ");
      throw new AppError(HttpStatus.BAD_REQUEST, "invalid_request", message);
    }
    return parsed.data;
  }
}
