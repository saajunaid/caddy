import { describe, expect, it } from "vitest";
import {
  applicationItems,
  contractItems,
  listingItems,
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

describe("listingItems", () => {
  const base = {
    title: "Ard na Sailí",
    matches: "match",
    firstSeenOn: "2026-10-01",
    applied: false,
  };

  it("shows matching homes by urgency and skips applied, closed and non-matching ones", () => {
    const items = listingItems(
      [
        { ...base, id: "a", status: "closing_soon", closingDate: "2026-10-21" },
        {
          ...base,
          id: "b",
          status: "open",
          closingDate: "2026-11-30",
          firstSeenOn: "2026-10-20",
        },
        {
          ...base,
          id: "c",
          status: "coming_soon",
          closingDate: null,
          matches: "possible",
        },
        { ...base, id: "d", status: "open", closingDate: null },
        { ...base, id: "e", status: "open", closingDate: null, applied: true },
        { ...base, id: "f", status: "closed", closingDate: "2026-10-01" },
        {
          ...base,
          id: "g",
          status: "open",
          closingDate: null,
          matches: "none",
        },
      ],
      today,
    );
    expect(items.map((i) => [i.key, i.tone, i.label])).toEqual([
      ["listing:a", "due", "Closes today"],
      ["listing:b", "ok", "New"],
      ["listing:c", "info", "Opens soon"],
      ["listing:d", "ok", "Open"],
    ]);
    expect(items[3].detail).toBe(
      "Matches your brief · closing date not stated",
    );
    expect(items[2].detail).toContain("Possible match");
  });
});

describe("applicationItems", () => {
  it("flags follow-ups due within three days or overdue", () => {
    const items = applicationItems(
      [
        {
          listingId: "a",
          listingTitle: "A",
          nextAction: "Send payslips",
          nextActionDue: "2026-10-20",
        },
        {
          listingId: "b",
          listingTitle: "B",
          nextAction: null,
          nextActionDue: "2026-10-24",
        },
        {
          listingId: "c",
          listingTitle: "C",
          nextAction: "Later",
          nextActionDue: "2026-10-30",
        },
        {
          listingId: "d",
          listingTitle: "D",
          nextAction: "No date",
          nextActionDue: null,
        },
      ],
      today,
    );
    expect(items.map((i) => [i.title, i.tone])).toEqual([
      ["Send payslips", "bad"],
      ["Follow up on B", "due"],
    ]);
    expect(items[0].href).toBe("/housing/a?tab=application");
  });
});
