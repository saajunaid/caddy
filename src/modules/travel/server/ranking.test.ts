import { describe, expect, it } from "vitest";
import {
  boardMeets,
  checkConstraints,
  parseWeights,
  rankCandidates,
  type Brief,
} from "./ranking";
import { candidate, component } from "./test-fixtures";

const brief: Brief = {
  dateFrom: "2027-02-14",
  dateTo: "2027-02-22",
  nightsMin: 6,
  nightsMax: 7,
  boardBasis: "any",
  maxStops: null,
  maxFlightMinutes: null,
  requireFreeCancellation: false,
};

const flight = (price: number, extra = {}) =>
  component({ kind: "flight", priceMinor: price, ...extra });
const stay = (price: number, extra = {}) =>
  component({ kind: "accommodation", priceMinor: price, ...extra });

describe("hard constraints", () => {
  it("require the dates inside the window and nights in range", () => {
    const early = checkConstraints(brief, {
      outboundDate: "2027-02-12",
      returnDate: "2027-02-18",
      nights: 6,
      components: [],
    });
    expect(early.find((c) => c.key === "dates")).toMatchObject({
      status: "fail",
      message:
        "Dates 12–18 Feb 2027 fall outside the trip window 14–22 Feb 2027",
    });
    const long = checkConstraints(brief, {
      outboundDate: "2027-02-14",
      returnDate: "2027-02-22",
      nights: 8,
      components: [],
    });
    expect(long.find((c) => c.key === "nights")).toMatchObject({
      status: "fail",
      message: "8 nights; the brief allows 6–7",
    });
  });

  it("treat board basis as a minimum meal plan", () => {
    expect(boardMeets("half_board", "all_inclusive")).toBe(true);
    expect(boardMeets("half_board", "breakfast")).toBe(false);
    expect(boardMeets("self_catering", "all_inclusive")).toBe(false);
    expect(boardMeets("room_only", "breakfast")).toBe(true);
    const checks = checkConstraints(
      { ...brief, boardBasis: "half_board" },
      {
        outboundDate: "2027-02-14",
        returnDate: "2027-02-20",
        nights: 6,
        components: [stay(100, { boardBasis: "breakfast" })],
      },
    );
    expect(checks.find((c) => c.key === "board")).toMatchObject({
      status: "fail",
      message: "Breakfast; the brief needs half board",
    });
  });

  it("report missing details as unknown, never as a failure", () => {
    const checks = checkConstraints(
      {
        ...brief,
        boardBasis: "half_board",
        maxStops: 0,
        maxFlightMinutes: 240,
        requireFreeCancellation: true,
      },
      {
        outboundDate: "2027-02-14",
        returnDate: "2027-02-20",
        nights: 6,
        components: [flight(100), stay(100)],
      },
    );
    expect(
      checks.filter((c) => c.status === "unknown").map((c) => c.message),
    ).toEqual([
      "Board basis not recorded",
      "Stops not recorded",
      "Flight time not recorded",
      "Cancellation terms not recorded",
    ]);
  });

  it("check stops, flight time and free cancellation when entered", () => {
    const checks = checkConstraints(
      {
        ...brief,
        maxStops: 0,
        maxFlightMinutes: 240,
        requireFreeCancellation: true,
      },
      {
        outboundDate: "2027-02-14",
        returnDate: "2027-02-20",
        nights: 6,
        components: [
          flight(100, { stops: 1, durationMinutes: 290 }),
          stay(100, { freeCancellation: false, provider: "Hotel Sol" }),
        ],
      },
    );
    expect(
      checks.filter((c) => c.status === "fail").map((c) => c.message),
    ).toEqual([
      "1 stop; the brief allows Direct",
      "4h 50m flight; the brief allows 4h 00m flight",
      "No free cancellation (Hotel Sol)",
    ]);
  });
});

