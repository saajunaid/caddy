// Whole-family cost of one candidate. Pure, no I/O.
// Every component is converted to euro cents with its own dated rate; components that can't
// be converted are left out of the total and flagged, never guessed.
import { dublinDate, type IsoDate } from "../../../server/domain/dates.ts";
import {
  formatEur,
  noRateMessage,
  pickRate,
  toEurCents,
  type FxRate,
} from "./currency.ts";
import type { BoardBasis, ComponentKind } from "./labels.ts";

export type Component = {
  id: string;
  kind: ComponentKind;
  provider: string | null;
  description: string | null;
  priceMinor: number;
  currency: string;
  /** The rate pinned when the price was saved, if any. */
  fxRate: FxRate | null;
  isEstimate: boolean;
  includes: string | null;
  excludes: string | null;
  bookingUrl: string | null;
  cancellationTerms: string | null;
  freeCancellation: boolean | null;
  boardBasis: BoardBasis | null;
  stops: number | null;
  durationMinutes: number | null;
  /** ISO timestamp. */
  checkedAt: string;
};

export type ComponentLine = {
  component: Component;
  /** Null when there's no rate to convert it. */
  eurCents: number | null;
  /** The rate used (null for euro prices and unconvertible ones). */
  rate: FxRate | null;
  /** Dublin calendar date the price was checked. */
  checkedOn: IsoDate;
  problem: string | null;
};

export type BudgetStatus =
  | { status: "within"; remainingCents: number }
  | { status: "over"; overCents: number };

export type CandidateTotal = {
  lines: ComponentLine[];
  totalCents: number;
  /** False when at least one price couldn't be converted and is missing from the total. */
  complete: boolean;
  /** How many prices are in the euro total. */
  converted: number;
  perPersonCents: number | null;
  estimateCents: number;
  budget: BudgetStatus | null;
  includes: string[];
  excludes: string[];
  /** Oldest checked date among the components, if any. */
  oldestCheck: IsoDate | null;
};

/** The rate a component converts with: its pinned rate, else the latest on or before its checked date. */
export function rateFor(
  component: Component,
  rates: readonly FxRate[],
): FxRate | null {
  if (component.currency === "EUR") return null;
  if (component.fxRate && component.fxRate.currency === component.currency)
    return component.fxRate;
  return pickRate(
    rates,
    component.currency,
    dublinDate(new Date(component.checkedAt)),
  );
}

export function lineFor(
  component: Component,
  rates: readonly FxRate[],
): ComponentLine {
  const checkedOn = dublinDate(new Date(component.checkedAt));
  if (component.currency === "EUR") {
    return {
      component,
      eurCents: component.priceMinor,
      rate: null,
      checkedOn,
      problem: null,
    };
  }
  const rate = rateFor(component, rates);
  if (!rate) {
    return {
      component,
      eurCents: null,
      rate: null,
      checkedOn,
      problem: noRateMessage(component.currency, checkedOn),
    };
  }
  return {
    component,
    eurCents: toEurCents(component.priceMinor, component.currency, rate.rate),
    rate,
    checkedOn,
    problem: null,
  };
}

/** Round half-up division for non-negative integers. */
function divideRounded(value: number, by: number): number {
  const v = BigInt(value);
  const d = BigInt(by);
  return Number((v * 2n + d) / (d * 2n));
}

function uniqueTexts(values: readonly (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value?.trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
}

export function candidateTotal(
  components: readonly Component[],
  rates: readonly FxRate[],
  options: { travellers: number; budgetCents: number | null },
): CandidateTotal {
  const lines = components.map((c) => lineFor(c, rates));
  let totalCents = 0;
  let estimateCents = 0;
  for (const line of lines) {
    if (line.eurCents === null) continue;
    totalCents += line.eurCents;
    if (line.component.isEstimate) estimateCents += line.eurCents;
  }
  const complete = lines.every((l) => l.eurCents !== null);
  const budgetCents = options.budgetCents;
  const converted = lines.filter((l) => l.eurCents !== null).length;
  // "Within budget" is only known when every price converted; "over" is known regardless.
  const budget: BudgetStatus | null =
    budgetCents === null || converted === 0
      ? null
      : totalCents > budgetCents
        ? { status: "over", overCents: totalCents - budgetCents }
        : complete
          ? { status: "within", remainingCents: budgetCents - totalCents }
          : null;
  const checkedDates = lines.map((l) => l.checkedOn).sort();
  return {
    lines,
    totalCents,
    complete,
    converted,
    perPersonCents:
      options.travellers > 0 && converted > 0
        ? divideRounded(totalCents, options.travellers)
        : null,
    estimateCents,
    budget,
    includes: uniqueTexts(components.map((c) => c.includes)),
    excludes: uniqueTexts(components.map((c) => c.excludes)),
    oldestCheck: checkedDates[0] ?? null,
  };
}

/** "€350 of €2,681 is estimated", or null when nothing is. */
export function estimateShare(total: CandidateTotal): string | null {
  if (total.estimateCents === 0) return null;
  if (total.estimateCents === total.totalCents)
    return `All of ${formatEur(total.totalCents)} is estimated`;
  return `${formatEur(total.estimateCents)} of ${formatEur(total.totalCents)} is estimated`;
}

/** "within budget (€519 to spare)" / "over budget by €212". */
export function budgetText(budget: BudgetStatus): string {
  return budget.status === "within"
    ? `within budget (${formatEur(budget.remainingCents)} to spare)`
    : `over budget by ${formatEur(budget.overCents)}`;
}
