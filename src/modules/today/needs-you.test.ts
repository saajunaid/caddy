import { describe, expect, it } from "vitest";
import {
  contractItems,
  failureItem,
  shortDay,
  sortItems,
  taskItems,
  tripItems,
  weekDates,
} from "./needs-you";

const today = "2026-10-21";

describe("taskItems", () => {
  it("flags overdue tasks red and tasks due within two days orange", () => {
    const items = taskItems(
      [
        { id: "a", title: "Renew passport", dueOn: "2026-10-19" },
        { id: "b", title: "Pay creche", dueOn: "2026-10-21" },
        { id: "c", title: "Book NCT", dueOn: "2026-10-23" },
        { id: "d", title: "Later", dueOn: "2026-10-24" },
        { id: "e", title: "Undated", dueOn: null },
      ],
      today,
    );
    expect(items.map((i) => [i.title, i.tone, i.label])).toEqual([
      ["Renew passport", "bad", "Overdue"],
      ["Pay creche", "due", "Due today"],
      ["Book NCT", "due", "Due soon"],
    ]);
    expect(items[2].detail).toBe("Due in 2 days · Fri 23 Oct");
  });
});

describe("contractItems", () => {
  const base = {
    id: "k",
    supplier: "Flogas",
    utilityType: "electricity",
    status: "active",
  };

  it("asks to compare exactly from 14 days before the end date", () => {
    expect(
      contractItems([{ ...base, contractEnd: "2026-11-05" }], today),
    ).toHaveLength(0); // due on 22 Oct: tomorrow, not yet
    const [item] = contractItems(
      [{ ...base, contractEnd: "2026-11-04" }],
      today,
    );
    expect(item).toMatchObject({
      tone: "due",
      label: "Compare now",
      title: "Compare Flogas electricity prices",
      href: "/money/utilities/k",
    });
  });

  it("asks for a missing end date instead of guessing", () => {
    const [item] = contractItems([{ ...base, contractEnd: null }], today);
    expect(item.tone).toBe("review");
    expect(item.title).toContain("end date");
  });

  it("shows recently ended contracts, then drops them after 30 days", () => {
    expect(
      contractItems([{ ...base, contractEnd: "2026-10-01" }], today)[0].tone,
    ).toBe("bad");
    expect(
      contractItems([{ ...base, contractEnd: "2026-09-01" }], today),
    ).toHaveLength(0);
  });

  it("ignores contracts that aren't active", () => {
    expect(
      contractItems(
        [{ ...base, status: "switching", contractEnd: null }],
        today,
      ),
    ).toHaveLength(0);
  });
});

describe("tripItems", () => {
  it("reminds about unbooked trips and shows booked ones coming up", () => {
    const items = tripItems(
      [
        {
          id: "p",
          name: "Mid-term",
          dateFrom: "2026-10-31",
          dateTo: "2026-11-07",
          status: "planning",
        },
        {
          id: "b",
          name: "Christmas",
          dateFrom: "2026-11-15",
          dateTo: "2026-11-20",
          status: "booked",
        },
        {
          id: "far",
          name: "Summer",
          dateFrom: "2027-07-01",
          dateTo: "2027-07-14",
          status: "planning",
        },
        {
          id: "past",
          name: "Done",
          dateFrom: "2026-10-01",
          dateTo: "2026-10-05",
          status: "booked",
        },
      ],
      today,
    );
    expect(items.map((i) => [i.title, i.tone])).toEqual([
      ["Book Mid-term", "due"],
      ["Christmas", "info"],
    ]);
  });
});

describe("sortItems", () => {
  it("puts load failures first, then overdue, then due soon", () => {
    const items = sortItems([
      ...taskItems([{ id: "x", title: "Soon", dueOn: "2026-10-22" }], today),
      ...taskItems([{ id: "y", title: "Late", dueOn: "2026-10-01" }], today),
      failureItem("money", "utility contracts", "/money/utilities"),
    ]);
    expect(items.map((i) => i.title)).toEqual([
      "Couldn't load utility contracts",
      "Late",
      "Soon",
    ]);
  });
});

describe("dates", () => {
  it("formats short days and builds a 7-day week", () => {
    expect(shortDay("2026-10-25")).toBe("Sun 25 Oct");
    expect(weekDates(today)).toEqual([
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });
});
