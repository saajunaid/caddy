import { describe, expect, it } from "vitest";
import { formatDateRange, formatDuration } from "./labels";
import { ageOn, describeParty, partyOf } from "./travellers";

describe("travellers", () => {
  it("work out age at the start of travel", () => {
    expect(ageOn("2018-06-01", "2027-02-14")).toBe(8);
    expect(ageOn("2018-02-14", "2027-02-14")).toBe(9); // birthday on the day
    expect(ageOn("2018-02-15", "2027-02-14")).toBe(8);
    expect(ageOn("2020-02-29", "2027-02-28")).toBe(6);
    expect(ageOn("2020-02-29", "2027-03-01")).toBe(7);
    expect(ageOn("2027-03-01", "2027-02-14")).toBe(0);
  });

  it("summarise the party", () => {
    const party = partyOf([
      { name: "Junaid", isChild: false, ageAtTravel: null, confirmed: true },
      { name: "Ammara", isChild: false, ageAtTravel: null, confirmed: true },
      { name: "Child 1", isChild: true, ageAtTravel: 8, confirmed: true },
      { name: "Child 2", isChild: true, ageAtTravel: 4, confirmed: false },
    ]);
    expect(party).toEqual({
      adults: 2,
      children: 2,
      childAges: [8, 4],
      unconfirmedChildren: 1,
    });
    expect(describeParty(party)).toBe(
      "2 adults + 2 children (8 and 4 at travel)",
    );
    expect(
      describeParty({
        adults: 1,
        children: 0,
        childAges: [],
        unconfirmedChildren: 0,
      }),
    ).toBe("1 adult");
    expect(
      describeParty({
        adults: 2,
        children: 1,
        childAges: [],
        unconfirmedChildren: 1,
      }),
    ).toBe("2 adults + 1 child");
    expect(
      describeParty({
        adults: 0,
        children: 0,
        childAges: [],
        unconfirmedChildren: 0,
      }),
    ).toBe("No travellers yet");
  });

  it("format windows and durations", () => {
    expect(formatDateRange("2027-02-14", "2027-02-22")).toBe("14–22 Feb 2027");
    expect(formatDateRange("2027-02-28", "2027-03-06")).toBe(
      "28 Feb – 6 Mar 2027",
    );
    expect(formatDateRange("2026-12-28", "2027-01-04")).toBe(
      "28 Dec 2026 – 4 Jan 2027",
    );
    expect(formatDuration(290)).toBe("4h 50m");
    expect(formatDuration(45)).toBe("45m");
  });
});
