import { describe, expect, it } from "vitest";
import { dublinDate } from "@/server/domain/dates";
import {
  comparisonDueOn,
  dedupeKeys,
  dueAlert,
  dueState,
  inComparisonWindow,
  type ContractForDue,
} from "./due";

describe("comparisonDueOn", () => {
  it.each([
    ["2026-11-03", "2026-10-20", "exactly 14 days"],
    ["2026-12-01", "2026-11-17", "month boundary"],
    ["2027-01-05", "2026-12-22", "year boundary"],
    ["2028-03-10", "2028-02-25", "leap year: 29 Feb counted"],
    ["2028-03-14", "2028-02-29", "lands on 29 Feb"],
    ["2027-03-14", "2027-02-28", "non-leap February"],
    ["2026-11-03", "2026-10-20", "clocks go back 25 Oct 2026 in between"],
    ["2027-04-10", "2027-03-27", "clocks go forward 28 Mar 2027 in between"],
    ["2027-03-28", "2027-03-14", "ends on the DST change day"],
  ])("end %s → due %s (%s)", (end, due) => {
    expect(comparisonDueOn(end)).toBe(due);
  });
});

describe("dueState", () => {
  const end = "2026-11-03";

  it("asks for the end date when it's unknown", () => {
    expect(dueState(null, "2026-10-21")).toEqual({ kind: "unknown_end" });
  });

  it("counts down before the due date", () => {
    expect(dueState(end, "2026-10-15")).toEqual({
      kind: "not_due",
      end,
      dueOn: "2026-10-20",
      daysUntilDue: 5,
      daysUntilEnd: 19,
    });
    expect(dueState(end, "2026-10-19").kind).toBe("not_due");
  });

  it("is due exactly 14 days before the end", () => {
    expect(dueState(end, "2026-10-20")).toEqual({
      kind: "due",
      end,
      dueOn: "2026-10-20",
      daysUntilEnd: 14,
    });
  });

  it("is late after the due date, up to and including the end date", () => {
    expect(dueState(end, "2026-10-25")).toMatchObject({
      kind: "late",
      daysLate: 5,
      daysUntilEnd: 9,
    });
    expect(dueState(end, "2026-11-03")).toMatchObject({
      kind: "late",
      daysLate: 14,
      daysUntilEnd: 0,
    });
    expect(inComparisonWindow(dueState(end, "2026-11-03"))).toBe(true);
  });

  it("is ended the day after the end date", () => {
    expect(dueState(end, "2026-11-04")).toEqual({
      kind: "ended",
      end,
      daysSinceEnd: 1,
    });
    expect(inComparisonWindow(dueState(end, "2026-11-04"))).toBe(false);
  });

  it("uses the Dublin calendar date, not UTC", () => {
    // 23:30 UTC on 19 Oct is 00:30 on 20 Oct in Dublin (summer time).
    const today = dublinDate(new Date("2026-10-19T23:30:00Z"));
    expect(dueState(end, today).kind).toBe("due");
    // In winter Dublin is on UTC: 23:30 UTC on 16 Mar 2027 is still 16 Mar.
    const winter = dublinDate(new Date("2027-03-16T23:30:00Z"));
    expect(dueState("2027-03-31", winter).kind).toBe("not_due");
  });

  it("never fires monthly: only one due day per end date", () => {
    const days: string[] = [];
    for (
      let d = new Date("2026-01-01T12:00:00Z");
      d < new Date("2027-01-01T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const today = d.toISOString().slice(0, 10);
      if (dueState(end, today).kind === "due") days.push(today);
    }
    expect(days).toEqual(["2026-10-20"]);
  });
});

describe("dueAlert", () => {
  const contract: ContractForDue = {
    id: "c1",
    householdId: "h1",
    utilityType: "electricity",
    supplier: "Electric Ireland",
    contractEnd: "2026-11-03",
    status: "active",
  };

  it("says nothing before the due date", () => {
    expect(dueAlert(contract, "2026-10-19")).toBeNull();
  });

  it("alerts on the due date, keyed by contract and end date", () => {
    const alert = dueAlert(contract, "2026-10-20");
    expect(alert).toMatchObject({
      kind: "utilities.due",
      severity: "warning",
      title: "Electricity contract ends in 14 days: compare offers",
      dedupeKey: "utilities:due:c1:2026-11-03",
      actionUrl: "/money/utilities/c1",
      push: true,
    });
    expect(alert?.body).toContain("The comparison is due today.");
  });

  it("says when the reminder is late, with the same dedupe key", () => {
    const alert = dueAlert(contract, "2026-10-23");
    expect(alert?.title).toBe(
      "Electricity contract ends in 11 days: compare offers",
    );
    expect(alert?.body).toContain(
      "The comparison was due on 20 Oct 2026; this reminder is 3 days late.",
    );
    expect(alert?.dedupeKey).toBe(dedupeKeys.due("c1", "2026-11-03"));
    expect(dueAlert(contract, "2026-11-03")?.title).toContain("ends today");
  });

  it("re-arms when the end date changes", () => {
    const first = dueAlert(contract, "2026-10-20");
    const renewed = dueAlert(
      { ...contract, contractEnd: "2027-11-03" },
      "2027-10-20",
    );
    expect(renewed?.dedupeKey).toBe("utilities:due:c1:2027-11-03");
    expect(renewed?.dedupeKey).not.toBe(first?.dedupeKey);
  });

  it("flags an ended contract once per end date", () => {
    const a = dueAlert(contract, "2026-11-04");
    const b = dueAlert(contract, "2026-12-25");
    expect(a).toMatchObject({
      kind: "utilities.ended",
      title:
        "Electricity contract with Electric Ireland ended on 3 Nov 2026: update it",
    });
    expect(b?.dedupeKey).toBe(a?.dedupeKey);
  });

  it("gently asks for an unknown end date, once per contract, without push", () => {
    const alert = dueAlert({ ...contract, contractEnd: null }, "2026-10-21");
    expect(alert).toMatchObject({
      kind: "utilities.unknown_end",
      severity: "info",
      dedupeKey: "utilities:unknown-end:c1",
      push: false,
    });
  });

  it("ignores contracts that aren't active", () => {
    expect(
      dueAlert({ ...contract, status: "switching" }, "2026-10-20"),
    ).toBeNull();
    expect(dueAlert({ ...contract, status: "ended" }, "2026-11-04")).toBeNull();
  });
});
