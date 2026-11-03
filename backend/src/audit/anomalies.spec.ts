import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { merchantKey } from "../shared/categories.js";
import { CsvService } from "../transactions/csv.service.js";
import { type AuditRow, detectSignals } from "./anomalies.js";

let n = 0;
const row = (date: string, merchant: string, amount: number, source = "s.csv"): AuditRow => ({
  id: `r${n++}`,
  date,
  merchant,
  merchantKey: merchantKey(merchant) || merchant.toLowerCase(),
  amount,
  source,
});

describe("detectSignals", () => {
  it("flags the same charge twice in a few days", () => {
    const rows = [row("2026-10-13", "Pixelport", -129.99), row("2026-10-13", "Pixelport", -129.99), row("2026-10-20", "Shop", -5)];
    const dup = detectSignals(rows).find((s) => s.kind === "duplicate");
    assert.ok(dup);
    assert.equal(dup.rowIds.length, 2);
    assert.equal(dup.severity, "high");
  });

  it("flags a charge far above the merchant's usual", () => {
    const rows = ["05", "09", "15", "25"].map((d) => row(`2026-10-${d}`, "CityGo Rides", -14)).concat(row("2026-10-20", "CityGo Rides", -61.9));
    assert.ok(detectSignals(rows).some((s) => s.kind === "outlier" && s.detail.includes("61.90")));
  });

  it("flags a subscription price rise", () => {
    const rows = [row("2026-09-02", "Streamflix", -12.99), row("2026-10-02", "Streamflix", -15.99)];
    assert.ok(detectSignals(rows).some((s) => s.kind === "price_rise"));
  });

  it("does not flag income or a steady bill", () => {
    const rows = [row("2026-09-01", "Payroll", 3850), row("2026-10-01", "Payroll", 3850), row("2026-09-16", "Lumen", -45), row("2026-10-16", "Lumen", -45)];
    assert.deepEqual(detectSignals(rows), []);
  });

  it("finds every planted anomaly in the sample statements", () => {
    const csv = new CsvService();
    const dir = resolve(process.cwd(), "../frontend/public/samples");
    const rows: AuditRow[] = [];
    for (const file of ["northwind-checking-sep-2026.csv", "northwind-checking-oct-2026.csv"]) {
      for (const r of csv.parse(readFileSync(resolve(dir, file), "utf8"), new Map()).rows) {
        rows.push({ id: `r${rows.length}`, date: r.date, merchant: r.merchant, merchantKey: r.merchantKey, amount: r.amount, source: file });
      }
    }
    const kinds = new Set(detectSignals(rows).map((s) => s.kind));
    for (const kind of ["duplicate", "outlier", "price_rise", "fee", "round_transfer", "weekend_cash"] as const) {
      assert.ok(kinds.has(kind), `expected a ${kind} signal`);
    }
  });
});
