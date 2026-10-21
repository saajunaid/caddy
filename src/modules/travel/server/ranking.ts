// Hard constraints, ranking by total cost and the adjustable score. Pure, no I/O.
// Order is always by total euro cost among options that meet the brief. The weighted score is
// shown alongside and never reorders or hides a cheaper option; trade-offs are spelled out.
import type { IsoDate } from "../../../server/domain/dates.ts";
import { formatEur, formatShortDate } from "./currency.ts";
import {
  BOARD_LABELS,
  formatDateRange,
  formatDuration,
  type BoardBasis,
  type CandidateStatus,
  type TripBoardBasis,
} from "./labels.ts";
import type { CandidateTotal, Component } from "./totals.ts";

export type Brief = {
  dateFrom: IsoDate;
  dateTo: IsoDate;
  nightsMin: number | null;
  nightsMax: number | null;
  boardBasis: TripBoardBasis;
  maxStops: number | null;
  maxFlightMinutes: number | null;
  requireFreeCancellation: boolean;
};

export type CandidateInput = {
  id: string;
  destination: string;
  outboundDate: IsoDate;
  returnDate: IsoDate;
  nights: number;
  status: CandidateStatus;
  components: readonly Component[];
  total: CandidateTotal;
};

export type CheckStatus = "pass" | "fail" | "unknown";
export type ConstraintKey =
  "dates" | "nights" | "board" | "stops" | "flight_time" | "cancellation";
export type ConstraintCheck = {
  key: ConstraintKey;
  status: CheckStatus;
  message: string;
};

const MEAL_LEVEL: Record<BoardBasis, number> = {
  room_only: 0,
  self_catering: 0,
  breakfast: 1,
  half_board: 2,
  full_board: 3,
  all_inclusive: 4,
};

