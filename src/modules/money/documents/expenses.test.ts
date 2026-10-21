import { describe, expect, it } from "vitest";
import { monthLabel, monthlyTotals } from "./expenses";

describe("monthlyTotals", () => {
  it("sums per month, newest first, in cents", () => {
    expect(
      monthlyTotals([
        { expenseDate: "2026-09-05", currency: "EUR", amountCents: 38053 },
        { expenseDate: "2026-10-03", currency: "EUR", amountCents: 21248 },
        { expenseDate: "2026-10-14", currency: "EUR", amountCents: 6415 },
      ]),
    ).toEqual([
      { month: "2026-10", currency: "EUR", totalCents: 27663, count: 2 },
      { month: "2026-09", currency: "EUR", totalCents: 38053, count: 1 },
    ]);
  });

  it("keeps currencies apart", () => {
    const totals = monthlyTotals([
      { expenseDate: "2026-10-03", currency: "EUR", amountCents: 100 },
      { expenseDate: "2026-10-04", currency: "GBP", amountCents: 200 },
    ]);
    expect(totals).toHaveLength(2);
  });

  it("labels months", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
  });
});
