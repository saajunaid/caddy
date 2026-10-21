import { describe, expect, it } from "vitest";
import { isoWeek, planReminders, type ReminderTrip } from "./reminders";

const trip = (fields: Partial<ReminderTrip> = {}): ReminderTrip => ({
  id: "t1",
  householdId: "h1",
  name: "Mid-term Feb 2027",
  status: "planning",
  dateFrom: "2027-02-14",
  dateTo: "2027-02-22",
  ...fields,
});

describe("ISO weeks", () => {
  it("follow ISO 8601", () => {
    expect(isoWeek("2026-10-21")).toBe("2026-W43");
    expect(isoWeek("2026-10-19")).toBe("2026-W43"); // Monday
    expect(isoWeek("2026-10-25")).toBe("2026-W43"); // Sunday
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
  });
});

describe("weekly travel reminders", () => {
  it("remind when the window starts within 60 days", () => {
    const reminders = planReminders({
      today: "2027-01-04",
      trips: [trip()],
      candidates: [{ id: "c1", tripId: "t1", status: "option" }],
      components: [{ candidateId: "c1", checkedAt: "2026-10-12T09:00:00Z" }],
    });
    expect(reminders).toEqual([
      {
        householdId: "h1",
        tripId: "t1",
        title:
          "Prices for Mid-term Feb 2027 were last checked 12 Oct: recheck before booking",
        body: "The trip window starts in 41 days (14 Feb). 1 option, 0 shortlisted. Caddy doesn't check prices itself; open each booking link to recheck.",
        dedupeKey: "travel-weekly:t1:2027-W01",
        severity: "info",
      },
    ]);
  });

  it("remind when shortlisted prices are more than a week old", () => {
    const reminders = planReminders({
      today: "2026-10-21",
      trips: [trip()],
      candidates: [
        { id: "c1", tripId: "t1", status: "shortlisted" },
        { id: "c2", tripId: "t1", status: "option" },
      ],
      components: [
        { candidateId: "c1", checkedAt: "2026-10-13T09:00:00Z" },
        { candidateId: "c2", checkedAt: "2026-10-01T09:00:00Z" },
      ],
    });
    expect(reminders).toHaveLength(1);
    expect(reminders[0].title).toBe(
      "Prices for Mid-term Feb 2027 were last checked 13 Oct: recheck before booking",
    );
    expect(reminders[0].severity).toBe("warning");
  });

  it("stay quiet for fresh prices, far-off trips and trips no longer being planned", () => {
    const quiet = planReminders({
      today: "2026-10-21",
      trips: [
        trip(),
        trip({
          id: "t2",
          status: "booked",
          dateFrom: "2026-11-01",
          dateTo: "2026-11-08",
        }),
        trip({ id: "t3", dateFrom: "2026-09-01", dateTo: "2026-09-08" }),
      ],
      candidates: [
        { id: "c1", tripId: "t1", status: "shortlisted" },
        { id: "c2", tripId: "t2", status: "shortlisted" },
      ],
      components: [
        { candidateId: "c1", checkedAt: "2026-10-15T09:00:00Z" },
        { candidateId: "c2", checkedAt: "2026-09-01T09:00:00Z" },
      ],
    });
    expect(quiet).toEqual([]);
  });

  it("nudge to add options when the window is close and nothing is priced", () => {
    const [reminder] = planReminders({
      today: "2027-01-20",
      trips: [trip()],
      candidates: [],
      components: [],
    });
    expect(reminder.title).toBe(
      "Mid-term Feb 2027 has no prices yet: add the options you find",
    );
  });

  it("use one dedupe key per trip per week", () => {
    const run = (today: string) =>
      planReminders({
        today,
        trips: [trip()],
        candidates: [],
        components: [],
      })[0].dedupeKey;
    expect(run("2027-01-18")).toBe(run("2027-01-24"));
    expect(run("2027-01-18")).not.toBe(run("2027-01-25"));
  });
});
