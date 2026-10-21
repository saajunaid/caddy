"use client";

import Link from "next/link";
import { Plus, X } from "lucide-react";
import { useActionState, useState } from "react";
import { saveTripAction, type FormState } from "../actions";
import { minorToDecimal } from "../server/currency";
import { minutesToHours } from "../server/forms";
import {
  BOARD_BASES,
  BOARD_LABELS,
  IRISH_AIRPORTS,
  TRIP_STATUSES,
} from "../server/labels";
import { ageOn } from "../server/travellers";
import {
  buttonClass,
  Field,
  Fieldset,
  FormErrors,
  inputClass,
  primaryButtonClass,
  smallButtonClass,
  textareaClass,
} from "./ui";

export type TripFormTrip = {
  id: string;
  name: string;
  date_from: string;
  date_to: string;
  nights_min: number | null;
  nights_max: number | null;
  departure_airports: string[];
  destination_ideas: string | null;
  budget_cents: number | null;
  board_basis: string;
  room_needs: string | null;
  max_stops: number | null;
  max_flight_minutes: number | null;
  require_free_cancellation: boolean;
  status: string;
  notes: string | null;
};

export type TripFormTraveller = {
  id: string;
  member_id: string | null;
  name: string;
  is_child: boolean;
  age_at_travel: number | null;
  confirmed: boolean;
};

export type TripFormMember = {
  id: string;
  name: string;
  isChild: boolean;
  dateOfBirth: string | null;
};

type Row = {
  key: string;
  id: string | null;
  memberId: string | null;
  include: boolean;
  name: string;
  isChild: boolean;
  age: string;
  confirmed: boolean;
  dob: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  booked: "Booked",
  archived: "Archived",
};

function initialRows(
  members: TripFormMember[],
  travellers: TripFormTraveller[] | undefined,
  dateFrom: string,
): Row[] {
  const dobOf = (memberId: string | null) =>
    members.find((m) => m.id === memberId)?.dateOfBirth ?? null;
  if (travellers) {
    const rows: Row[] = travellers.map((t) => ({
      key: t.id,
      id: t.id,
      memberId: t.member_id,
      include: true,
      name: t.name,
      isChild: t.is_child,
      age: t.age_at_travel === null ? "" : String(t.age_at_travel),
      confirmed: t.confirmed,
      dob: dobOf(t.member_id),
    }));
    for (const m of members) {
      if (travellers.some((t) => t.member_id === m.id)) continue;
      rows.push(memberRow(m, false, dateFrom));
    }
    return rows;
  }
  return members.map((m) => memberRow(m, true, dateFrom));
}

function memberRow(m: TripFormMember, include: boolean, dateFrom: string): Row {
  const age =
    m.dateOfBirth && ISO_DATE.test(dateFrom)
      ? String(ageOn(m.dateOfBirth, dateFrom))
      : "";
  return {
    key: m.id,
    id: null,
    memberId: m.id,
    include,
    name: m.name,
    isChild: m.isChild,
    age,
    confirmed: !m.isChild,
    dob: m.dateOfBirth,
  };
}

