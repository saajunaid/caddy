/** Display helpers for the Utilities module. Deterministic (no locale data), pure. */
import { formatMoney } from "../../../../server/domain/money.ts";
import type { IsoDate } from "../../../../server/domain/dates.ts";
import { round, toDecimalString, type Exact } from "./exact.ts";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

function parts(date: IsoDate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** "3 Nov 2026". */
export function shortDate(date: IsoDate): string {
  const { y, m, d } = parts(date);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "3 Nov". */
export function dayMonth(date: IsoDate): string {
  const { m, d } = parts(date);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Sept 2025". */
export function monthYear(date: IsoDate): string {
  const { y, m } = parts(date);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Sept 2025–Aug 2026", or "Sept 2025" when both fall in the same month. */
export function monthRange(from: IsoDate, to: IsoDate): string {
  const a = monthYear(from);
  const b = monthYear(to);
  return a === b ? a : `${a}–${b}`;
}

function groupThousands(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Whole kWh with thousands separators: "4,920". */
export function formatKwh(value: Exact): string {
  return groupThousands(String(round(value)));
}

/** Unit rate in cents, two to four decimals: "34.20c". */
export function formatRate(value: Exact): string {
  const text = toDecimalString(value, 4);
  const [whole, fraction = ""] = text.split(".");
  return `${whole}.${fraction.padEnd(2, "0")}c`;
}

/** "22%" or "12.5%". */
export function formatPercent(value: Exact): string {
  return `${toDecimalString(value, 2)}%`;
}

export function euros(cents: number, wholeUnits = false): string {
  return formatMoney(cents, "EUR", { wholeUnits });
}

/** "1 day", "3 days". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${groupThousands(String(count))} ${Math.abs(count) === 1 ? one : many}`;
}
