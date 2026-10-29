import { Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service.js";
import { profiles } from "../database/schema.js";
import { DEFAULT_CURRENCY } from "../shared/currency.js";

/** The currency a user picked in setup. Everything Sovra totals or compares is converted into it. */
@Injectable()
export class CurrencyService {
  constructor(private readonly database: DatabaseService) {}

  async forUser(address: string) {
    if (!this.database.available) return DEFAULT_CURRENCY;
    const [row] = await this.database.db
      .select({ currency: profiles.currency })
      .from(profiles)
      .where(eq(profiles.userAddress, address));
    return row?.currency ?? DEFAULT_CURRENCY;
  }
}
