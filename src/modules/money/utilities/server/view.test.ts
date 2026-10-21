import { describe, expect, it } from "vitest";
import { dueState } from "./due";
import { dueDisplay, mostUrgent } from "./view";

describe("dueDisplay", () => {
  const end = "2026-11-03";

  it("counts down in neutral before the due date", () => {
    expect(dueDisplay(dueState(end, "2026-10-15"))).toEqual({
      tone: "neutral",
      chip: "Compare in 5 days",
      detail: "Ends 3 Nov 2026 · comparison due 20 Oct 2026",
      daysLeft: 19,
    });
  });

  it("shows due today and late in orange", () => {
    expect(dueDisplay(dueState(end, "2026-10-20"))).toMatchObject({
      tone: "due",
      chip: "Comparison due today",
      daysLeft: 14,
    });
    expect(dueDisplay(dueState(end, "2026-10-21"))).toMatchObject({
      tone: "due",
      chip: "Comparison due 1 day ago",
    });
  });

  it("asks for review in yellow when the end date is unknown or passed", () => {
    expect(dueDisplay(dueState(null, "2026-10-21"))).toMatchObject({
      tone: "review",
      chip: "Unknown end date",
    });
    expect(dueDisplay(dueState(end, "2026-11-10"))).toMatchObject({
      tone: "review",
      chip: "Ended · update it",
      daysLeft: null,
    });
  });

  it("respects switching and ended statuses", () => {
    expect(dueDisplay(dueState(end, "2026-10-20"), "switching").chip).toBe(
      "Switching",
    );
    expect(dueDisplay(dueState(end, "2026-11-10"), "ended").tone).toBe(
      "neutral",
    );
  });
});

describe("mostUrgent", () => {
  it("picks the active contract ending soonest", () => {
    const contracts = [
      { id: "gas", contract_end: "2027-03-14", status: "active" },
      { id: "elec", contract_end: "2026-11-03", status: "active" },
      { id: "old", contract_end: "2026-10-01", status: "active" },
      { id: "sw", contract_end: "2026-10-25", status: "switching" },
      { id: "bb", contract_end: null, status: "active" },
    ];
    expect(mostUrgent(contracts, "2026-10-20")?.id).toBe("elec");
    expect(mostUrgent([contracts[4]], "2026-10-20")).toBeNull();
  });
});