describe("ranking", () => {
  it("orders options meeting the brief by total cost", () => {
    const ranking = rankCandidates(brief, [
      candidate("Tenerife", [flight(103600), stay(98000)]),
      candidate("Albufeira", [flight(61200), stay(176400)]),
      candidate("Antalya", [flight(118000), stay(169000)]),
    ]);
    expect(ranking.ranked.map((r) => [r.rank, r.candidate.id])).toEqual([
      [1, "Tenerife"],
      [2, "Albufeira"],
      [3, "Antalya"],
    ]);
    expect(ranking.ranked[0].tradeOffs).toEqual([
      "Cheapest option that meets the brief",
    ]);
    expect(ranking.ranked[1].tradeOffs[0]).toBe("€360 more than Tenerife");
  });

  it("shows options that fail the brief separately with the reason", () => {
    const ranking = rankCandidates(brief, [
      candidate("Albufeira", [flight(200000)]),
      candidate("Cheap but long", [flight(50000)], {
        returnDate: "2027-02-23",
        nights: 9,
      }),
    ]);
    expect(ranking.ranked.map((r) => r.candidate.id)).toEqual(["Albufeira"]);
    expect(ranking.failing.map((r) => r.candidate.id)).toEqual([
      "Cheap but long",
    ]);
    expect(
      ranking.failing[0].checks.filter((c) => c.status === "fail"),
    ).toHaveLength(2);
    expect(ranking.failing[0].tradeOffs).toEqual([
      "€1,500 less than Albufeira, but doesn't meet the brief",
    ]);
  });

  it("keeps rejected and unpriced options out of the ranking", () => {
    const ranking = rankCandidates(brief, [
      candidate("Rejected", [flight(1)], { status: "rejected" }),
      candidate("Empty", []),
      candidate("Priced", [flight(100)]),
    ]);
    expect(ranking.ranked.map((r) => r.candidate.id)).toEqual(["Priced"]);
    expect(ranking.rejected.map((r) => r.candidate.id)).toEqual(["Rejected"]);
    expect(ranking.unpriced.map((r) => r.candidate.id)).toEqual(["Empty"]);
  });

  it("flags gaps that make a total incomplete", () => {
    const ranking = rankCandidates(brief, [
      candidate("Flights only", [
        flight(100),
        component({ currency: "TRY", priceMinor: 100 }),
      ]),
    ]);
    expect(ranking.ranked[0].gaps).toEqual([
      "No accommodation entered yet",
      "Total leaves out 1 price that can't be converted",
    ]);
  });

  it("scores with weights but never reorders by score", () => {
    const options = [
      candidate("Cheap", [
        flight(100000, { durationMinutes: 300, stops: 1 }),
        stay(100000, { freeCancellation: false, boardBasis: "half_board" }),
      ]),
      candidate("Comfy", [
        flight(120000, { durationMinutes: 150, stops: 0 }),
        stay(105000, { freeCancellation: true, boardBasis: "all_inclusive" }),
      ]),
    ];
    const costOnly = rankCandidates(brief, options, {
      cost: 1,
      time: 0,
      flexibility: 0,
    });
    expect(costOnly.ranked.map((r) => r.score?.overall)).toEqual([100, 89]);
    expect(costOnly.scoreNote).toBeNull();

    const comfort = rankCandidates(brief, options, {
      cost: 1,
      time: 3,
      flexibility: 3,
    });
    expect(comfort.ranked.map((r) => r.candidate.id)).toEqual([
      "Cheap",
      "Comfy",
    ]);
    expect(comfort.ranked[0].score).toEqual({
      cost: 100,
      time: 50,
      flexibility: 0,
      overall: 36,
    });
    expect(comfort.ranked[1].score?.overall).toBe(98);
    expect(comfort.scoreNote).toBe(
      "With your weights, Comfy scores highest (98) but costs €250 more than Cheap, the cheapest.",
    );
    expect(comfort.ranked[1].tradeOffs).toEqual([
      "€250 more than Cheap",
      "Flight 2h 30m shorter",
      "1 fewer stop",
      "Free cancellation (the cheapest has none)",
      "All inclusive vs half board",
    ]);
  });

  it("leaves unknown score parts out of the weighting", () => {
    const ranking = rankCandidates(
      brief,
      [candidate("A", [flight(100)]), candidate("B", [flight(200)])],
      { cost: 1, time: 5, flexibility: 5 },
    );
    expect(ranking.ranked[1].score).toEqual({
      cost: 50,
      time: null,
      flexibility: null,
      overall: 50,
    });
  });

  it("reads weights from the URL safely", () => {
    expect(parseWeights({})).toEqual({ cost: 3, time: 1, flexibility: 1 });
    expect(parseWeights({ wc: "9", wt: "-2", wf: "x" })).toEqual({
      cost: 5,
      time: 0,
      flexibility: 1,
    });
  });
});
