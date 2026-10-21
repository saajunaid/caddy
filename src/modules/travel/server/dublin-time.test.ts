import { describe, expect, it } from "vitest";
import { fromDublinLocal, toDublinLocal } from "./dublin-time";

describe("Dublin wall-clock times", () => {
  it("round-trip in summer and winter time", () => {
    expect(fromDublinLocal("2026-10-12T09:30")?.toISOString()).toBe(
      "2026-10-12T08:30:00.000Z",
    );
    expect(fromDublinLocal("2026-12-01T09:30")?.toISOString()).toBe(
      "2026-12-01T09:30:00.000Z",
    );
    expect(toDublinLocal(new Date("2026-10-12T08:30:00Z"))).toBe(
      "2026-10-12T09:30",
    );
  });

  it("handle the spring gap and bad input", () => {
    // 01:30 doesn't exist on 29 Mar 2026 (clocks go forward at 01:00 UTC).
    expect(fromDublinLocal("2026-03-29T01:30")?.toISOString()).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(fromDublinLocal("yesterday")).toBeNull();
  });
});
