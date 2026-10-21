import { describe, expect, it } from "vitest";
import { formatChecked, formatWhen } from "./relative-time";

const now = new Date("2026-10-21T08:00:00Z"); // 09:00 in Dublin (IST)

describe("formatWhen", () => {
  it("shows Dublin time for today", () => {
    expect(formatWhen(new Date("2026-10-21T06:14:00Z"), now)).toBe("07:14");
  });
  it("uses Yesterday and weekdays for the last week", () => {
    expect(formatWhen(new Date("2026-10-20T10:00:00Z"), now)).toBe("Yesterday");
    expect(formatWhen(new Date("2026-10-18T10:00:00Z"), now)).toBe("Sun");
  });
  it("shows day and month for older items", () => {
    expect(formatWhen(new Date("2026-10-02T10:00:00Z"), now)).toBe("2 Oct");
  });
});

describe("formatChecked", () => {
  it("describes recency", () => {
    expect(formatChecked(new Date("2026-10-21T06:14:00Z"), now)).toBe(
      "today 07:14",
    );
    expect(formatChecked(new Date("2026-10-20T06:14:00Z"), now)).toBe(
      "yesterday 07:14",
    );
  });
});
