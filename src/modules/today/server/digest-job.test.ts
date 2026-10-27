import { describe, expect, it } from "vitest";
import { todaysChecks } from "./digest-job";

const today = "2026-10-27";
const run = (
  job_type: string,
  status: string,
  started_at: string,
  extra: { summary?: string; household_id?: string | null } = {},
) => ({
  job_type,
  status,
  started_at,
  summary: extra.summary ?? null,
  household_id: extra.household_id ?? null,
});

describe("todaysChecks", () => {
  it("reports only checks whose latest run today failed, by friendly name", () => {
    const result = todaysChecks(
      [
        run("housing-daily", "failed", "2026-10-27T05:58:00Z"),
        // The lunchtime retry succeeded: no longer a failure.
        run("housing-daily", "succeeded", "2026-10-27T12:58:00Z", {
          summary: "204 listings checked · 0 match · 0 new",
        }),
        run("places-refresh", "partial", "2026-10-27T05:59:00Z"),
        // Yesterday's failure doesn't count today.
        run("fx-ecb", "failed", "2026-10-26T05:58:00Z"),
        // Another household's run isn't ours.
        run("family-reminders", "failed", "2026-10-27T05:59:00Z", {
          household_id: "other",
        }),
        run("daily-digest", "failed", "2026-10-27T07:25:00Z"),
      ],
      "mine",
      today,
    );
    expect(result).toEqual({
      failed: ["Nearby places"],
      housingSummary: "204 listings checked · 0 match · 0 new",
    });
  });

  it("gives no housing summary when the housing check failed", () => {
    expect(
      todaysChecks(
        [
          run("housing-daily", "failed", "2026-10-27T05:58:00Z", {
            summary: "Failed: newstarterhomes.ie returned HTTP 404",
          }),
        ],
        "mine",
        today,
      ),
    ).toEqual({ failed: ["Cost Rental check"], housingSummary: null });
  });
});
