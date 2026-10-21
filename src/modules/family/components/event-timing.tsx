"use client";

import { useState } from "react";
import { inputClass, labelClass } from "./ui";

/** Date and time fields for an event; times hide when "All day" is ticked. */
export function EventTiming({
  allDay: initialAllDay,
  date,
  endDate,
  startTime,
  endTime,
}: {
  allDay: boolean;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
}) {
  const [allDay, setAllDay] = useState(initialAllDay);
  return (
    <div className="grid gap-3">
      <label className="flex min-h-10 items-center gap-2.5">
        <input
          type="checkbox"
          name="allDay"
          checked={allDay}
          onChange={(event) => setAllDay(event.target.checked)}
          className="size-[18px] accent-[var(--purple)]"
        />
        <span className={labelClass}>All day</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <label htmlFor="event-date" className={labelClass}>
            {allDay ? "First day" : "Date"}
          </label>
          <input
            id="event-date"
            name="date"
            type="date"
            required
            defaultValue={date}
            className={inputClass}
          />
        </div>
        {allDay ? (
          <div className="grid gap-1.5">
            <label htmlFor="event-end-date" className={labelClass}>
              Last day{" "}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="event-end-date"
              name="endDate"
              type="date"
              defaultValue={endDate ?? ""}
              className={inputClass}
            />
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <label htmlFor="event-start" className={labelClass}>
                Starts
              </label>
              <input
                id="event-start"
                name="startTime"
                type="time"
                required
                defaultValue={startTime ?? ""}
                className={inputClass}
              />
            </div>
            <div className="grid gap-1.5">
              <label htmlFor="event-end" className={labelClass}>
                Ends <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                id="event-end"
                name="endTime"
                type="time"
                defaultValue={endTime ?? ""}
                className={inputClass}
              />
            </div>
          </>
        )}
      </div>
      <p className="text-sm text-muted">
        Times are Irish time. Clashes are checked against other timed events for
        the same people; an event without an end time counts as one hour.
      </p>
    </div>
  );
}
