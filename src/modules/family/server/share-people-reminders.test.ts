import { describe, expect, it } from "vitest";
import { ageLabel, ecceHint, initials } from "./people";
import { planFamilyReminders, type ReminderApplication } from "./reminders";
import {
  eventShareText,
  listShareText,
  taskShareText,
  tasksShareText,
  whatsappLink,
} from "./whatsapp";

describe("WhatsApp share text", () => {
  it("lists unticked items with bullets", () => {
    const text = listShareText("Shopping", [
      { text: "Milk", checked: false },
      { text: "Eggs", checked: true },
      { text: "Basmati rice 5kg", checked: false },
    ]);
    expect(text).toBe("Shopping list:\n• Milk\n• Basmati rice 5kg");
    expect(listShareText("Packing list", [])).toBe(
      "Packing list: nothing on the list right now.",
    );
  });

  it("encodes the text into a wa.me link", () => {
    expect(whatsappLink("Shopping list:\n• Milk & eggs")).toBe(
      "https://wa.me/?text=Shopping%20list%3A%0A%E2%80%A2%20Milk%20%26%20eggs",
    );
  });

  it("describes tasks and events", () => {
    expect(
      taskShareText({
        title: "Book NCT",
        dueOn: "2026-10-24",
        assigneeName: "Junaid",
      }),
    ).toBe("To do: Book NCT\nDue: Sat 24 Oct\nFor: Junaid");
    expect(
      tasksShareText([
        { title: "Book NCT", dueOn: "2026-10-24", assigneeName: "Junaid" },
        { title: "Renew passport", dueOn: null },
      ]),
    ).toBe("To do:\n• Book NCT (Sat 24 Oct, Junaid)\n• Renew passport");
    expect(
      eventShareText({
        title: "Dentist",
        date: "2026-10-22",
        allDay: false,
        time: "18:15",
        endTime: "18:45",
        location: "Main St",
        who: ["Ammara"],
      }),
    ).toBe("Dentist\nThu 22 Oct, 18:15–18:45\nWhere: Main St\nWho: Ammara");
    expect(
      eventShareText({
        title: "Midterm",
        date: "2026-10-26",
        lastDate: "2026-10-30",
        allDay: true,
      }),
    ).toBe("Midterm\nMon 26 Oct to Fri 30 Oct");
  });
});

describe("ages", () => {
  it("labels ages in years, or months for babies", () => {
    expect(ageLabel("2022-03-10", "2026-10-21")).toBe("4 years");
    expect(ageLabel("2022-10-22", "2026-10-21")).toBe("3 years");
    expect(ageLabel("2025-10-21", "2026-10-21")).toBe("1 year");
    expect(ageLabel("2025-01-15", "2026-10-21")).toBe("21 months");
    expect(ageLabel("2026-03-31", "2026-04-30")).toBe("1 month");
    expect(ageLabel("2026-10-10", "2026-10-21")).toBe("Newborn");
    expect(ageLabel("2027-01-01", "2026-10-21")).toBeNull();
  });

  it("makes initials", () => {
    expect(initials("Junaid")).toBe("J");
    expect(initials("ammara khan")).toBe("AK");
    expect(initials("  ")).toBe("?");
  });
});

describe("ecceHint", () => {
  it("starts in the September once the child is 2 years 8 months by 31 August", () => {
    // Born 15 Dec 2024: 2y8m on 15 Aug 2027 → September 2027.
    expect(ecceHint("2024-12-15", "2026-10-21")).toEqual({
      startYear: 2027,
      status: "upcoming",
      label: "ECCE: eligible from Sept 2027",
    });
    // Born 31 Dec 2024: 2y8m on 31 Aug 2027 → still September 2027.
    expect(ecceHint("2024-12-31", "2026-10-21")?.startYear).toBe(2027);
    // Born 1 Jan 2025: 2y8m on 1 Sep 2027 → September 2028.
    expect(ecceHint("2025-01-01", "2026-10-21")?.startYear).toBe(2028);
  });

  it("says eligible now during the two ECCE years and nothing after", () => {
    expect(ecceHint("2023-06-01", "2026-10-21")).toMatchObject({
      status: "eligible",
      label: "ECCE: eligible now (from Sept 2026)",
    });
    expect(ecceHint("2020-01-01", "2026-10-21")).toBeNull();
  });
});

describe("planFamilyReminders", () => {
  const today = "2026-10-21";
  const app = (over: Partial<ReminderApplication>): ReminderApplication => ({
    id: "app1",
    schoolId: "s1",
    schoolName: "Scoil Mhuire",
    childName: "Ivy",
    status: "researching",
    applicationDeadline: null,
    openDay: null,
    ...over,
  });

  it("notifies tasks due today and overdue, keyed per task and due date", () => {
    const planned = planFamilyReminders({
      householdId: "h",
      today,
      openTasks: [
        {
          id: "t1",
          title: "Bins",
          dueOn: today,
          dueTime: "08:00:00",
          assigneeName: "Junaid",
        },
        {
          id: "t2",
          title: "NCT",
          dueOn: "2026-10-18",
          dueTime: null,
          assigneeName: null,
        },
        {
          id: "t3",
          title: "Later",
          dueOn: "2026-10-25",
          dueTime: null,
          assigneeName: null,
        },
      ],
      todaysEvents: [],
      applications: [],
    });
    expect(planned.map((n) => [n.title, n.dedupeKey, n.severity])).toEqual([
      ["Due today: Bins", "family:task:t1:2026-10-21", "warning"],
      ["Overdue: NCT", "family:task:t2:2026-10-18", "critical"],
    ]);
    expect(planned[0].body).toBe("By 08:00 · Junaid");
  });

  it("summarises today's events in one notification", () => {
    const [n] = planFamilyReminders({
      householdId: "h",
      today,
      openTasks: [],
      todaysEvents: [
        { title: "Football", time: "19:00" },
        { title: "Midterm", time: null },
        { title: "Swimming", time: "17:30" },
      ],
      applications: [],
    });
    expect(n.title).toBe("Today: 3 events");
    expect(n.body).toBe("All day Midterm · 17:30 Swimming · 19:00 Football");
    expect(n.dedupeKey).toBe("family:events:2026-10-21");
  });

  it("warns about deadlines within 7 days (not yet applied) and open days tomorrow", () => {
    const planned = planFamilyReminders({
      householdId: "h",
      today,
      openTasks: [],
      todaysEvents: [],
      applications: [
        app({ id: "a1", applicationDeadline: "2026-10-28" }),
        app({ id: "a2", applicationDeadline: "2026-10-29" }),
        app({ id: "a3", applicationDeadline: "2026-10-22", status: "applied" }),
        app({ id: "a4", applicationDeadline: "2026-10-20" }),
        app({ id: "a5", openDay: "2026-10-22" }),
        app({ id: "a6", openDay: "2026-10-22", childName: "Rowan" }),
      ],
    });
    expect(planned.map((n) => n.dedupeKey)).toEqual([
      "family:school-deadline:a1:2026-10-28",
      "family:open-day:s1:2026-10-22",
    ]);
    expect(planned[0].title).toBe(
      "School application closes in 7 days: Scoil Mhuire",
    );
  });

  it("sends nothing when nothing is due", () => {
    expect(
      planFamilyReminders({
        householdId: "h",
        today,
        openTasks: [],
        todaysEvents: [],
        applications: [],
      }),
    ).toEqual([]);
  });
});
