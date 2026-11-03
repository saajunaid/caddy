import { describe, expect, it } from "vitest";
import { missingJobs, missingRunsAlert, watchdogDue } from "./watchdog";

const today = "2026-11-03";
const run = (job_type: string, started_at: string) => ({
  job_type,
  started_at,
});

describe("watchdogDue", () => {
  it("waits until 10:00 Dublin time, in winter and in summer", () => {
    // Winter: Dublin = UTC.
    expect(watchdogDue(new Date("2026-11-03T09:59:00Z"))).toBe(false);
    expect(watchdogDue(new Date("2026-11-03T10:00:00Z"))).toBe(true);
    // Summer: Dublin = UTC+1.
    expect(watchdogDue(new Date("2026-07-01T08:59:00Z"))).toBe(false);
    expect(watchdogDue(new Date("2026-07-01T09:00:00Z"))).toBe(true);
  });
});

describe("missingJobs", () => {
  const expected = ["heartbeat", "housing-daily", "daily-digest"];

  it("is empty when every expected job ran today, whatever the outcome", () => {
    expect(
      missingJobs(
        [
          run("heartbeat", "2026-11-03T05:56:00Z"),
          run("housing-daily", "2026-11-03T05:57:00Z"),
          run("daily-digest", "2026-11-03T07:28:00Z"),
        ],
        expected,
        today,
      ),
    ).toEqual([]);
  });

  it("names jobs whose only runs were yesterday, using friendly names", () => {
    expect(
      missingJobs(
        [
          run("heartbeat", "2026-11-03T05:56:00Z"),
          run("housing-daily", "2026-11-02T05:57:00Z"),
        ],
        expected,
        today,
      ),
    ).toEqual(["Cost Rental check", "Daily summary"]);
  });

  it("counts a run just after midnight Dublin time in summer as today", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in Dublin.
    expect(
      missingJobs(
        [run("heartbeat", "2026-06-30T23:30:00Z")],
        ["heartbeat"],
        "2026-07-01",
      ),
    ).toEqual([]);
  });

  it("flags everything when nothing ran", () => {
    expect(missingJobs([], expected, today)).toHaveLength(3);
  });
});

describe("missingRunsAlert", () => {
  it("names a single missing check in the title", () => {
    expect(missingRunsAlert(["Cost Rental check"]).title).toBe(
      "A daily check didn't run today: Cost Rental check",
    );
  });

  it("lists every missing check in the body", () => {
    const alert = missingRunsAlert(["Cost Rental check", "Scheduler"]);
    expect(alert.title).toBe("Caddy's daily checks didn't run today");
    expect(alert.body).toContain("Cost Rental check, Scheduler");
  });
});
