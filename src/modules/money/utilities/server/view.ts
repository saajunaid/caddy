/** How each contract's 14-day state reads on screen. Tones are meaning colours only. Pure. */
import { dueState, type DueState } from "./due.ts";
import { shortDate } from "./format.ts";

export type Tone = "ok" | "due" | "bad" | "review" | "info" | "neutral";

export type DueDisplay = {
  tone: Tone;
  /** Short chip text, e.g. "Comparison due today". */
  chip: string;
  /** One line, e.g. "Ends 3 Nov 2026 · comparison due 20 Oct 2026". */
  detail: string;
  /** Days until the contract ends, for the countdown, when it hasn't ended. */
  daysLeft: number | null;
};

function days(n: number): string {
  return `${n} day${n === 1 ? "" : "s"}`;
}

export function dueDisplay(
  state: DueState,
  status: string = "active",
): DueDisplay {
  if (status === "switching") {
    return {
      tone: "info",
      chip: "Switching",
      detail:
        state.kind === "unknown_end"
          ? "End date unknown"
          : `Ends ${shortDate(state.end)}`,
      daysLeft: null,
    };
  }
  if (status === "ended") {
    return {
      tone: "neutral",
      chip: "Ended",
      detail:
        state.kind === "unknown_end"
          ? "No end date"
          : `Ended ${shortDate(state.end)}`,
      daysLeft: null,
    };
  }
  switch (state.kind) {
    case "unknown_end":
      return {
        tone: "review",
        chip: "Unknown end date",
        detail: "Add the end date and Caddy reminds you 14 days before it.",
        daysLeft: null,
      };
    case "not_due":
      return {
        tone: "neutral",
        chip: `Compare in ${days(state.daysUntilDue)}`,
        detail: `Ends ${shortDate(state.end)} · comparison due ${shortDate(state.dueOn)}`,
        daysLeft: state.daysUntilEnd,
      };
    case "due":
      return {
        tone: "due",
        chip: "Comparison due today",
        detail: `Ends ${shortDate(state.end)} · comparison due today`,
        daysLeft: state.daysUntilEnd,
      };
    case "late":
      return {
        tone: "due",
        chip: `Comparison due ${days(state.daysLate)} ago`,
        detail: `Ends ${shortDate(state.end)} · comparison was due ${shortDate(state.dueOn)}`,
        daysLeft: state.daysUntilEnd,
      };
    case "ended":
      return {
        tone: "review",
        chip: "Ended · update it",
        detail: `Ended ${shortDate(state.end)}. Enter the new end date or mark it ended.`,
        daysLeft: null,
      };
  }
}

/** The active contract ending soonest (and not yet ended), for the countdown card. */
export function mostUrgent<
  T extends { contract_end: string | null; status: string },
>(contracts: readonly T[], today: string): T | null {
  let best: { contract: T; daysLeft: number } | null = null;
  for (const contract of contracts) {
    if (contract.status !== "active") continue;
    const display = dueDisplay(dueState(contract.contract_end, today));
    if (display.daysLeft === null) continue;
    if (!best || display.daysLeft < best.daysLeft) {
      best = { contract, daysLeft: display.daysLeft };
    }
  }
  return best?.contract ?? null;
}
