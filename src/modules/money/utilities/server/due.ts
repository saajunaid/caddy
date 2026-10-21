/**
 * The 14-day rule (PLAN §7.3, SPEC §6): compare offers exactly 14 calendar days before a
 * contract ends. Never monthly. Date-only maths, so daylight saving can't shift it. Pure.
 */
import {
  addDays,
  daysBetween,
  type IsoDate,
} from "../../../../server/domain/dates.ts";
import { shortDate } from "./format.ts";
import { UTILITY_TYPE_LABELS, type UtilityType } from "./types.ts";

export const COMPARISON_LEAD_DAYS = 14;

/** The day the comparison is due: contract end − 14 calendar days. */
export function comparisonDueOn(contractEnd: IsoDate): IsoDate {
  return addDays(contractEnd, -COMPARISON_LEAD_DAYS);
}

export type DueState =
  /** No end date stored: ask the household for it. */
  | { kind: "unknown_end" }
  /** Before the due date. */
  | {
      kind: "not_due";
      end: IsoDate;
      dueOn: IsoDate;
      daysUntilDue: number;
      daysUntilEnd: number;
    }
  /** Today is the due date. */
  | { kind: "due"; end: IsoDate; dueOn: IsoDate; daysUntilEnd: number }
  /** Past the due date but the contract hasn't ended: alert once and say it's late. */
  | {
      kind: "late";
      end: IsoDate;
      dueOn: IsoDate;
      daysUntilEnd: number;
      daysLate: number;
    }
  /** The end date has passed: flag once for review, never a flood. */
  | { kind: "ended"; end: IsoDate; daysSinceEnd: number };

export function dueState(
  contractEnd: IsoDate | null,
  today: IsoDate,
): DueState {
  if (!contractEnd) return { kind: "unknown_end" };
  const dueOn = comparisonDueOn(contractEnd);
  const daysUntilEnd = daysBetween(today, contractEnd);
  if (daysUntilEnd < 0) {
    return { kind: "ended", end: contractEnd, daysSinceEnd: -daysUntilEnd };
  }
  const daysUntilDue = daysBetween(today, dueOn);
  if (daysUntilDue > 0) {
    return {
      kind: "not_due",
      end: contractEnd,
      dueOn,
      daysUntilDue,
      daysUntilEnd,
    };
  }
  if (daysUntilDue === 0) {
    return { kind: "due", end: contractEnd, dueOn, daysUntilEnd };
  }
  return {
    kind: "late",
    end: contractEnd,
    dueOn,
    daysUntilEnd,
    daysLate: -daysUntilDue,
  };
}

/** Whether a comparison should be on screen now (the 14-day window up to the end date). */
export function inComparisonWindow(state: DueState): boolean {
  return state.kind === "due" || state.kind === "late";
}

export type ContractForDue = {
  id: string;
  householdId: string;
  utilityType: UtilityType;
  supplier: string;
  contractEnd: IsoDate | null;
  status: string;
};

export type DueAlert = {
  householdId: string;
  contractId: string;
  state: DueState["kind"];
  kind: "utilities.due" | "utilities.ended" | "utilities.unknown_end";
  severity: "info" | "warning";
  title: string;
  body: string;
  actionUrl: string;
  /** Same key = same alert. Keys include the end date, so changing it re-arms the alert. */
  dedupeKey: string;
  push: boolean;
};

export const dedupeKeys = {
  due: (contractId: string, end: IsoDate) =>
    `utilities:due:${contractId}:${end}`,
  ended: (contractId: string, end: IsoDate) =>
    `utilities:ended:${contractId}:${end}`,
  unknownEnd: (contractId: string) => `utilities:unknown-end:${contractId}`,
};

function endsIn(days: number): string {
  if (days === 0) return "ends today";
  if (days === 1) return "ends tomorrow";
  return `ends in ${days} days`;
}

/** The one alert a contract needs today, or null. Only active contracts are checked. */
export function dueAlert(
  contract: ContractForDue,
  today: IsoDate,
): DueAlert | null {
  if (contract.status !== "active") return null;
  const state = dueState(contract.contractEnd, today);
  const type = UTILITY_TYPE_LABELS[contract.utilityType];
  const base = {
    householdId: contract.householdId,
    contractId: contract.id,
    state: state.kind,
    actionUrl: `/money/utilities/${contract.id}`,
  };
  switch (state.kind) {
    case "not_due":
      return null;
    case "due":
    case "late": {
      const when =
        state.kind === "due"
          ? "The comparison is due today."
          : `The comparison was due on ${shortDate(state.dueOn)}; this reminder is ${state.daysLate} day${state.daysLate === 1 ? "" : "s"} late.`;
      return {
        ...base,
        kind: "utilities.due",
        severity: "warning",
        title: `${type} contract ${endsIn(state.daysUntilEnd)}: compare offers`,
        body: `${contract.supplier} · ends ${shortDate(state.end)}. ${when} Add offers from bonkers.ie or switcher.ie and Caddy works out the first-year cost with your usage.`,
        dedupeKey: dedupeKeys.due(contract.id, state.end),
        push: true,
      };
    }
    case "ended":
      return {
        ...base,
        kind: "utilities.ended",
        severity: "warning",
        title: `${type} contract with ${contract.supplier} ended on ${shortDate(state.end)}: update it`,
        body: "Enter the new contract's end date, or mark this one as ended or switching, so the next reminder is right.",
        dedupeKey: dedupeKeys.ended(contract.id, state.end),
        push: true,
      };
    case "unknown_end":
      return {
        ...base,
        kind: "utilities.unknown_end",
        severity: "info",
        title: `Add the end date for your ${type.toLowerCase()} contract with ${contract.supplier}`,
        body: "Caddy reminds you 14 days before a contract ends. The date is usually on your welcome letter or in your supplier account.",
        dedupeKey: dedupeKeys.unknownEnd(contract.id),
        push: false,
      };
  }
}
