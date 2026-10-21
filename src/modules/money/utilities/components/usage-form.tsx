"use client";

import { useActionState } from "react";
import type { FormState } from "../actions";
import { BAND_LABELS, type Band } from "../server/types";
import { buttonClass, Field, FormMessage, TextInput } from "./form-bits";

const FIELD: Record<Band, string> = {
  day: "day_kwh",
  night: "night_kwh",
  peak: "peak_kwh",
  standard: "standard_kwh",
  gas: "gas_kwh",
};

/** Manual kWh per band for one bill period, copied from the bill. */
export function UsageForm({
  action,
  bands,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  bands: Band[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const v = state.values ?? {};
  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Field id="period_start" label="Bill period from">
          <TextInput
            id="period_start"
            name="period_start"
            type="date"
            required
            defaultValue={v.period_start ?? ""}
          />
        </Field>
        <Field id="period_end" label="to (inclusive)">
          <TextInput
            id="period_end"
            name="period_end"
            type="date"
            required
            defaultValue={v.period_end ?? ""}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {bands.map((band) => (
          <Field key={band} id={FIELD[band]} label={`${BAND_LABELS[band]} kWh`}>
            <TextInput
              id={FIELD[band]}
              name={FIELD[band]}
              inputMode="decimal"
              autoComplete="off"
              className="num"
              defaultValue={v[FIELD[band]] ?? ""}
            />
          </Field>
        ))}
        <Field id="total" label="Bill total € (optional)">
          <TextInput
            id="total"
            name="total"
            inputMode="decimal"
            autoComplete="off"
            className="num"
            defaultValue={v.total ?? ""}
          />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Copy the kWh exactly as printed; leave a band blank if it isn&apos;t on
        the bill. Confirmed bills from the Bills tab will fill this in
        automatically later.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Adding…" : "Add bill period"}
        </button>
        <FormMessage error={state.error} notice={state.notice} />
      </div>
    </form>
  );
}
