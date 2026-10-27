import { describe, expect, it } from "vitest";
import { buildDigest } from "./digest";
import { failureItem, taskItems } from "./needs-you";

const today = "2026-10-27";

describe("buildDigest", () => {
  it("says all quiet, with the housing check, when nothing needs you", () => {
    expect(
      buildDigest({
        items: [],
        failedChecks: [],
        housingSummary: "204 listings checked · 0 match · 0 new",
      }),
    ).toEqual({
      title: "All quiet today",
      body: "Cost Rental: 204 listings checked · 0 match · 0 new",
      severity: "info",
    });
    expect(
      buildDigest({ items: [], failedChecks: [], housingSummary: null }).body,
    ).toBe("All checks ran. Nothing needs you.");
  });

  it("lists the most urgent things first and counts the rest", () => {
    const items = taskItems(
      [
        { id: "a", title: "Soon", dueOn: "2026-10-28" },
        { id: "b", title: "Late", dueOn: "2026-10-20" },
        { id: "c", title: "Today", dueOn: "2026-10-27" },
        { id: "d", title: "Also late", dueOn: "2026-10-21" },
      ],
      today,
    );
    const digest = buildDigest({
      items,
      failedChecks: [],
      housingSummary: null,
    });
    expect(digest.title).toBe("4 things need you today");
    expect(digest.body).toBe(
      "Overdue: Late · Overdue: Also late · Due today: Today · +1 more",
    );
  });

  it("puts failed checks first and marks the day as a warning", () => {
    const digest = buildDigest({
      items: [failureItem("money", "utility contracts", "/money/utilities")],
      failedChecks: ["Cost Rental check"],
      housingSummary: null,
    });
    expect(digest.severity).toBe("warning");
    expect(digest.title).toBe("1 thing needs you today");
    expect(digest.body.startsWith("Check failed: Cost Rental check")).toBe(
      true,
    );
    expect(
      buildDigest({
        items: [],
        failedChecks: ["Cost Rental check", "Nearby places"],
        housingSummary: null,
      }),
    ).toMatchObject({
      title: "Nothing new, but a check failed",
      body: "Checks failed: Cost Rental check, Nearby places",
    });
  });

  it("keeps the body short enough for a phone notification", () => {
    const items = taskItems(
      Array.from({ length: 3 }, (_, i) => ({
        id: `t${i}`,
        title: "A very long task title ".repeat(6),
        dueOn: today,
      })),
      today,
    );
    const body = buildDigest({
      items,
      failedChecks: [],
      housingSummary: null,
    }).body;
    expect(body.length).toBeLessThanOrEqual(230);
    expect(body.endsWith("…")).toBe(true);
  });
});