export function TripForm({
  trip,
  travellers,
  members,
}: {
  trip?: TripFormTrip;
  travellers?: TripFormTraveller[];
  members: TripFormMember[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveTripAction,
    {},
  );
  const [dateFrom, setDateFrom] = useState(trip?.date_from ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    initialRows(members, travellers, trip?.date_from ?? ""),
  );

  const update = (key: string, patch: Partial<Row>) =>
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );

  // Ages change with the travel date: recompute from date of birth and ask to confirm again.
  const onDateFrom = (value: string) => {
    setDateFrom(value);
    if (!ISO_DATE.test(value)) return;
    setRows((current) =>
      current.map((r) => {
        if (!r.dob) return r;
        const age = String(ageOn(r.dob, value));
        return age === r.age
          ? r
          : { ...r, age, confirmed: r.isChild ? false : r.confirmed };
      }),
    );
  };

  const otherAirports = (trip?.departure_airports ?? []).filter(
    (a) => !IRISH_AIRPORTS.some((x) => x.code === a),
  );
  const chosen = new Set(trip?.departure_airports ?? ["DUB"]);

  return (
    <form action={formAction} className="grid gap-[22px]">
      {trip ? <input type="hidden" name="trip_id" value={trip.id} /> : null}
      <FormErrors errors={state.errors} />

      <Fieldset legend="Trip">
        <Field
          id="name"
          label="Trip name"
          hint="For example: Mid-term Feb 2027"
        >
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            defaultValue={trip?.name}
            className={inputClass}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="date_from" label="Earliest departure">
            <input
              id="date_from"
              name="date_from"
              type="date"
              required
              value={dateFrom}
              onChange={(e) => onDateFrom(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field id="date_to" label="Latest return">
            <input
              id="date_to"
              name="date_to"
              type="date"
              required
              min={dateFrom || undefined}
              defaultValue={trip?.date_to}
              className={inputClass}
            />
          </Field>
          <Field id="nights_min" label="Nights (minimum)">
            <input
              id="nights_min"
              name="nights_min"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              defaultValue={trip?.nights_min ?? ""}
              className={inputClass}
            />
          </Field>
          <Field id="nights_max" label="Nights (maximum)">
            <input
              id="nights_max"
              name="nights_max"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              defaultValue={trip?.nights_max ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1.5 text-sm font-semibold">
            Departure airports
          </legend>
          <div className="flex flex-wrap gap-2">
            {IRISH_AIRPORTS.map((a) => (
              <label
                key={a.code}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-3.5 text-sm font-medium has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent"
              >
                <input
                  type="checkbox"
                  name="airport"
                  value={a.code}
                  defaultChecked={chosen.has(a.code)}
                  className="sr-only"
                />
                <span className="num">{a.code}</span> {a.name}
              </label>
            ))}
          </div>
          <label htmlFor="airports_other" className="sr-only">
            Other airports
          </label>
          <input
            id="airports_other"
            name="airports_other"
            placeholder="Other airports, comma-separated (e.g. BFS, NOC)"
            defaultValue={otherAirports.join(", ")}
            className={inputClass}
          />
        </fieldset>
        <Field
          id="destination_ideas"
          label="Destination ideas"
          hint="Optional. Places you're considering; options are added separately."
        >
          <textarea
            id="destination_ideas"
            name="destination_ideas"
            maxLength={500}
            defaultValue={trip?.destination_ideas ?? ""}
            className={textareaClass}
          />
        </Field>
      </Fieldset>

      <Fieldset legend="Who's going">
        <p className="text-sm text-muted">
          Children&apos;s ages change, so confirm each child&apos;s age at the
          start of this trip. Ages from a date of birth are filled in for you.
        </p>
        <input type="hidden" name="traveller_rows" value={rows.length} />
        <ul className="grid gap-3">
          {rows.map((row, i) => {
            const p = `t${i}_`;
            return (
              <li
                key={row.key}
                className="grid gap-3 rounded-lg border border-line bg-bg p-3 sm:grid-cols-[auto_1fr_8rem_6rem_auto] sm:items-end"
              >
                {row.id ? (
                  <input type="hidden" name={`${p}id`} value={row.id} />
                ) : null}
                {row.memberId ? (
                  <input
                    type="hidden"
                    name={`${p}member`}
                    value={row.memberId}
                  />
                ) : null}
                <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    name={`${p}include`}
                    checked={row.include}
                    onChange={(e) =>
                      update(row.key, { include: e.target.checked })
                    }
                    className="size-[18px] accent-[var(--purple)]"
                  />
                  Going
                </label>
                <Field id={`${p}name`} label="Name">
                  <input
                    id={`${p}name`}
                    name={`${p}name`}
                    value={row.name}
                    maxLength={60}
                    required={row.include}
                    onChange={(e) => update(row.key, { name: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field id={`${p}child`} label="Travels as">
                  <select
                    id={`${p}child`}
                    name={`${p}child`}
                    value={row.isChild ? "1" : "0"}
                    onChange={(e) =>
                      update(row.key, {
                        isChild: e.target.value === "1",
                        confirmed: e.target.value !== "1",
                      })
                    }
                    className={inputClass}
                  >
                    <option value="0">Adult</option>
                    <option value="1">Child</option>
                  </select>
                </Field>
                <Field id={`${p}age`} label="Age at travel">
                  <input
                    id={`${p}age`}
                    name={`${p}age`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={120}
                    value={row.age}
                    onChange={(e) =>
                      update(row.key, {
                        age: e.target.value,
                        confirmed: row.isChild ? false : row.confirmed,
                      })
                    }
                    className={`${inputClass} num`}
                  />
                </Field>
                <div className="flex min-h-10 items-center gap-2">
                  {row.isChild ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name={`${p}confirmed`}
                        checked={row.confirmed}
                        onChange={(e) =>
                          update(row.key, { confirmed: e.target.checked })
                        }
                        className="size-[18px] accent-[var(--purple)]"
                      />
                      <span
                        className={row.confirmed ? "text-ok" : "text-review"}
                      >
                        {row.confirmed ? "Age confirmed" : "Confirm age"}
                      </span>
                    </label>
                  ) : null}
                  {!row.memberId ? (
                    <button
                      type="button"
                      onClick={() =>
                        setRows((current) =>
                          current.filter((r) => r.key !== row.key),
                        )
                      }
                      className={smallButtonClass}
                      aria-label={`Remove ${row.name || "traveller"}`}
                    >
                      <X aria-hidden="true" className="size-3.5" />
                    </button>
                  ) : null}
                </div>
                {row.dob && dateFrom ? (
                  <p className="text-xs text-muted sm:col-span-5">
                    From date of birth: {ageOn(row.dob, dateFrom)} on {dateFrom}
                    .
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                key: `new-${Date.now()}`,
                id: null,
                memberId: null,
                include: true,
                name: "",
                isChild: false,
                age: "",
                confirmed: true,
                dob: null,
              },
            ])
          }
          className={`${buttonClass} w-fit`}
        >
          <Plus aria-hidden="true" className="size-4" />
          Add another traveller
        </button>
      </Fieldset>

      <Fieldset legend="Budget and needs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="budget"
            label="Total budget (€)"
            hint="Optional. For the whole family, all-in."
          >
            <input
              id="budget"
              name="budget"
              inputMode="decimal"
              placeholder="3,200"
              defaultValue={
                trip?.budget_cents != null
                  ? minorToDecimal(trip.budget_cents, "EUR").replace(
                      /\.00$/,
                      "",
                    )
                  : ""
              }
              className={`${inputClass} num`}
            />
          </Field>
          <Field id="board_basis" label="Board basis">
            <select
              id="board_basis"
              name="board_basis"
              defaultValue={trip?.board_basis ?? "any"}
              className={inputClass}
            >
              {(["any", ...BOARD_BASES] as const).map((b) => (
                <option key={b} value={b}>
                  {b === "any"
                    ? "Any"
                    : `${BOARD_LABELS[b]}${["breakfast", "half_board", "full_board"].includes(b) ? " or better" : ""}`}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="room_needs"
            label="Room needs"
            hint="E.g. family room for 4, or two connecting rooms"
            className="sm:col-span-2"
          >
            <input
              id="room_needs"
              name="room_needs"
              maxLength={500}
              defaultValue={trip?.room_needs ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="Hard constraints">
        <p className="text-sm text-muted">
          Options that break these are listed separately with the reason. Leave
          a constraint empty if it doesn&apos;t matter.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="max_stops" label="Stops">
            <select
              id="max_stops"
              name="max_stops"
              defaultValue={trip?.max_stops ?? ""}
              className={inputClass}
            >
              <option value="">Any</option>
              <option value="0">Direct only</option>
              <option value="1">Up to 1 stop</option>
              <option value="2">Up to 2 stops</option>
            </select>
          </Field>
          <Field
            id="max_flight_hours"
            label="Longest flight (hours)"
            hint="One way, e.g. 4.5"
          >
            <input
              id="max_flight_hours"
              name="max_flight_hours"
              inputMode="decimal"
              defaultValue={
                trip?.max_flight_minutes
                  ? minutesToHours(trip.max_flight_minutes)
                  : ""
              }
              className={`${inputClass} num`}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="require_free_cancellation"
            defaultChecked={trip?.require_free_cancellation ?? false}
            className="size-[18px] accent-[var(--purple)]"
          />
          Accommodation must have free cancellation
        </label>
      </Fieldset>

      <Fieldset legend="Notes">
        {trip ? (
          <Field id="status" label="Status">
            <select
              id="status"
              name="status"
              defaultValue={trip.status}
              className={inputClass}
            >
              {TRIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field id="notes" label="Notes">
          <textarea
            id="notes"
            name="notes"
            maxLength={4000}
            defaultValue={trip?.notes ?? ""}
            className={textareaClass}
          />
        </Field>
      </Fieldset>

      <FormErrors errors={state.errors} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : trip ? "Save brief" : "Create trip"}
        </button>
        <Link
          href={trip ? `/travel/${trip.id}` : "/travel"}
          className={buttonClass}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
