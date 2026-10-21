import type { ReactNode } from "react";
import type {
  Application,
  EventRow,
  Member,
  School,
  TaskRow,
} from "../queries";
import { APPLICATION_STATUSES, SCHOOL_LEVELS } from "../schemas";
import { dublinDate, dublinTime } from "../server/time.ts";
import { EventTiming } from "./event-timing";
import { inputClass, labelClass, textareaClass } from "./ui";

export const LEVEL_LABELS: Record<string, string> = {
  ecce: "Preschool (ECCE)",
  primary: "Primary",
  secondary: "Secondary",
  further: "Further education",
  higher: "Higher education",
};

export const KIND_LABELS: Record<string, string> = {
  shopping: "Shopping",
  household: "Household",
  packing: "Packing",
  other: "Other",
};

export const STATUS_LABELS: Record<string, string> = {
  researching: "Researching",
  applied: "Applied",
  offered: "Offered",
  accepted: "Accepted",
  declined: "Declined",
  waitlisted: "Waitlisted",
  unsuccessful: "Unsuccessful",
};

export function Field({
  id,
  label,
  hint,
  optional,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
        {optional ? (
          <span className="font-normal text-muted"> (optional)</span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

function PersonSelect({
  id,
  name,
  members,
  value,
  emptyLabel,
  required,
}: {
  id: string;
  name: string;
  members: Member[];
  value: string | null;
  emptyLabel?: string;
  required?: boolean;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={value ?? ""}
      required={required}
      className={inputClass}
    >
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}

export function TaskFields({
  task,
  members,
  returnTo,
  defaultDueOn,
}: {
  task?: TaskRow;
  members: Member[];
  returnTo?: string;
  defaultDueOn?: string;
}) {
  return (
    <>
      {returnTo ? (
        <input type="hidden" name="returnTo" value={returnTo} />
      ) : null}
      <Field id="task-title" label="What needs doing">
        <input
          id="task-title"
          name="title"
          required
          maxLength={200}
          defaultValue={task?.title}
          placeholder="e.g. Book NCT for the car"
          className={inputClass}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="task-due" label="Due" optional>
          <input
            id="task-due"
            name="dueOn"
            type="date"
            defaultValue={task?.dueOn ?? defaultDueOn ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="task-time" label="By" optional>
          <input
            id="task-time"
            name="dueTime"
            type="time"
            defaultValue={task?.dueTime ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="task-assignee" label="Who">
          <PersonSelect
            id="task-assignee"
            name="assigneeMemberId"
            members={members}
            value={task?.assigneeMemberId ?? null}
            emptyLabel="Anyone"
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="task-repeat" label="Repeats">
          <select
            id="task-repeat"
            name="recurrence"
            defaultValue={task?.recurrence ?? "none"}
            className={inputClass}
          >
            <option value="none">Doesn&apos;t repeat</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
        <Field
          id="task-interval"
          label="Every"
          hint="e.g. 2 with Weekly = every second week"
        >
          <input
            id="task-interval"
            name="recurrenceInterval"
            type="number"
            min={1}
            max={365}
            defaultValue={task?.recurrenceInterval ?? 1}
            className={inputClass}
          />
        </Field>
        <Field id="task-url" label="Link" optional>
          <input
            id="task-url"
            name="relatedUrl"
            type="url"
            defaultValue={task?.relatedUrl ?? ""}
            placeholder="https://"
            className={inputClass}
          />
        </Field>
      </div>
      <Field id="task-notes" label="Notes" optional>
        <textarea
          id="task-notes"
          name="notes"
          maxLength={4000}
          defaultValue={task?.notes ?? ""}
          className={textareaClass}
        />
      </Field>
    </>
  );
}

export function EventFields({
  event,
  members,
  defaultDate,
}: {
  event?: EventRow;
  members: Member[];
  defaultDate: string;
}) {
  const date = event
    ? (event.startDate ?? dublinDate(event.startsAt))
    : defaultDate;
  return (
    <>
      <Field id="event-title" label="What">
        <input
          id="event-title"
          name="title"
          required
          maxLength={200}
          defaultValue={event?.title}
          placeholder="e.g. Dentist"
          className={inputClass}
        />
      </Field>
      <EventTiming
        allDay={event?.allDay ?? false}
        date={date}
        endDate={event?.endDate ?? null}
        startTime={event && !event.allDay ? dublinTime(event.startsAt) : null}
        endTime={
          event && !event.allDay && event.endsAt
            ? dublinTime(event.endsAt)
            : null
        }
      />
      <fieldset className="grid gap-1.5">
        <legend className={`${labelClass} mb-1.5`}>
          Who&apos;s involved{" "}
          <span className="font-normal text-muted">
            (none ticked = everyone)
          </span>
        </legend>
        {members.length === 0 ? (
          <p className="text-sm text-muted">
            Add people on the Family page to tag them here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <label
                key={m.id}
                className="flex min-h-10 items-center gap-2 rounded-full border border-line px-3 has-[:checked]:border-accent"
              >
                <input
                  type="checkbox"
                  name="memberIds"
                  value={m.id}
                  defaultChecked={event?.memberIds.includes(m.id)}
                  className="size-4 accent-[var(--purple)]"
                />
                <span className="text-sm">{m.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="event-location" label="Where" optional>
          <input
            id="event-location"
            name="location"
            maxLength={300}
            defaultValue={event?.location ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="event-repeat" label="Repeats">
          <select
            id="event-repeat"
            name="recurrence"
            defaultValue={event?.recurrence ?? "none"}
            className={inputClass}
          >
            <option value="none">Doesn&apos;t repeat</option>
            <option value="weekly">Every week</option>
            <option value="yearly">Every year</option>
          </select>
        </Field>
      </div>
      <Field id="event-url" label="Link" optional>
        <input
          id="event-url"
          name="relatedUrl"
          type="url"
          defaultValue={event?.relatedUrl ?? ""}
          placeholder="https://"
          className={inputClass}
        />
      </Field>
      <Field id="event-notes" label="Notes" optional>
        <textarea
          id="event-notes"
          name="notes"
          maxLength={4000}
          defaultValue={event?.notes ?? ""}
          className={textareaClass}
        />
      </Field>
    </>
  );
}

export function PersonFields({
  member,
  today,
}: {
  member?: Member;
  today: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field id="person-name" label="Name">
        <input
          id="person-name"
          name="name"
          required
          maxLength={60}
          defaultValue={member?.name}
          readOnly={member?.hasLogin}
          className={inputClass}
        />
      </Field>
      <Field id="person-dob" label="Date of birth" optional>
        <input
          id="person-dob"
          name="dateOfBirth"
          type="date"
          max={today}
          defaultValue={member?.dateOfBirth ?? ""}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

export function SchoolFields({ school }: { school?: School }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field id="school-name" label="School">
          <input
            id="school-name"
            name="name"
            required
            maxLength={160}
            defaultValue={school?.name}
            className={inputClass}
          />
        </Field>
        <Field id="school-level" label="Level">
          <select
            id="school-level"
            name="level"
            defaultValue={school?.level ?? "primary"}
            className={inputClass}
          >
            {SCHOOL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABELS[level]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="school-address" label="Address" optional>
        <input
          id="school-address"
          name="address"
          maxLength={300}
          defaultValue={school?.address ?? ""}
          className={inputClass}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="school-website" label="Website" optional>
          <input
            id="school-website"
            name="website"
            type="url"
            placeholder="https://"
            defaultValue={school?.website ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="school-policy" label="Admissions policy link" optional>
          <input
            id="school-policy"
            name="admissionsPolicyUrl"
            type="url"
            placeholder="https://"
            defaultValue={school?.admissionsPolicyUrl ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          id="school-checked"
          label="Policy checked on"
          optional
          hint="When you last read the policy"
        >
          <input
            id="school-checked"
            name="policyCheckedOn"
            type="date"
            defaultValue={school?.policyCheckedOn ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="school-lat" label="Latitude" optional>
          <input
            id="school-lat"
            name="latitude"
            inputMode="decimal"
            defaultValue={school?.latitude ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="school-lng" label="Longitude" optional>
          <input
            id="school-lng"
            name="longitude"
            inputMode="decimal"
            defaultValue={school?.longitude ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <Field id="school-notes" label="Notes" optional>
        <textarea
          id="school-notes"
          name="notes"
          maxLength={4000}
          defaultValue={school?.notes ?? ""}
          className={textareaClass}
        />
      </Field>
    </>
  );
}

export function ApplicationFields({
  application,
  schools,
  kids,
  defaultSchoolId,
  defaultYear,
}: {
  application?: Application;
  schools: School[];
  /** The household's children. */
  kids: Member[];
  defaultSchoolId?: string;
  defaultYear: number;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="app-school" label="School">
          <select
            id="app-school"
            name="schoolId"
            required
            defaultValue={application?.schoolId ?? defaultSchoolId ?? ""}
            className={inputClass}
          >
            <option value="" disabled>
              Choose a school
            </option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field id="app-child" label="Child">
          <PersonSelect
            id="app-child"
            name="childMemberId"
            members={kids}
            value={application?.childMemberId ?? kids[0]?.id ?? null}
            required
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="app-year" label="Starting in (September)">
          <input
            id="app-year"
            name="intakeYear"
            type="number"
            min={2000}
            max={2100}
            required
            defaultValue={application?.intakeYear ?? defaultYear}
            className={inputClass}
          />
        </Field>
        <Field id="app-status" label="Status">
          <select
            id="app-status"
            name="status"
            defaultValue={application?.status ?? "researching"}
            className={inputClass}
          >
            {APPLICATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="app-rank"
          label="Preference"
          optional
          hint="1 = first choice"
        >
          <input
            id="app-rank"
            name="preferenceRank"
            type="number"
            min={1}
            max={50}
            defaultValue={application?.preferenceRank ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="app-deadline" label="Application deadline" optional>
          <input
            id="app-deadline"
            name="applicationDeadline"
            type="date"
            defaultValue={application?.applicationDeadline ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="app-open-day" label="Open day" optional>
          <input
            id="app-open-day"
            name="openDay"
            type="date"
            defaultValue={application?.openDay ?? ""}
            className={inputClass}
          />
        </Field>
        <Field id="app-decision" label="Decision expected" optional>
          <input
            id="app-decision"
            name="decisionDate"
            type="date"
            defaultValue={application?.decisionDate ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <Field id="app-notes" label="Notes" optional>
        <textarea
          id="app-notes"
          name="notes"
          maxLength={4000}
          defaultValue={application?.notes ?? ""}
          className={textareaClass}
        />
      </Field>
    </>
  );
}
