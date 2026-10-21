"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormState } from "../actions";
import {
  defaultVatPercent,
  isEnergy,
  offerBands,
  UTILITY_TYPE_LABELS,
  type Band,
  type UtilityType,
} from "../server/types";
import {
  buttonClass,
  Field,
  FormMessage,
  inputClass,
  primaryButtonClass,
  TextInput,
} from "./form-bits";

const RATE_FIELD: Record<Band, string> = {
  day: "day_rate_cents",
  night: "night_rate_cents",
  peak: "peak_rate_cents",
  standard: "standard_rate_cents",
  gas: "gas_rate_cents",
};

const RATE_LABEL: Record<Band, string> = {
  day: "Day rate",
  night: "Night rate",
  peak: "Peak rate",
  standard: "24-hour rate",
  gas: "Gas rate",
};

export type OfferInitial = Record<string, string | undefined>;

export function OfferForm({
  action,
  offerTypes,
  initial,
  today,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  offerTypes: UtilityType[];
  /** Present when editing an existing offer. */
  initial?: OfferInitial;
  today: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const v: OfferInitial = { ...initial, ...state.values };
  const [type, setType] = useState<UtilityType>(
    (v.utility_type as UtilityType) ?? offerTypes[0],
  );
  const energy = isEnergy(type);
  const editing = initial !== undefined;

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="offer-supplier" label="Supplier">
          <TextInput
            id="offer-supplier"
            name="supplier"
            required
            maxLength={80}
            autoComplete="off"
            defaultValue={v.supplier ?? ""}
          />
        </Field>
        <Field id="offer-tariff" label="Tariff (optional)">
          <TextInput
            id="offer-tariff"
            name="tariff_name"
            maxLength={120}
            defaultValue={v.tariff_name ?? ""}
          />
        </Field>
        {offerTypes.length > 1 ? (
          <Field id="offer-type" label="Offer covers">
            <select
              id="offer-type"
              name="utility_type"
              value={type}
              onChange={(e) => setType(e.target.value as UtilityType)}
              className={inputClass}
            >
              {offerTypes.map((t) => (
                <option key={t} value={t}>
                  {UTILITY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <input type="hidden" name="utility_type" value={type} />
        )}
      </div>

      {energy ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">
            Unit rates · cents per kWh, before VAT
          </legend>
          <p className="text-xs text-muted">
            Fill the bands your meter uses: day, night and peak for a smart
            time-of-use meter, or the 24-hour rate. A blank band means the offer
            doesn&apos;t have it; Caddy won&apos;t guess it.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {offerBands(type).map((band) => (
              <Field key={band} id={`offer-${band}`} label={RATE_LABEL[band]}>
                <TextInput
                  id={`offer-${band}`}
                  name={RATE_FIELD[band]}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="34.20"
                  className="num"
                  defaultValue={v[RATE_FIELD[band]] ?? ""}
                />
              </Field>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field
          id="offer-standing"
          label={energy ? "Standing charge € a year" : "Price € a year"}
          hint={
            energy
              ? "Before VAT. Per day? Multiply by 365."
              : "Before VAT, for 12 months."
          }
        >
          <TextInput
            id="offer-standing"
            name="standing_charge"
            inputMode="decimal"
            autoComplete="off"
            hint
            className="num"
            defaultValue={v.standing_charge ?? ""}
          />
        </Field>
        <Field id="offer-discount" label="Discount %">
          <TextInput
            id="offer-discount"
            name="discount_percent"
            inputMode="decimal"
            autoComplete="off"
            className="num"
            defaultValue={v.discount_percent ?? ""}
          />
        </Field>
        <Field id="offer-months" label="for months" hint="0–12, from the start">
          <TextInput
            id="offer-months"
            name="discount_months"
            type="number"
            min={0}
            max={12}
            step={1}
            hint
            className="num"
            defaultValue={v.discount_months ?? "12"}
          />
        </Field>
        <Field
          id="offer-vat"
          label="VAT %"
          hint={energy ? "9% on energy" : undefined}
        >
          <TextInput
            id="offer-vat"
            name="vat_percent"
            inputMode="decimal"
            required
            hint={energy}
            className="num"
            defaultValue={v.vat_percent ?? defaultVatPercent(type)}
          />
        </Field>
        <Field id="offer-cashback" label="Cashback €">
          <TextInput
            id="offer-cashback"
            name="cashback"
            inputMode="decimal"
            autoComplete="off"
            className="num"
            defaultValue={v.cashback ?? ""}
          />
        </Field>
        <Field
          id="offer-exit"
          label="Exit fee €"
          hint="For leaving your current contract early to take this offer"
        >
          <TextInput
            id="offer-exit"
            name="exit_fee"
            inputMode="decimal"
            autoComplete="off"
            hint
            className="num"
            defaultValue={v.exit_fee ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-2">
        {energy ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="discount_includes_standing"
              defaultChecked={v.discount_includes_standing === "on"}
              className="mt-1 size-4 accent-[var(--purple)]"
            />
            <span>The discount also applies to the standing charge</span>
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="is_current_renewal"
            defaultChecked={v.is_current_renewal === "on"}
            className="mt-1 size-4 accent-[var(--purple)]"
          />
          <span>
            This is my current supplier&apos;s renewal price (the baseline for
            &ldquo;vs renewal&rdquo;)
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field
          id="offer-source"
          label="Source link"
          hint="The page you copied these prices from"
        >
          <TextInput
            id="offer-source"
            name="source_url"
            type="url"
            inputMode="url"
            placeholder="https://"
            hint
            defaultValue={v.source_url ?? ""}
          />
        </Field>
        <Field id="offer-checked" label="Checked on">
          <TextInput
            id="offer-checked"
            name="checked_on"
            type="date"
            required
            max={today}
            defaultValue={v.checked_on ?? today}
          />
        </Field>
      </div>
      <Field id="offer-notes" label="Notes (optional)">
        <textarea
          id="offer-notes"
          name="notes"
          rows={2}
          maxLength={2000}
          defaultValue={v.notes ?? ""}
          className={`${inputClass} py-2`}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : editing ? "Save offer" : "Add offer"}
        </button>
        {cancelHref ? (
          <Link href={cancelHref} className={buttonClass}>
            Cancel
          </Link>
        ) : null}
        <FormMessage error={state.error} notice={state.notice} />
      </div>
    </form>
  );
}
