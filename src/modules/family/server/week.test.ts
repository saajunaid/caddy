import { describe, expect, it } from "vitest";
import { clashWarnings, findClashes, type ClashCandidate } from "./clashes";
import { buildWeek, type WeekEvent } from "./week";

const event = (
  over: Partial<WeekEvent> & Pick<WeekEvent, "id" | "title" | "startsAt">,
): WeekEvent => ({
  endsAt: null,
  allDay: false,
  startDate: null,
  endDate: null,
  recurrence: "none",
  location: null,
  memberIds: [],
  ...over,
});

describe("buildWeek", () => {
  it("builds Monday to Sunday and marks today", () => {
    const week = buildWeek({
      anyDate: "2026-10-21",
      today: "2026-10-20",
      events: [],
      tasks: [],
    });
    expect(week.start).toBe("2026-10-19");
    expect(week.end).toBe("2026-10-25");
    expect(week.previous).toBe("2026-10-12");
    expect(week.next).toBe("2026-10-26");
    expect(week.days.map((d) => d.weekday)).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    expect(week.days.filter((d) => d.isToday).map((d) => d.date)).toEqual([
      "2026-10-20",
    ]);
  });

  it("places events on their Dublin day, all-day first, then by time", () => {
    const week = buildWeek({
      anyDate: "2026-10-19",
      today: "2026-10-19",
      events: [
        // 23:30 UTC on Sat is 00:30 Sunday in Dublin (IST).
        event({
          id: "late",
          title: "Late film",
          startsAt: new Date("2026-10-24T23:30:00Z"),
        }),
        event({
          id: "a",
          title: "Football",
          startsAt: new Date("2026-10-21T18:00:00Z"),
        }),
        event({
          id: "b",
          title: "Bins",
          startsAt: new Date("2026-10-21T07:00:00Z"),
        }),
        event({
          id: "c",
          title: "Midterm",
          startsAt: new Date("2026-10-22T23:00:00Z"),
          allDay: true,
          startDate: "2026-10-21",
          endDate: "2026-10-23",
        }),
      ],
      tasks: [
        {
          id: "t1",
          title: "Book NCT",
          dueOn: "2026-10-21",
          dueTime: null,
          status: "open",
          assigneeMemberId: null,
        },
        {
          id: "t2",
          title: "Old",
          dueOn: "2026-10-01",
          dueTime: null,
          status: "open",
          assigneeMemberId: null,
        },
      ],
    });
    const wed = week.days[2];
    expect(wed.entries.map((e) => e.title)).toEqual([
      "Midterm",
      "Book NCT",
      "Bins",
      "Football",
    ]);
    expect(wed.entries.map((e) => e.time)).toEqual([
      null,
      null,
      "08:00",
      "19:00",
    ]);
    expect(week.days[3].entries.map((e) => e.title)).toEqual(["Midterm"]);
    expect(week.days[4].entries).toMatchObject([
      { title: "Midterm", continued: true },
    ]);
    expect(week.days[6].entries.map((e) => e.title)).toEqual(["Late film"]);
    expect(week.days[5].entries).toEqual([]);
  });

  it("handles the week the clocks go back", () => {
    const week = buildWeek({
      anyDate: "2026-10-25",
      today: "2026-10-25",
      events: [
        event({
          id: "s",
          title: "Swim",
          startsAt: new Date("2026-10-13T16:30:00Z"),
          recurrence: "weekly",
        }),
        event({
          id: "m",
          title: "Sunday 09:00",
          startsAt: new Date("2026-10-25T09:00:00Z"),
        }),
      ],
      tasks: [],
    });
    expect(week.days[1].entries.map((e) => e.time)).toEqual(["17:30"]);
    expect(week.days[6].entries.map((e) => e.time)).toEqual(["09:00"]);
    const next = buildWeek({
      anyDate: week.next,
      today: "2026-10-25",
      events: [
        event({
          id: "s",
          title: "Swim",
          startsAt: new Date("2026-10-13T16:30:00Z"),
          recurrence: "weekly",
        }),
      ],
      tasks: [],
    });
    expect(next.days[1].entries.map((e) => e.time)).toEqual(["17:30"]);
  });

  it("flags overdue tasks and clashes", () => {
    const week = buildWeek({
      anyDate: "2026-10-22",
      today: "2026-10-23",
      events: [
        event({
          id: "ptm",
          title: "Parent–teacher meeting",
          startsAt: new Date("2026-10-22T17:00:00Z"),
          memberIds: ["sam", "alex"],
        }),
        event({
          id: "dentist",
          title: "Dentist",
          startsAt: new Date("2026-10-22T17:15:00Z"),
          endsAt: new Date("2026-10-22T17:45:00Z"),
          memberIds: ["alex"],
        }),
      ],
      tasks: [
        {
          id: "t",
          title: "Payslips",
          dueOn: "2026-10-22",
          dueTime: "17:00:00",
          status: "open",
          assigneeMemberId: "sam",
        },
      ],
    });
    const thu = week.days[3].entries;
    expect(week.clashCount).toBe(1);
    const dentist = thu.find((e) => e.title === "Dentist");
    expect(dentist?.kind === "event" && dentist.warnings).toEqual([
      "Clashes with Parent–teacher meeting 18:00",
    ]);
    const ptm = thu.find((e) => e.title === "Parent–teacher meeting");
    expect(ptm?.kind === "event" && ptm.warnings).toEqual([
      "Clashes with Dentist 18:15",
    ]);
    const task = thu.find((e) => e.kind === "task");
    expect(task).toMatchObject({ overdue: true, time: "17:00" });
  });
});

