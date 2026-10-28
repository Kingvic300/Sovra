import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../common/errors.js";
import type { CategoryId } from "../shared/categories.js";
import { CsvService } from "./csv.service.js";

const csv = new CsvService();
const noRules = new Map<string, CategoryId>();

describe("CsvService.parse", () => {
  it("reads a single signed amount column", () => {
    const result = csv.parse(
      ["Date,Description,Amount", "2026-10-03,NETFLIX.COM,-17.99", "2026-10-25,Salary ACME,1800.00"].join("\n"),
      noRules,
    );
    assert.deepEqual(result.columns, { date: "Date", description: "Description", amount: "Amount", debit: undefined, credit: undefined, balance: undefined });
    assert.equal(result.closingBalance, null);
    assert.equal(result.rows.length, 2);
    assert.deepEqual(
      result.rows.map(({ date, merchant, amount, category }) => ({ date, merchant, amount, category })),
      [
        { date: "2026-10-03", merchant: "NETFLIX.COM", amount: -17.99, category: "entertainment" },
        { date: "2026-10-25", merchant: "Salary ACME", amount: 1800, category: "income" },
      ],
    );
    assert.deepEqual(result.skipped, []);
  });

  it("reads separate debit and credit columns", () => {
    const result = csv.parse(
      ["Posted Date,Narration,Debit,Credit,Balance", "03/10/2026,Shoprite Lekki,4500.50,,100", "04/10/2026,Transfer from Tunde,,225,325"].join(
        "\n",
      ),
      noRules,
    );
    assert.deepEqual(
      result.rows.map((r) => r.amount),
      [-4500.5, 225],
    );
    assert.equal(result.rows[0].category, "food");
  });

  it("never treats a balance column as the amount", () => {
    const result = csv.parse(["Date,Details,Amount,Running Balance", "2026-10-01,Bolt ride,-12,500"].join("\n"), noRules);
    assert.equal(result.columns.amount, "Amount");
    assert.equal(result.rows[0].amount, -12);
  });

  it("understands bank number formats", () => {
    const result = csv.parse(
      [
        "Date,Description,Amount",
        '2026-10-01,A,"₦1,234.50"',
        "2026-10-02,B,(45.00)",
        "2026-10-03,C,45.00 DR",
        "2026-10-04,D,12 CR",
      ].join("\n"),
      noRules,
    );
    assert.deepEqual(
      result.rows.map((r) => r.amount),
      [1234.5, -45, -45, 12],
    );
  });

  it("detects day-first and month-first dates", () => {
    const dayFirst = csv.parse(["Date,Description,Amount", "25/10/2026,X,-1", "03/10/2026,Y,-1"].join("\n"), noRules);
    assert.equal(dayFirst.dateOrder, "dmy");
    assert.deepEqual(
      dayFirst.rows.map((r) => r.date),
      ["2026-10-25", "2026-10-03"],
    );

    const monthFirst = csv.parse(["Date,Description,Amount", "10/25/2026,X,-1", "10/03/2026,Y,-1"].join("\n"), noRules);
    assert.equal(monthFirst.dateOrder, "mdy");
    assert.equal(monthFirst.rows[1].date, "2026-10-03");
  });

  it("lets the caller force the date order", () => {
    const result = csv.parse(["Date,Description,Amount", "03/10/2026,X,-1"].join("\n"), noRules, "mdy");
    assert.equal(result.rows[0].date, "2026-03-10");
  });

  it("reads month names and two-digit years", () => {
    const result = csv.parse(["Date,Description,Amount", "3 Oct 26,X,-1", "15-Sept-2026,Y,-1"].join("\n"), noRules);
    assert.deepEqual(
      result.rows.map((r) => r.date),
      ["2026-10-03", "2026-09-15"],
    );
  });

  it("skips unreadable rows with the CSV line number and reason", () => {
    const result = csv.parse(
      ["Date,Description,Amount", "not a date,X,-1", "2026-10-01,,-1", "2026-10-01,Y,", "2026-10-01,Z,0", "2026-13-01,W,-1"].join("\n"),
      noRules,
    );
    assert.equal(result.rows.length, 0);
    assert.deepEqual(result.skipped, [
      { line: 2, reason: "Unreadable date" },
      { line: 3, reason: "Missing description" },
      { line: 4, reason: "Missing amount" },
      { line: 5, reason: "Missing amount" },
      { line: 6, reason: "Unreadable date" },
    ]);
  });

  it("strips a byte-order mark and trims headers", () => {
    const result = csv.parse(["﻿ Date , Description , Amount ", "2026-10-01,X,-1"].join("\n"), noRules);
    assert.equal(result.columns.date, "Date");
    assert.equal(result.rows.length, 1);
  });

  it("applies learned category rules by merchant key", () => {
    const rules = new Map<string, CategoryId>([["amazon", "business"]]);
    const result = csv.parse(["Date,Description,Amount", "2026-10-01,AMAZON MKTPLACE 1234,-30", "2026-10-02,Jumia,-10"].join("\n"), rules);
    assert.equal(result.rows[0].merchantKey, "amazon");
    assert.equal(result.rows[0].category, "business");
    assert.equal(result.rows[0].learned, true);
    assert.equal(result.rows[1].learned, false);
  });

  it("keeps the original row for auditing", () => {
    const result = csv.parse(["Date,Description,Amount,Ref", "2026-10-01,X,-1,abc"].join("\n"), noRules);
    assert.deepEqual(result.rows[0].raw, { Date: "2026-10-01", Description: "X", Amount: "-1", Ref: "abc" });
  });

  it("reads the closing balance from the latest row, whichever way the statement is sorted", () => {
    const oldestFirst = csv.parse(
      ["Date,Description,Debit,Credit,Balance", "01/10/2026,A,10,,990", "03/10/2026,B,,500,1490", "03/10/2026,C,40,,1450"].join("\n"),
      noRules,
    );
    assert.equal(oldestFirst.columns.balance, "Balance");
    assert.equal(oldestFirst.closingBalance, 1450);

    const newestFirst = csv.parse(
      ["Date,Description,Amount,Running Balance", "2026-10-03,C,-40,1450", "2026-10-03,B,500,1490", "2026-10-01,A,-10,990"].join("\n"),
      noRules,
    );
    assert.equal(newestFirst.closingBalance, 1450);
  });

  it("reads overdrawn balances and ignores opening-balance columns", () => {
    const overdrawn = csv.parse(["Date,Description,Amount,Balance", "2026-10-01,Rent,-500,\"(120.50)\""].join("\n"), noRules);
    assert.equal(overdrawn.closingBalance, -120.5);

    const opening = csv.parse(["Date,Description,Amount,Opening Balance", "2026-10-01,X,-1,100"].join("\n"), noRules);
    assert.equal(opening.columns.balance, undefined);
    assert.equal(opening.closingBalance, null);
  });

  it("leaves the closing balance unknown when the latest row has none", () => {
    const result = csv.parse(["Date,Description,Amount,Balance", "2026-10-01,X,-1,99", "2026-10-02,Y,-1,"].join("\n"), noRules);
    assert.equal(result.closingBalance, null);
  });

  it("rejects files without date, description and amount columns", () => {
    assert.throws(
      () => csv.parse(["Foo,Bar", "1,2"].join("\n"), noRules),
      (err: unknown) => err instanceof AppError && err.code === "csv_columns_not_found" && err.getStatus() === 400,
    );
  });
});
