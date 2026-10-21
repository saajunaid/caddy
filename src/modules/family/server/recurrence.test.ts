import { describe, expect, it } from "vitest";
import { expandEvents, nextTaskDueOn, type EventSeries } from "./recurrence";
import { dublinTime } from "./time";

describe("nextTaskDueOn", () => {
  it("doesn't repeat one-off tasks or tasks without a due date", () => {
    expect(
      nextTaskDueOn(
        { dueOn: "2026-10-21", recurrence: "none", interval: 1 },
        "2026-10-21",
      ),
    ).toBeNull();
    expect(
      nextTaskDueOn(
        { dueOn: null, recurrence: "weekly", interval: 1 },
        "2026-10-21",
      ),
    ).toBeNull();
  });

  it("moves daily and weekly tasks on by the interval", () => {
    expect(
      nextTaskDueOn(
        { dueOn: "2026-10-21", recurrence: "daily", interval: 1 },
        "2026-10-21",
      ),
    ).toBe("2026-10-22");
    expect(
      nextTaskDueOn(
        { dueOn: "2026-10-21", recurrence: "weekly", interval: 2 },
        "2026-10-21",
      ),
    ).toBe("2026-11-04");
  });

  it("keeps the next occurrence when finished early", () => {
    // Weekly bins on Wednesday, done on Monday: next is the following Wednesday.
    expect(
      nextTaskDueOn(
        { dueOn: "2026-10-21", recurrence: "weekly", interval: 1 },
        "2026-10-19",
      ),
    ).toBe("2026-10-28");
  });

  it("skips missed occurrences when finished late", () => {
    expect(
      nextTaskDueOn(
        { dueOn: "2026-10-14", recurrence: "weekly", interval: 1 },
        "2026-10-23",
      ),
    ).toBe("2026-10-28");
    expect(
      nextTaskDueOn(
        { dueOn: "2026-10-18", recurrence: "daily", interval: 1 },
        "2026-10-21",
      ),
    ).toBe("2026-10-22");
  });

  it("clamps monthly tasks to the month end without drifting", () => {
    const jan31 = {
      recurrence: "monthly" as const,
      interval: 1,
      anchorOn: "2026-01-31",
    };
    expect(nextTaskDueOn({ ...jan31, dueOn: "2026-01-31" }, "2026-01-31")).toBe(
      "2026-02-28",
    );
    // From the clamped 28 Feb the series returns to the 31st.
    expect(nextTaskDueOn({ ...jan31, dueOn: "2026-02-28" }, "2026-02-28")).toBe(
      "2026-03-31",
    );
    expect(nextTaskDueOn({ ...jan31, dueOn: "2026-03-31" }, "2026-03-31")).toBe(
      "2026-04-30",
    );
    // Leap year.
    expect(
      nextTaskDueOn(
        {
          recurrence: "monthly",
          interval: 1,
          dueOn: "2028-01-31",
          anchorOn: "2028-01-31",
        },
        "2028-01-31",
      ),
    ).toBe("2028-02-29");
  });

  it("handles quarterly tasks crossing a year", () => {
    expect(
      nextTaskDueOn(
        { dueOn: "2026-11-30", recurrence: "monthly", interval: 3 },
        "2026-11-30",
      ),
    ).toBe("2027-02-28");
  });

  it("puts 29 February birthdays on 28 February in other years", () => {
    const leap = {
      recurrence: "yearly" as const,
      interval: 1,
      anchorOn: "2028-02-29",
    };
    expect(nextTaskDueOn({ ...leap, dueOn: "2028-02-29" }, "2028-02-29")).toBe(
      "2029-02-28",
    );
    expect(nextTaskDueOn({ ...leap, dueOn: "2031-02-28" }, "2031-02-28")).toBe(
      "2032-02-29",
    );
  });
});

const base: Omit<EventSeries, "id" | "startsAt"> = {
  endsAt: null,
  allDay: false,
  startDate: null,
  endDate: null,
  recurrence: "none",
};

describe("expandEvents", () => {
  it("keeps weekly events at the same local time across the October clock change", () => {
    const swim: EventSeries = {
      ...base,
      id: "swim",
      startsAt: new Date("2026-10-13T16:30:00Z"), // Tue 17:30 IST
      endsAt: new Date("2026-10-13T17:15:00Z"),
      recurrence: "weekly",
    };
    const occurrences = expandEvents([swim], "2026-10-19", "2026-11-01");
    expect(occurrences.map((o) => o.date)).toEqual([
      "2026-10-20",
      "2026-10-27",
    ]);
    expect(occurrences.map((o) => dublinTime(o.start))).toEqual([
      "17:30",
      "17:30",
    ]);
    expect(occurrences[1].start.toISOString()).toBe("2026-10-27T17:30:00.000Z");
    expect(occurrences[1].end?.toISOString()).toBe("2026-10-27T18:15:00.000Z");
  });

  it("keeps weekly events at the same local time across the March clock change", () => {
    const series: EventSeries = {
      ...base,
      id: "jumuah",
      startsAt: new Date("2026-03-20T13:15:00Z"), // Fri 13:15 GMT
      recurrence: "weekly",
    };
    const occurrences = expandEvents([series], "2026-03-23", "2026-04-05");
    expect(occurrences.map((o) => o.start.toISOString())).toEqual([
      "2026-03-27T13:15:00.000Z",
      "2026-04-03T12:15:00.000Z",
    ]);
  });

  it("doesn't repeat before the first occurrence", () => {
    const series: EventSeries = {
      ...base,
      id: "x",
      startsAt: new Date("2026-10-22T17:00:00Z"),
      recurrence: "weekly",
    };
    expect(expandEvents([series], "2026-10-12", "2026-10-18")).toEqual([]);
  });

  it("puts yearly all-day events on 28 February outside leap years", () => {
    const birthday: EventSeries = {
      ...base,
      id: "bday",
      startsAt: new Date("2028-02-29T00:00:00Z"),
      allDay: true,
      startDate: "2028-02-29",
      recurrence: "yearly",
    };
    expect(
      expandEvents([birthday], "2029-01-01", "2029-12-31").map((o) => o.date),
    ).toEqual(["2029-02-28"]);
    expect(
      expandEvents([birthday], "2032-01-01", "2032-12-31").map((o) => o.date),
    ).toEqual(["2032-02-29"]);
  });

  it("includes multi-day all-day events that started before the range", () => {
    const midterm: EventSeries = {
      ...base,
      id: "midterm",
      startsAt: new Date("2026-10-25T23:00:00Z"),
      allDay: true,
      startDate: "2026-10-23",
      endDate: "2026-11-01",
    };
    const [o] = expandEvents([midterm], "2026-10-26", "2026-11-01");
    expect(o.date).toBe("2026-10-23");
    expect(o.lastDate).toBe("2026-11-01");
  });

  it("includes a one-off timed event only when it touches the range", () => {
    const late: EventSeries = {
      ...base,
      id: "late",
      startsAt: new Date("2026-10-25T22:30:00Z"), // Sun 22:30 GMT
      endsAt: new Date("2026-10-26T01:00:00Z"),
    };
    expect(expandEvents([late], "2026-10-26", "2026-10-26")).toHaveLength(1);
    expect(expandEvents([late], "2026-10-27", "2026-11-01")).toHaveLength(0);
  });
});
