"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveComponentAction, type FormState } from "../actions";
import {
  CURRENCIES,
  ECB_CURRENCIES,
  formatEur,
  formatShortDate,
  isCurrency,
  minorToDecimal,
  noRateMessage,
  parseMinor,
  toEurCents,
  trimRate,
} from "../server/currency";
import {
  BOARD_BASES,
  BOARD_LABELS,
  COMPONENT_KINDS,
  KIND_LABELS,
  type ComponentKind,
} from "../server/labels";
import type { Component } from "../server/totals";
import {
  buttonClass,
  Field,
  Fieldset,
  FormErrors,
  inputClass,
  primaryButtonClass,
  textareaClass,
} from "./ui";

export type RatePreview = {
  date: string | null;
  rates: Record<string, string>;
};

function Preview({
  price,
  currency,
  latest,
}: {
  price: string;
  currency: string;
  latest: RatePreview;
}) {
  if (currency === "EUR" || !isCurrency(currency)) return null;
  const rate = latest.rates[currency];
  if (!rate || !latest.date) {
    return (
      <p className="text-sm text-review" role="status">
        {ECB_CURRENCIES.has(currency)
          ? `No ECB ${currency} rate is stored yet.`
          : noRateMessage(currency, latest.date ?? "")}{" "}
        The price is saved but left out of the total until it can be converted.
      </p>
    );
  }
  let cents: number | null = null;
  try {
    cents = price
      ? toEurCents(parseMinor(price, currency), currency, rate)
      : null;
  } catch {
    cents = null;
  }
  return (
    <p className="text-sm text-muted" role="status">
      {cents !== null ? (
        <>
          ≈ <span className="num text-fg">{formatEur(cents)}</span> at the ECB
          rate of {formatShortDate(latest.date)} (
        </>
      ) : (
        "ECB rate of " + formatShortDate(latest.date) + " ("
      )}
      <span className="num">
        {trimRate(rate)} {currency}
      </span>{" "}
      per €1). Saved prices use the latest ECB rate on or before the day you
      checked.
    </p>
  );
}

