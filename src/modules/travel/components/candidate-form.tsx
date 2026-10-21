"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveCandidateAction, type FormState } from "../actions";
import { COUNTRIES } from "../server/deep-links";
import { CANDIDATE_STATUSES } from "../server/labels";
import {
  buttonClass,
  Field,
  Fieldset,
  FormErrors,
  inputClass,
  primaryButtonClass,
  textareaClass,
} from "./ui";

export type CandidateFormValues = {
  id: string;
  destination: string;
  destination_airport: string | null;
  destination_country: string | null;
  outbound_date: string;
  return_date: string;
  departure_airport: string;
  notes: string | null;
  trade_offs: string | null;
  status: string;
};

const STATUS_LABELS: Record<string, string> = {
  option: "Option",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
  booked: "Booked (by you)",
};

export function CandidateForm({
  tripId,
  airports,
  defaults,
  candidate,
}: {
  tripId: string;
  airports: string[];
  defaults: { outbound: string; inbound: string };
  candidate?: CandidateFormValues;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveCandidateAction,
    {},
  );
  return (
    <form action={formAction} className="grid gap-[22px]">
      <input type="hidden" name="trip_id" value={tripId} />
      {candidate ? (
        <input type="hidden" name="candidate_id" value={candidate.id} />
      ) : null}
      <FormErrors errors={state.errors} />
      <Fieldset legend="Where and when">
        <Field
          id="destination"
          label="Destination"
          hint="As you'd type it into Booking.com, e.g. Albufeira, Algarve"
        >
          <input
            id="destination"
            name="destination"
            required
            maxLength={120}
            defaultValue={candidate?.destination}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="destination_airport"
            label="Arrival airport code"
            hint="Optional, e.g. FAO. Makes the Skyscanner link precise."
          >
            <input
              id="destination_airport"
              name="destination_airport"
              maxLength={3}
              autoCapitalize="characters"
              defaultValue={candidate?.destination_airport ?? ""}
              className={`${inputClass} num uppercase`}
            />
          </Field>
          <Field
            id="destination_country"
            label="Country"
            hint="For the Irish travel advice link"
          >
            <select
              id="destination_country"
              name="destination_country"
              defaultValue={candidate?.destination_country ?? ""}
              className={inputClass}
            >
              <option value="">Not set</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="outbound_date" label="Outbound">
            <input
              id="outbound_date"
              name="outbound_date"
              type="date"
              required
              defaultValue={candidate?.outbound_date ?? defaults.outbound}
              className={inputClass}
            />
          </Field>
          <Field id="return_date" label="Return">
            <input
              id="return_date"
              name="return_date"
              type="date"
              required
              defaultValue={candidate?.return_date ?? defaults.inbound}
              className={inputClass}
            />
          </Field>
          <Field id="departure_airport" label="Flying from">
            <input
              id="departure_airport"
              name="departure_airport"
              required
              maxLength={40}
              list="trip-airports"
              defaultValue={
                candidate?.departure_airport ?? airports[0] ?? "DUB"
              }
              className={`${inputClass} num`}
            />
            <datalist id="trip-airports">
              {airports.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>
          {candidate ? (
            <Field id="status" label="Status">
              <select
                id="status"
                name="status"
                defaultValue={candidate.status}
                className={inputClass}
              >
                {CANDIDATE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      </Fieldset>
      <Fieldset legend="Your notes">
        <Field
          id="trade_offs"
          label="Trade-offs"
          hint="E.g. 3★ hotel, 1.2 km from the beach. Shown on the comparison card."
        >
          <textarea
            id="trade_offs"
            name="trade_offs"
            maxLength={2000}
            defaultValue={candidate?.trade_offs ?? ""}
            className={textareaClass}
          />
        </Field>
        <Field id="notes" label="Notes">
          <textarea
            id="notes"
            name="notes"
            maxLength={4000}
            defaultValue={candidate?.notes ?? ""}
            className={textareaClass}
          />
        </Field>
      </Fieldset>
      <FormErrors errors={state.errors} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending
            ? "Saving…"
            : candidate
              ? "Save option"
              : "Save and add prices"}
        </button>
        <Link href={`/travel/${tripId}`} className={buttonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
