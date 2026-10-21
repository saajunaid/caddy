"use client";

import { useActionState } from "react";
import { saveProjectAction, type FormState } from "../actions";
import type { Project } from "../queries";
import { btnPrimary, fieldLabel, input } from "./styles";

const CONFIRMATION_LABELS = {
  unconfirmed: "Unconfirmed",
  yes: "Confirmed Cost Rental",
  no: "Not Cost Rental",
} as const;

const VERIFICATION_LABELS = {
  lead: "Lead (unverified)",
  needs_verification: "Needs verification",
  reported: "Reported (news)",
  officially_confirmed: "Officially confirmed",
  contradicted: "Contradicted",
} as const;

function Field({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  maxLength,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={type === "number" ? "numeric" : undefined}
        min={type === "number" ? 0 : undefined}
        maxLength={maxLength}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className={input}
      />
    </div>
  );
}

/** Add or edit a pipeline project. */
export function ProjectForm({ project }: { project?: Project }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveProjectAction,
    {},
  );
  const p = project;
  const key = p?.id ?? "new";
  return (
    <form action={formAction} className="grid gap-3">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <Field
        id={`${key}-name`}
        name="name"
        label="Name"
        defaultValue={p?.name}
        maxLength={200}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${key}-locality`}
          name="locality"
          label="Locality"
          defaultValue={p?.locality}
          maxLength={120}
        />
        <Field
          id={`${key}-county`}
          name="county"
          label="County"
          defaultValue={p?.county}
          maxLength={60}
        />
        <Field
          id={`${key}-provider`}
          name="provider"
          label="Provider"
          defaultValue={p?.provider}
          maxLength={200}
        />
        <Field
          id={`${key}-stage`}
          name="stage"
          label="Stage"
          defaultValue={p?.stage}
          maxLength={200}
          placeholder="e.g. Planning granted"
        />
        <Field
          id={`${key}-total`}
          name="total_homes"
          label="Total homes"
          type="number"
          defaultValue={p?.total_homes}
        />
        <Field
          id={`${key}-cr`}
          name="cost_rental_homes"
          label="Cost Rental homes"
          type="number"
          defaultValue={p?.cost_rental_homes}
        />
        <Field
          id={`${key}-mix`}
          name="bedroom_mix"
          label="Bedroom mix"
          defaultValue={p?.bedroom_mix}
          maxLength={200}
          placeholder="e.g. 1–4 bed"
        />
        <Field
          id={`${key}-expected`}
          name="expected_date_text"
          label="Expected"
          defaultValue={p?.expected_date_text}
          maxLength={120}
          placeholder="As the source says it, e.g. “late 2027”"
        />
        <div className="grid gap-1.5">
          <label htmlFor={`${key}-confirmed`} className={fieldLabel}>
            Cost Rental?
          </label>
          <select
            id={`${key}-confirmed`}
            name="cost_rental_confirmed"
            defaultValue={p?.cost_rental_confirmed ?? "unconfirmed"}
            className={input}
          >
            {Object.entries(CONFIRMATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${key}-verification`} className={fieldLabel}>
            Verification
          </label>
          <select
            id={`${key}-verification`}
            name="verification"
            defaultValue={p?.verification ?? "lead"}
            className={input}
          >
            {Object.entries(VERIFICATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Field
          id={`${key}-source`}
          name="source_url"
          label="Source link"
          type="url"
          defaultValue={p?.source_url}
          placeholder="https://…"
        />
        <Field
          id={`${key}-checked`}
          name="last_checked_on"
          label="Last checked"
          type="date"
          defaultValue={p?.last_checked_on}
        />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${key}-notes`} className={fieldLabel}>
          Notes
        </label>
        <textarea
          id={`${key}-notes`}
          name="notes"
          rows={3}
          maxLength={4000}
          defaultValue={p?.notes ?? ""}
          className={`${input} min-h-[72px] resize-y`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : p ? "Save changes" : "Add project"}
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