const slot = (
  key: string,
  start: string,
  end: string | null,
  memberIds: string[] = [],
): ClashCandidate => ({
  key,
  title: key,
  start: new Date(start),
  end: end ? new Date(end) : null,
  allDay: false,
  memberIds,
});

describe("findClashes", () => {
  it("finds overlaps for the same person only", () => {
    const clashes = findClashes([
      slot("swim", "2026-10-20T16:30:00Z", "2026-10-20T17:30:00Z", ["rowan"]),
      slot("dentist", "2026-10-20T17:00:00Z", "2026-10-20T17:30:00Z", ["ivy"]),
      slot("football", "2026-10-20T17:15:00Z", "2026-10-20T18:00:00Z", [
        "rowan",
      ]),
    ]);
    expect(clashes).toEqual([
      { a: "swim", b: "football", sharedMemberIds: ["rowan"] },
    ]);
  });

  it("treats events with nobody set as involving everyone", () => {
    const clashes = findClashes([
      slot("shop", "2026-10-24T09:00:00Z", "2026-10-24T10:00:00Z"),
      slot("swim", "2026-10-24T09:30:00Z", "2026-10-24T10:30:00Z", ["rowan"]),
    ]);
    expect(clashes).toEqual([{ a: "shop", b: "swim", sharedMemberIds: [] }]);
  });

  it("doesn't count back-to-back events or all-day events", () => {
    const allDay = {
      ...slot("holiday", "2026-10-24T00:00:00Z", "2026-10-25T00:00:00Z"),
      allDay: true,
    };
    expect(
      findClashes([
        slot("a", "2026-10-24T09:00:00Z", "2026-10-24T10:00:00Z"),
        slot("b", "2026-10-24T10:00:00Z", "2026-10-24T11:00:00Z"),
        allDay,
      ]),
    ).toEqual([]);
  });

  it("assumes an hour for events without an end time", () => {
    expect(
      findClashes([
        slot("a", "2026-10-24T09:00:00Z", null),
        slot("b", "2026-10-24T09:59:00Z", null),
      ]),
    ).toHaveLength(1);
    expect(
      findClashes([
        slot("a", "2026-10-24T09:00:00Z", null),
        slot("b", "2026-10-24T10:00:00Z", null),
      ]),
    ).toHaveLength(0);
  });

  it("describes each clash in local time", () => {
    const items = [
      slot("Football", "2026-11-03T18:00:00Z", "2026-11-03T19:00:00Z"),
      slot("Dentist", "2026-11-03T18:15:00Z", "2026-11-03T18:45:00Z"),
    ];
    expect(clashWarnings(items).get("Football")).toEqual([
      "Clashes with Dentist 18:15",
    ]);
  });
});
