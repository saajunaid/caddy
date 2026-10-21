"use client";

import { useActionState, useState } from "react";
import { MONTH_SHORT } from "../../documents/review";
import { btn, input } from "../../ui";
import { saveWfhDaysAction, type TaxFormState } from "../actions";
import { daysInMonth } from "../domain/wfh";

/** Days worked from home for each month of the year, for one person. Blank = not entered. */
export function WfhDaysForm({
  memberId,
  memberName,
  year,
  daysByMonth,
}: {
  memberId: string;
  memberName: string;
  year: number;
  daysByMonth: (number | null)[];
}) {
  const [state, formAction, pending] = useActionState<TaxFormState, FormData>(
    saveWfhDaysAction,
    {},
  );
  const [values, setValues] = useState(() =>
    daysByMonth.map((d) => (d === null ? "" : String(d))),
  );
  const total = values.reduce(
    (sum, v) => sum + (/^\d+$/.test(v) ? Number(v) : 0),
    0,
  );
  const entered = values.filter((v) => v !== "").length;

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="memberId" value={memberId} />
      <input type="hidden" name="year" value={year} />
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-semibold">{memberName}</h3>
        <span className="text-sm">
          <span className="num font-semibold">{total}</span> days
          <span className="text-muted"> · {entered} of 12 months entered</span>
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {MONTH_SHORT.map((name, index) => {
          const max = daysInMonth(year, index + 1);
          return (
            <label
              key={name}
              className="grid gap-1 text-xs font-semibold text-muted"
            >
              {name}
              <input
                name={`m${index + 1}`}
                inputMode="numeric"
                pattern="\d{1,2}"
                value={values[index]}
                aria-label={`${memberName}, ${name} ${year}: days worked from home (0 to ${max})`}
                className={`${input} num text-center text-sm text-fg`}
                onChange={(e) =>
                  setValues((all) =>
                    all.map((v, i) =>
                      i === index ? e.target.value.trim() : v,
                    ),
                  )
                }
              />
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={btn} disabled={pending}>
          {pending ? "Saving…" : "Save days"}
        </button>
        {state.error ? (
          <p role="alert" className="text-sm text-bad">
            {state.error}
          </p>
        ) : null}
        {state.notice ? (
          <p role="status" className="text-sm text-ok">
            {state.notice}
          </p>
        ) : null}
      </div>
    </form>
  );
}
