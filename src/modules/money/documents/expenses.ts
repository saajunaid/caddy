// Household spending summaries. Pure; never adds amounts in different currencies together.
import { MONTH_SHORT } from "./review.ts";

export type MonthlyTotal = {
  /** "2026-10" */
  month: string;
  currency: string;
  totalCents: number;
  count: number;
};

export function monthlyTotals(
  expenses: readonly {
    expenseDate: string;
    currency: string;
    amountCents: number;
  }[],
): MonthlyTotal[] {
  const totals = new Map<string, MonthlyTotal>();
  for (const e of expenses) {
    const month = e.expenseDate.slice(0, 7);
    const key = `${month}|${e.currency}`;
    const current = totals.get(key) ?? {
      month,
      currency: e.currency,
      totalCents: 0,
      count: 0,
    };
    current.totalCents += e.amountCents;
    current.count += 1;
    if (!Number.isSafeInteger(current.totalCents))
      throw new Error("Total out of range");
    totals.set(key, current);
  }
  return [...totals.values()].sort(
    (a, b) =>
      b.month.localeCompare(a.month) || a.currency.localeCompare(b.currency),
  );
}

/** "2026-10" → "Oct 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}
