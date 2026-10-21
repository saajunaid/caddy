// Form and action input validation for the Family module. Shared by server actions and tests.
import { z } from "zod";
import { addDays, isIsoDate, zonedInstant } from "./server/time.ts";

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;
const trimmed = (v: unknown) => (typeof v === "string" ? v.trim() : v);

const text = (max: number) =>
  z.preprocess(
    trimmed,
    z.string().min(1, "Required").max(max, `Keep it under ${max} characters`),
  );
const optionalText = (max: number) =>
  z.preprocess(
    (v) => emptyToNull(trimmed(v)),
    z
      .string()
      .max(max, `Keep it under ${max} characters`)
      .nullable()
      .default(null),
  );
const isoDate = z.string().refine(isIsoDate, "Enter a valid date");
const optionalDate = z.preprocess(
  emptyToNull,
  isoDate.nullable().default(null),
);
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Enter a valid time")
  .transform((v) => v.slice(0, 5));
const optionalTime = z.preprocess(emptyToNull, time.nullable().default(null));
const optionalUrl = z.preprocess(
  (v) => emptyToNull(trimmed(v)),
  z
    .url({
      protocol: /^https?$/,
      message: "Enter a link starting with https://",
    })
    .max(2000)
    .nullable()
    .default(null),
);
const optionalUuid = z.preprocess(
  emptyToNull,
  z.uuid().nullable().default(null),
);
const checkbox = z.preprocess(
  (v) => v === "on" || v === "true" || v === true,
  z.boolean(),
);

export const TASK_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;
export const EVENT_RECURRENCES = ["none", "weekly", "yearly"] as const;
export const LIST_KINDS = [
  "shopping",
  "household",
  "packing",
  "other",
] as const;
export const SCHOOL_LEVELS = [
  "ecce",
  "primary",
  "secondary",
  "further",
  "higher",
] as const;
export const APPLICATION_STATUSES = [
  "researching",
  "applied",
  "offered",
  "accepted",
  "declined",
  "waitlisted",
  "unsuccessful",
] as const;

export const taskSchema = z
  .object({
    title: text(200),
    notes: optionalText(4000),
    dueOn: optionalDate,
    dueTime: optionalTime,
    assigneeMemberId: optionalUuid,
    recurrence: z.enum(TASK_RECURRENCES).default("none"),
    recurrenceInterval: z.coerce.number().int().min(1).max(365).default(1),
    relatedUrl: optionalUrl,
  })
  .refine((t) => !t.dueTime || t.dueOn, {
    message: "Add a due date to set a time",
    path: ["dueTime"],
  })
  .refine((t) => t.recurrence === "none" || t.dueOn, {
    message: "Repeating tasks need a first due date",
    path: ["dueOn"],
  });
export type TaskInput = z.infer<typeof taskSchema>;

/** Input other modules use to create a task (e.g. from a housing deadline). */
export const taskFromSchema = z.object({
  title: text(200),
  dueOn: optionalDate.optional(),
  relatedEntityType: optionalText(60).optional(),
  relatedEntityId: optionalText(200).optional(),
  relatedUrl: optionalUrl.optional(),
});
export type TaskFromInput = z.input<typeof taskFromSchema>;

export const eventSchema = z
  .object({
    title: text(200),
    allDay: checkbox,
    date: isoDate,
    endDate: optionalDate,
    startTime: optionalTime,
    endTime: optionalTime,
    location: optionalText(300),
    notes: optionalText(4000),
    memberIds: z.array(z.uuid()).max(20).default([]),
    recurrence: z.enum(EVENT_RECURRENCES).default("none"),
    relatedUrl: optionalUrl,
  })
  .refine((e) => e.allDay || e.startTime, {
    message: "Add a start time, or tick All day",
    path: ["startTime"],
  })
  .refine((e) => !e.allDay || !e.endDate || e.endDate >= e.date, {
    message: "The last day can't be before the first",
    path: ["endDate"],
  });
export type EventInput = z.infer<typeof eventSchema>;

/** Database columns for an event form. Times are household (Dublin) wall-clock times. */
export function eventColumns(input: EventInput) {
  if (input.allDay) {
    return {
      all_day: true,
      start_date: input.date,
      end_date:
        input.endDate && input.endDate > input.date ? input.endDate : null,
      starts_at: zonedInstant(input.date).toISOString(),
      ends_at: null,
    };
  }
  const start = zonedInstant(input.date, input.startTime ?? "00:00");
  let end: Date | null = null;
  if (input.endTime) {
    end = zonedInstant(input.date, input.endTime);
    // An end time before the start means it finishes after midnight.
    if (end <= start) end = zonedInstant(addDays(input.date, 1), input.endTime);
  }
  return {
    all_day: false,
    start_date: null,
    end_date: null,
    starts_at: start.toISOString(),
    ends_at: end ? end.toISOString() : null,
  };
}

export const listSchema = z.object({
  name: text(80),
  kind: z.enum(LIST_KINDS).default("other"),
});

export const listItemSchema = z.object({ text: text(200) });

export const childSchema = z.object({
  name: text(60),
  dateOfBirth: optionalDate,
});

export const schoolSchema = z
  .object({
    name: text(160),
    level: z.enum(SCHOOL_LEVELS),
    address: optionalText(300),
    website: optionalUrl,
    admissionsPolicyUrl: optionalUrl,
    policyCheckedOn: optionalDate,
    latitude: z.preprocess(
      emptyToNull,
      z.coerce.number().min(-90).max(90).nullable().default(null),
    ),
    longitude: z.preprocess(
      emptyToNull,
      z.coerce.number().min(-180).max(180).nullable().default(null),
    ),
    notes: optionalText(4000),
  })
  .refine((s) => (s.latitude === null) === (s.longitude === null), {
    message: "Enter both latitude and longitude, or neither",
    path: ["longitude"],
  });

export const applicationSchema = z.object({
  schoolId: z.uuid("Choose a school"),
  childMemberId: z.uuid("Choose a child"),
  intakeYear: z.coerce.number().int().min(2000).max(2100),
  status: z.enum(APPLICATION_STATUSES).default("researching"),
  preferenceRank: z.preprocess(
    emptyToNull,
    z.coerce.number().int().min(1).max(50).nullable().default(null),
  ),
  applicationDeadline: optionalDate,
  openDay: optionalDate,
  decisionDate: optionalDate,
  notes: optionalText(4000),
});

export const feedSchema = z.object({
  label: z.preprocess(
    (v) => emptyToNull(trimmed(v)) ?? "Calendar feed",
    z.string().max(60, "Keep it under 60 characters"),
  ),
});

/** FormData → plain object; repeated names (checkbox groups) become arrays. */
export function formObject(
  formData: FormData,
  arrays: readonly string[] = [],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = formData.getAll(key).filter((v) => typeof v === "string");
    out[key] = arrays.includes(key) ? values : values[0];
  }
  for (const key of arrays) out[key] ??= [];
  return out;
}

/** First validation message, for a single-line form error. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}
