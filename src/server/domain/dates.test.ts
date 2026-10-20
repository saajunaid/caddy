import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  dublinDate,
  formatLongDate,
  greetingFor,
} from "./dates";

describe("dublinDate", () => {
  it("uses Irish Standard Time (UTC+1) in summer", () => {
    // 23:30 UTC on 24 Oct is 00:30 on 25 Oct in Dublin (before clocks go back).
    expect(dublinDate(new Date("2026-10-24T23:30:00Z"))).toBe("2026-10-25");
  });

  it("uses GMT (UTC+0) in winter", () => {
    expect(dublinDate(new Date("2026-12-01T23:30:00Z"))).toBe("2026-12-01");
  });

  it("handles the spring clock change", () => {
    // Clocks go forward at 01:00 UTC on 29 Mar 2026.
    expect(dublinDate(new Date("2026-03-28T23:30:00Z"))).toBe("2026-03-28");
    expect(dublinDate(new Date("2026-03-29T23:30:00Z"))).toBe("2026-03-30");
  });
});

describe("addDays", () => {
  it("moves across month and year boundaries", () => {
    expect(addDays("2026-11-03", -14)).toBe("2026-10-20");
    expect(addDays("2026-12-25", 10)).toBe("2027-01-04");
  });

  it("is not affected by daylight saving changes", () => {
    expect(addDays("2026-10-20", 14)).toBe("2026-11-03");
    expect(addDays("2026-04-05", -14)).toBe("2026-03-22");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("rejects invalid input", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow();
    expect(() => addDays("20/10/2026", 1)).toThrow();
    expect(() => addDays("2026-10-20", 1.5)).toThrow();
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-10-20", "2026-11-03")).toBe(14);
    expect(daysBetween("2026-11-03", "2026-10-20")).toBe(-14);
    expect(daysBetween("2026-10-20", "2026-10-20")).toBe(0);
  });

  it("is exact across the October clock change", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("formatLongDate", () => {
  it("formats in Irish English", () => {
    expect(formatLongDate("2026-10-20")).toBe("Tuesday 20 October");
  });
});

describe("greetingFor", () => {
  it("uses Dublin local time", () => {
    expect(greetingFor(new Date("2026-07-01T10:30:00Z"))).toBe("Good morning"); // 11:30 IST
    expect(greetingFor(new Date("2026-07-01T11:30:00Z"))).toBe(
      "Good afternoon",
    ); // 12:30 IST
    expect(greetingFor(new Date("2026-12-01T18:30:00Z"))).toBe("Good evening"); // 18:30 GMT
  });
});