export function ComponentForm({
  tripId,
  candidateId,
  destination,
  latest,
  component,
  nowLocal,
  checkedLocal,
}: {
  tripId: string;
  candidateId: string;
  destination: string;
  latest: RatePreview;
  component?: Component;
  /** Current Dublin time for the max of the checked input. */
  nowLocal: string;
  /** Initial "checked" value (Dublin time). */
  checkedLocal: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveComponentAction,
    {},
  );
  const [kind, setKind] = useState<ComponentKind>(component?.kind ?? "flight");
  const [currency, setCurrency] = useState(component?.currency ?? "EUR");
  const [price, setPrice] = useState(
    component ? minorToDecimal(component.priceMinor, component.currency) : "",
  );
  const duration = component?.durationMinutes ?? null;

  return (
    <form action={formAction} className="grid gap-[22px]">
      <input type="hidden" name="trip_id" value={tripId} />
      <input type="hidden" name="candidate_id" value={candidateId} />
      {component ? (
        <input type="hidden" name="component_id" value={component.id} />
      ) : null}
      <FormErrors errors={state.errors} />
      <Fieldset legend={`Price for ${destination}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="kind" label="What is it?">
            <select
              id="kind"
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as ComponentKind)}
              className={inputClass}
            >
              {COMPONENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            id="provider"
            label="Provider"
            hint="Who quoted it, e.g. Ryanair, Booking.com"
          >
            <input
              id="provider"
              name="provider"
              maxLength={120}
              defaultValue={component?.provider ?? ""}
              className={inputClass}
            />
          </Field>
          <Field
            id="description"
            label="Description"
            hint="E.g. 4 passengers, return; Family room, 6 nights"
            className="sm:col-span-2"
          >
            <input
              id="description"
              name="description"
              maxLength={500}
              defaultValue={component?.description ?? ""}
              className={inputClass}
            />
          </Field>
          <Field
            id="price"
            label="Total price for the family"
            hint="Exactly as shown, in the site's currency"
          >
            <input
              id="price"
              name="price"
              required
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className={`${inputClass} num`}
            />
          </Field>
          <Field id="currency" label="Currency">
            <select
              id="currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={`${inputClass} num`}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Preview price={price} currency={currency} latest={latest} />
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              name="is_estimate"
              defaultChecked={component?.isEstimate ?? false}
              className="size-[18px] accent-[var(--purple)]"
            />
            This is an estimate (e.g. groceries, fuel), not a quoted price
          </label>
        </div>
      </Fieldset>

      {kind === "flight" ? (
        <Fieldset legend="Flight details">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="stops" label="Stops" hint="Most stops on either leg">
              <select
                id="stops"
                name="stops"
                defaultValue={component?.stops ?? ""}
                className={inputClass}
              >
                <option value="">Not recorded</option>
                <option value="0">Direct</option>
                <option value="1">1 stop</option>
                <option value="2">2 stops</option>
                <option value="3">3+ stops</option>
              </select>
            </Field>
            <Field
              id="duration_hours"
              label="Longest leg (hours)"
              hint="One-way journey time"
            >
              <input
                id="duration_hours"
                name="duration_hours"
                type="number"
                inputMode="numeric"
                min={0}
                max={47}
                defaultValue={
                  duration !== null ? Math.floor(duration / 60) : ""
                }
                className={`${inputClass} num`}
              />
            </Field>
            <Field id="duration_minutes" label="and minutes">
              <input
                id="duration_minutes"
                name="duration_minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={59}
                defaultValue={duration !== null ? duration % 60 : ""}
                className={`${inputClass} num`}
              />
            </Field>
          </div>
        </Fieldset>
      ) : null}

      {kind === "accommodation" ? (
        <Fieldset legend="Stay details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="board_basis" label="Board basis">
              <select
                id="board_basis"
                name="board_basis"
                defaultValue={component?.boardBasis ?? ""}
                className={inputClass}
              >
                <option value="">Not recorded</option>
                {BOARD_BASES.map((b) => (
                  <option key={b} value={b}>
                    {BOARD_LABELS[b]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="free_cancellation" label="Free cancellation?">
              <select
                id="free_cancellation"
                name="free_cancellation"
                defaultValue={
                  component?.freeCancellation == null
                    ? ""
                    : component.freeCancellation
                      ? "yes"
                      : "no"
                }
                className={inputClass}
              >
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          </div>
        </Fieldset>
      ) : null}

      <Fieldset legend="What's in the price">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="includes"
            label="Includes"
            hint="E.g. 2×20kg bags, transfers"
          >
            <textarea
              id="includes"
              name="includes"
              maxLength={500}
              defaultValue={component?.includes ?? ""}
              className={textareaClass}
            />
          </Field>
          <Field id="excludes" label="Excludes" hint="E.g. seats, tourist tax">
            <textarea
              id="excludes"
              name="excludes"
              maxLength={500}
              defaultValue={component?.excludes ?? ""}
              className={textareaClass}
            />
          </Field>
          <Field
            id="cancellation_terms"
            label="Cancellation terms"
            className="sm:col-span-2"
          >
            <input
              id="cancellation_terms"
              name="cancellation_terms"
              maxLength={500}
              defaultValue={component?.cancellationTerms ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="Where you saw it">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="booking_url"
            label="Link to the offer"
            hint="https:// only. Opens in a new tab; Caddy never books."
            className="sm:col-span-2"
          >
            <input
              id="booking_url"
              name="booking_url"
              type="url"
              inputMode="url"
              pattern="https://.*"
              maxLength={2000}
              defaultValue={component?.bookingUrl ?? ""}
              className={inputClass}
            />
          </Field>
          <Field
            id="checked_at"
            label="Checked (Irish time)"
            hint="When you saw this price"
          >
            <input
              id="checked_at"
              name="checked_at"
              type="datetime-local"
              required
              max={nowLocal}
              defaultValue={checkedLocal}
              className={`${inputClass} num`}
            />
          </Field>
        </div>
      </Fieldset>

      <FormErrors errors={state.errors} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : "Save price"}
        </button>
        {component ? null : (
          <button
            type="submit"
            name="then"
            value="another"
            disabled={pending}
            className={buttonClass}
          >
            Save and add another
          </button>
        )}
        <Link
          href={`/travel/${tripId}#option-${candidateId}`}
          className={buttonClass}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