/** Whether accommodation booked on `actual` meets a brief asking for `required`. */
export function boardMeets(
  required: TripBoardBasis,
  actual: BoardBasis,
): boolean {
  if (required === "any" || required === "room_only") return true;
  if (required === "self_catering") return actual === "self_catering";
  return MEAL_LEVEL[actual] >= MEAL_LEVEL[required];
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Checks every hard constraint the brief sets. Unknown (not entered) is never a failure. */
export function checkConstraints(
  brief: Brief,
  candidate: Pick<
    CandidateInput,
    "outboundDate" | "returnDate" | "nights" | "components"
  >,
): ConstraintCheck[] {
  const checks: ConstraintCheck[] = [];
  const inWindow =
    candidate.outboundDate >= brief.dateFrom &&
    candidate.returnDate <= brief.dateTo;
  checks.push({
    key: "dates",
    status: inWindow ? "pass" : "fail",
    message: inWindow
      ? "Dates fit the trip window"
      : `Dates ${formatDateRange(candidate.outboundDate, candidate.returnDate)} fall outside the trip window ${formatDateRange(brief.dateFrom, brief.dateTo)}`,
  });

  if (brief.nightsMin !== null || brief.nightsMax !== null) {
    const ok =
      (brief.nightsMin === null || candidate.nights >= brief.nightsMin) &&
      (brief.nightsMax === null || candidate.nights <= brief.nightsMax);
    const allowed =
      brief.nightsMin !== null && brief.nightsMax !== null
        ? brief.nightsMin === brief.nightsMax
          ? `${brief.nightsMin}`
          : `${brief.nightsMin}–${brief.nightsMax}`
        : brief.nightsMin !== null
          ? `at least ${brief.nightsMin}`
          : `at most ${brief.nightsMax}`;
    checks.push({
      key: "nights",
      status: ok ? "pass" : "fail",
      message: ok
        ? `${candidate.nights} nights`
        : `${candidate.nights} nights; the brief allows ${allowed}`,
    });
  }

  const stays = candidate.components.filter((c) => c.kind === "accommodation");
  const flights = candidate.components.filter((c) => c.kind === "flight");

  if (brief.boardBasis !== "any") {
    const known = stays.filter((s) => s.boardBasis !== null);
    const needed = lower(BOARD_LABELS[brief.boardBasis]);
    if (known.length === 0) {
      checks.push({
        key: "board",
        status: "unknown",
        message:
          stays.length === 0
            ? "No accommodation entered yet"
            : "Board basis not recorded",
      });
    } else {
      const meeting = known.find((s) =>
        boardMeets(brief.boardBasis, s.boardBasis as BoardBasis),
      );
      checks.push({
        key: "board",
        status: meeting ? "pass" : "fail",
        message: meeting
          ? BOARD_LABELS[meeting.boardBasis as BoardBasis]
          : `${BOARD_LABELS[known[0].boardBasis as BoardBasis]}; the brief needs ${needed}`,
      });
    }
  }

  const flightCheck = (
    key: "stops" | "flight_time",
    limit: number,
    value: (c: Component) => number | null,
    describe: (n: number) => string,
    noun: string,
  ) => {
    if (flights.length === 0) {
      checks.push({
        key,
        status: "unknown",
        message: "No flights entered yet",
      });
      return;
    }
    const values = flights.map(value);
    const known = values.filter((v): v is number => v !== null);
    const worst = known.length > 0 ? Math.max(...known) : null;
    if (worst !== null && worst > limit) {
      checks.push({
        key,
        status: "fail",
        message: `${describe(worst)}; the brief allows ${describe(limit)}`,
      });
    } else if (known.length < values.length) {
      checks.push({ key, status: "unknown", message: `${noun} not recorded` });
    } else {
      checks.push({ key, status: "pass", message: describe(worst ?? 0) });
    }
  };
  if (brief.maxStops !== null) {
    flightCheck(
      "stops",
      brief.maxStops,
      (c) => c.stops,
      (n) => (n === 0 ? "Direct" : `${n} stop${n === 1 ? "" : "s"}`),
      "Stops",
    );
  }
  if (brief.maxFlightMinutes !== null) {
    flightCheck(
      "flight_time",
      brief.maxFlightMinutes,
      (c) => c.durationMinutes,
      (n) => `${formatDuration(n)} flight`,
      "Flight time",
    );
  }

  if (brief.requireFreeCancellation) {
    if (stays.length === 0) {
      checks.push({
        key: "cancellation",
        status: "unknown",
        message: "No accommodation entered yet",
      });
    } else if (stays.some((s) => s.freeCancellation === false)) {
      const strict = stays.find((s) => s.freeCancellation === false);
      checks.push({
        key: "cancellation",
        status: "fail",
        message: `No free cancellation${strict?.provider ? ` (${strict.provider})` : ""}`,
      });
    } else if (stays.some((s) => s.freeCancellation === null)) {
      checks.push({
        key: "cancellation",
        status: "unknown",
        message: "Cancellation terms not recorded",
      });
    } else {
      checks.push({
        key: "cancellation",
        status: "pass",
        message: "Free cancellation",
      });
    }
  }
  return checks;
}

export type Weights = { cost: number; time: number; flexibility: number };
export const DEFAULT_WEIGHTS: Weights = { cost: 3, time: 1, flexibility: 1 };
export const MAX_WEIGHT = 5;

/** Weights from URL search params, clamped to 0–5 whole numbers. */
export function parseWeights(params: {
  [key: string]: string | string[] | undefined;
}): Weights {
  const read = (key: string, fallback: number) => {
    const raw = params[key];
    const value = Number(Array.isArray(raw) ? raw[0] : raw);
    return raw === undefined || !Number.isInteger(value)
      ? fallback
      : Math.min(MAX_WEIGHT, Math.max(0, value));
  };
  return {
    cost: read("wc", DEFAULT_WEIGHTS.cost),
    time: read("wt", DEFAULT_WEIGHTS.time),
    flexibility: read("wf", DEFAULT_WEIGHTS.flexibility),
  };
}

export type Score = {
  cost: number | null;
  time: number | null;
  flexibility: number | null;
  /** Weighted 0–100 over the parts that are known; null if none are. */
  overall: number | null;
};

export type Gaps = string[];

export type RankedCandidate = {
  candidate: CandidateInput;
  checks: ConstraintCheck[];
  /** 1-based rank by total cost among options meeting the brief; null otherwise. */
  rank: number | null;
  score: Score | null;
  tradeOffs: string[];
  /** Things missing that make the total or comparison incomplete. */
  gaps: Gaps;
};

export type Ranking = {
  ranked: RankedCandidate[];
  failing: RankedCandidate[];
  unpriced: RankedCandidate[];
  rejected: RankedCandidate[];
  /** Set when the best weighted score isn't the cheapest option. */
  scoreNote: string | null;
};

function longestFlight(c: CandidateInput): number | null {
  const flights = c.components.filter((x) => x.kind === "flight");
  if (flights.length === 0 || flights.some((f) => f.durationMinutes === null))
    return null;
  return Math.max(...flights.map((f) => f.durationMinutes as number));
}

function mostStops(c: CandidateInput): number | null {
  const flights = c.components.filter((x) => x.kind === "flight");
  if (flights.length === 0 || flights.some((f) => f.stops === null))
    return null;
  return Math.max(...flights.map((f) => f.stops as number));
}

/** true = all stays free to cancel, false = at least one isn't, null = unknown. */
function freeToCancel(c: CandidateInput): boolean | null {
  const stays = c.components.filter((x) => x.kind === "accommodation");
  if (stays.length === 0) return null;
  if (stays.some((s) => s.freeCancellation === false)) return false;
  if (stays.some((s) => s.freeCancellation === null)) return null;
  return true;
}

function boardOf(c: CandidateInput): BoardBasis | null {
  return (
    c.components.find((x) => x.kind === "accommodation" && x.boardBasis)
      ?.boardBasis ?? null
  );
}

function gapsOf(c: CandidateInput): Gaps {
  const gaps: Gaps = [];
  if (!c.components.some((x) => x.kind === "flight"))
    gaps.push("No flights entered yet");
  if (!c.components.some((x) => x.kind === "accommodation"))
    gaps.push("No accommodation entered yet");
  const unconverted = c.total.lines.filter((l) => l.eurCents === null).length;
  if (unconverted > 0)
    gaps.push(
      `Total leaves out ${unconverted} price${unconverted === 1 ? "" : "s"} that can't be converted`,
    );
  return gaps;
}

const ratio = (best: number, value: number) =>
  value <= 0 ? 100 : Math.round((best * 100) / value);

function scoreAll(list: RankedCandidate[], weights: Weights): void {
  const totals = list.map((r) => r.candidate.total.totalCents);
  const minTotal = Math.min(...totals);
  const durations = list
    .map((r) => longestFlight(r.candidate))
    .filter((d): d is number => d !== null);
  const minDuration = durations.length > 0 ? Math.min(...durations) : null;
  for (const r of list) {
    const duration = longestFlight(r.candidate);
    const flex = freeToCancel(r.candidate);
    const parts = {
      cost: ratio(minTotal, r.candidate.total.totalCents),
      time:
        duration !== null && minDuration !== null
          ? ratio(minDuration, duration)
          : null,
      flexibility: flex === null ? null : flex ? 100 : 0,
    };
    let weighted = 0;
    let weightSum = 0;
    for (const key of ["cost", "time", "flexibility"] as const) {
      const value = parts[key];
      if (value === null || weights[key] === 0) continue;
      weighted += value * weights[key];
      weightSum += weights[key];
    }
    r.score = {
      ...parts,
      overall: weightSum === 0 ? null : Math.round(weighted / weightSum),
    };
  }
}

/** Plain-language differences from the cheapest option. */
export function tradeOffs(
  candidate: CandidateInput,
  cheapest: CandidateInput,
): string[] {
  if (candidate.id === cheapest.id)
    return ["Cheapest option that meets the brief"];
  const out: string[] = [];
  const diff = candidate.total.totalCents - cheapest.total.totalCents;
  out.push(
    diff === 0
      ? `Same total as ${cheapest.destination}`
      : `${formatEur(diff)} more than ${cheapest.destination}`,
  );
  const [a, b] = [longestFlight(candidate), longestFlight(cheapest)];
  if (a !== null && b !== null && a !== b) {
    out.push(
      `Flight ${formatDuration(Math.abs(a - b))} ${a < b ? "shorter" : "longer"}`,
    );
  }
  const [sa, sb] = [mostStops(candidate), mostStops(cheapest)];
  if (sa !== null && sb !== null && sa !== sb) {
    const n = Math.abs(sa - sb);
    out.push(`${n} ${sa < sb ? "fewer" : "more"} stop${n === 1 ? "" : "s"}`);
  }
  const [fa, fb] = [freeToCancel(candidate), freeToCancel(cheapest)];
  if (fa === true && fb === false)
    out.push("Free cancellation (the cheapest has none)");
  if (fa === false && fb === true)
    out.push("No free cancellation (the cheapest has it)");
  const [ba, bb] = [boardOf(candidate), boardOf(cheapest)];
  if (ba && bb && ba !== bb) {
    out.push(`${BOARD_LABELS[ba]} vs ${lower(BOARD_LABELS[bb])}`);
  }
  return out;
}

const statusOrder = (s: CandidateStatus) =>
  s === "booked" ? 0 : s === "shortlisted" ? 1 : 2;

export function rankCandidates(
  brief: Brief,
  candidates: readonly CandidateInput[],
  weights: Weights = DEFAULT_WEIGHTS,
): Ranking {
  const ranking: Ranking = {
    ranked: [],
    failing: [],
    unpriced: [],
    rejected: [],
    scoreNote: null,
  };
  for (const candidate of candidates) {
    const entry: RankedCandidate = {
      candidate,
      checks: checkConstraints(brief, candidate),
      rank: null,
      score: null,
      tradeOffs: [],
      gaps: gapsOf(candidate),
    };
    if (candidate.status === "rejected") ranking.rejected.push(entry);
    else if (candidate.components.length === 0) ranking.unpriced.push(entry);
    else if (entry.checks.some((c) => c.status === "fail"))
      ranking.failing.push(entry);
    else ranking.ranked.push(entry);
  }
  const byTotal = (a: RankedCandidate, b: RankedCandidate) =>
    a.candidate.total.totalCents - b.candidate.total.totalCents ||
    statusOrder(a.candidate.status) - statusOrder(b.candidate.status) ||
    a.candidate.outboundDate.localeCompare(b.candidate.outboundDate) ||
    a.candidate.destination.localeCompare(b.candidate.destination);
  ranking.ranked.sort(byTotal);
  ranking.failing.sort(byTotal);
  ranking.ranked.forEach((r, i) => (r.rank = i + 1));

  const cheapest = ranking.ranked[0];
  if (cheapest) {
    scoreAll(ranking.ranked, weights);
    for (const r of ranking.ranked)
      r.tradeOffs = tradeOffs(r.candidate, cheapest.candidate);
    const best = ranking.ranked.reduce<RankedCandidate | null>(
      (top, r) =>
        r.score?.overall != null &&
        (top?.score?.overall == null || r.score.overall > top.score.overall)
          ? r
          : top,
      null,
    );
    if (best && best !== cheapest && best.score?.overall != null) {
      const extra =
        best.candidate.total.totalCents - cheapest.candidate.total.totalCents;
      ranking.scoreNote = `With your weights, ${best.candidate.destination} scores highest (${best.score.overall}) but costs ${formatEur(extra)} more than ${cheapest.candidate.destination}, the cheapest.`;
    }
  }
  for (const r of ranking.failing) {
    r.tradeOffs =
      cheapest && r.candidate.total.complete
        ? [
            `${formatEur(Math.abs(r.candidate.total.totalCents - cheapest.candidate.total.totalCents))} ${r.candidate.total.totalCents <= cheapest.candidate.total.totalCents ? "less" : "more"} than ${cheapest.candidate.destination}, but doesn't meet the brief`,
          ]
        : [];
  }
  return ranking;
}

/** "Checked 12 Oct" for the oldest price in a candidate. */
export function checkedLabel(total: CandidateTotal): string | null {
  return total.oldestCheck
    ? `checked ${formatShortDate(total.oldestCheck)}`
    : null;
}
