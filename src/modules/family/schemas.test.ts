import { describe, expect, it } from "vitest";
import {
  applicationSchema,
  eventColumns,
  eventSchema,
  formObject,
  schoolSchema,
  taskFromSchema,
  taskSchema,
} from "./schemas";

const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [k, v] of entries) data.append(k, v);
  return data;
};

describe("formObject", () => {
  it("keeps repeated names as arrays and defaults them to empty", () => {
    expect(
      formObject(
        form([
          ["title", "x"],
          ["memberIds", "a"],
          ["memberIds", "b"],
        ]),
        ["memberIds"],
      ),
    ).toEqual({ title: "x", memberIds: ["a", "b"] });
    expect(formObject(form([["title", "x"]]), ["memberIds"])).toEqual({
      title: "x",
      memberIds: [],
    });
  });
});

describe("taskSchema", () => {
  it("turns empty fields into nulls", () => {
    const parsed = taskSchema.parse({
      title: "  Book NCT ",
      notes: "",
      dueOn: "",
      dueTime: "",
      assigneeMemberId: "",
      recurrence: "none",
      recurrenceInterval: "1",
      relatedUrl: "",
    });
    expect(parsed).toEqual({
      title: "Book NCT",
      notes: null,
      dueOn: null,
      dueTime: null,
      assigneeMemberId: null,
      recurrence: "none",
      recurrenceInterval: 1,
      relatedUrl: null,
    });
  });

  it("needs a due date for a time or a repeat", () => {
    expect(taskSchema.safeParse({ title: "x", dueTime: "09:00" }).success).toBe(
      false,
    );
    expect(
      taskSchema.safeParse({ title: "x", recurrence: "weekly" }).success,
    ).toBe(false);
    expect(
      taskSchema.safeParse({
        title: "x",
        recurrence: "weekly",
        dueOn: "2026-10-21",
      }).success,
    ).toBe(true);
  });

  it("rejects impossible dates and non-web links", () => {
    expect(
      taskSchema.safeParse({ title: "x", dueOn: "2026-02-30" }).success,
    ).toBe(false);
    expect(
      taskSchema.safeParse({ title: "x", relatedUrl: "javascript:alert(1)" })
        .success,
    ).toBe(false);
  });
});

describe("taskFromSchema", () => {
  it("accepts the minimal input other modules send", () => {
    expect(
      taskFromSchema.parse({
        title: "Apply for Millrace Court",
        dueOn: "2026-10-30",
        relatedEntityType: "housing_listing",
        relatedEntityId: "abc",
        relatedUrl: "https://newstarterhomes.ie/rent/millrace-court/",
      }),
    ).toMatchObject({ title: "Apply for Millrace Court", dueOn: "2026-10-30" });
    expect(taskFromSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("eventColumns", () => {
  it("stores timed events as UTC instants from Irish wall-clock times", () => {
    const e = eventSchema.parse({
      title: "Dentist",
      date: "2026-10-22",
      startTime: "18:15",
      endTime: "18:45",
    });
    expect(eventColumns(e)).toEqual({
      all_day: false,
      start_date: null,
      end_date: null,
      starts_at: "2026-10-22T17:15:00.000Z",
      ends_at: "2026-10-22T17:45:00.000Z",
    });
  });

  it("rolls an end time before the start into the next day", () => {
    const e = eventSchema.parse({
      title: "Night feed",
      date: "2026-11-02",
      startTime: "23:00",
      endTime: "01:00",
    });
    expect(eventColumns(e).ends_at).toBe("2026-11-03T01:00:00.000Z");
  });

  it("stores all-day events as dates with starts_at at Dublin midnight", () => {
    const e = eventSchema.parse({
      title: "Midterm",
      allDay: "on",
      date: "2026-10-26",
      endDate: "2026-10-30",
      startTime: "",
    });
    expect(eventColumns(e)).toEqual({
      all_day: true,
      start_date: "2026-10-26",
      end_date: "2026-10-30",
      starts_at: "2026-10-26T00:00:00.000Z",
      ends_at: null,
    });
  });

  it("needs a start time unless all day, and a last day after the first", () => {
    expect(
      eventSchema.safeParse({ title: "x", date: "2026-10-26" }).success,
    ).toBe(false);
    expect(
      eventSchema.safeParse({
        title: "x",
        allDay: "on",
        date: "2026-10-26",
        endDate: "2026-10-25",
      }).success,
    ).toBe(false);
  });
});

describe("schools and applications", () => {
  it("need both coordinates or neither", () => {
    expect(
      schoolSchema.safeParse({
        name: "Scoil",
        level: "primary",
        latitude: "52.66",
      }).success,
    ).toBe(false);
    expect(
      schoolSchema.parse({
        name: "Scoil",
        level: "primary",
        latitude: "52.66",
        longitude: "-8.63",
      }),
    ).toMatchObject({ latitude: 52.66, longitude: -8.63 });
  });

  it("parse application numbers and blanks", () => {
    expect(
      applicationSchema.parse({
        schoolId: "0b9b6f47-8d0e-4a8e-9a39-1b2a3c4d5e6f",
        childMemberId: "5f0c6c0e-2b1a-4d3c-8e7f-6a5b4c3d2e1f",
        intakeYear: "2027",
        preferenceRank: "",
        applicationDeadline: "2026-11-14",
      }),
    ).toMatchObject({
      intakeYear: 2027,
      preferenceRank: null,
      status: "researching",
      applicationDeadline: "2026-11-14",
      openDay: null,
    });
  });
});
