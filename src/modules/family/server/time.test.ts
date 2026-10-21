import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  dublinTime,
  formatShortDate,
  isIsoDate,
  relativeDay,
  weekStart,
  zonedInstant,
} from "./time";

describe("zonedInstant", () => {
  it("reads summer times as IST (UTC+1) and winter times as GMT", () => {
    expect(zonedInstant("2026-10-22", "18:00").toISOString()).toBe(
      "2026-10-22T17:00:00.000Z",
    );
    expect(zonedInstant("2026-11-05", "18:00").toISOString()).toBe(
      "2026-11-05T18:00:00.000Z",
    );
  });

  it("gives midnight on both sides of the October clock change", () => {
    expect(zonedInstant("2026-10-25").toISOString()).toBe(
      "2026-10-24T23:00:00.000Z",
    );
    expect(zonedInstant("2026-10-26").toISOString()).toBe(
      "2026-10-26T00:00:00.000Z",
    );
  });

  it("takes the first 01:30 in the autumn overlap", () => {
    expect(zonedInstant("2026-10-25", "01:30").toISOString()).toBe(
      "2026-10-25T00:30:00.000Z",
    );
  });

  it("moves a time in the spring gap forward rather than failing", () => {
    // Clocks jump 01:00 → 02:00 on 29 Mar 2026; 01:30 doesn't exist.
    const instant = zonedInstant("2026-03-29", "01:30");
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(dublinTime(instant)).toBe("02:30");
  });

  it("rejects bad input", () => {
    expect(() => zonedInstant("2026-02-30")).toThrow();
    expect(() => zonedInstant("2026-02-01", "24:00")).toThrow();
  });
});

describe("weeks", () => {
  it("start on Monday", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19"); // Wednesday
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(weekStart("2027-01-01")).toBe("2026-12-28");
  });

  it("formats short dates", () => {
    expect(formatShortDate("2026-10-24")).toBe("Sat 24 Oct");
    expect(formatShortDate("2027-01-04", 2026)).toBe("Mon 4 Jan 2027");
  });
});

describe("relativeDay", () => {
  it("names nearby days and formats the rest", () => {
    expect(relativeDay("2026-10-21", "2026-10-21")).toBe("Today");
    expect(relativeDay("2026-10-22", "2026-10-21")).toBe("Tomorrow");
    expect(relativeDay("2026-10-20", "2026-10-21")).toBe("Yesterday");
    expect(relativeDay("2026-10-24", "2026-10-21")).toBe("Sat 24 Oct");
    expect(relativeDay("2027-01-04", "2026-10-21")).toBe("Mon 4 Jan 2027");
  });
});

describe("addMonthsClamped", () => {
  it("clamps to the end of shorter months", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonthsClamped("2026-03-15", -3)).toBe("2025-12-15");
  });

  it("validates dates", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("26-02-01")).toBe(false);
  });
});
