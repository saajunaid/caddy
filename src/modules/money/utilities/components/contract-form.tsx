"use client";

import { useActionState, useState } from "react";
import type { FormState } from "../actions";
import {
  CONTRACT_STATUSES,
  isEnergy,
  METER_TYPE_LABELS,
  METER_TYPES,
  UTILITY_TYPE_LABELS,
  UTILITY_TYPES,
  type UtilityType,
} from "../server/types";
import {
  Field,
  FormMessage,
  inputClass,
  primaryButtonClass,
  TextInput,
} from "./form-bits";

export type ContractInitial = Partial<
  Record<
    | "utility_type"
    | "supplier"
    | "tariff_name"
    | "account_label"
    | "meter_type"
    | "contract_start"
    | "contract_end"
    | "status"
    | "notes",
    string
  >
>;

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  switching: "Switching (in progress)",
  ended: "Ended",
};

export function ContractForm({
  action,
  initial = {},
  submitLabel,
  showStatus = false,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  initial?: ContractInitial;
  submitLabel: string;
  showStatus?: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );
  const v = { ...initial, ...state.values };
  const [type, setType] = useState<UtilityType>(
    (v.utility_type as UtilityType) ?? "electricity",
  );

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="utility_type" label="Type">
          <select
            id="utility_type"
            name="utility_type"
            value={type}
            onChange={(e) => setType(e.target.value as UtilityType)}
            className={inputClass}
          >
            {UTILITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {UTILITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="supplier" label="Supplier">
          <TextInput
            id="supplier"
            name="supplier"
            required
            maxLength={80}
            defaultValue={v.supplier ?? ""}
            autoComplete="off"
          />
        </Field>
        <Field id="tariff_name" label="Tariff (optional)">
          <TextInput
            id="tariff_name"
            name="tariff_name"
            maxLength={120}
            defaultValue={v.tariff_name ?? ""}
          />
        </Field>
        {isEnergy(type) ? (
          <Field id="meter_type" label="Meter">
            <select
              id="meter_type"
              name="meter_type"
              defaultValue={v.meter_type ?? "unknown"}
              className={inputClass}
            >
              {METER_TYPES.map((m) => (
                <option key={m} value={m}>
                  {METER_TYPE_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field id="contract_start" label="Start date (optional)">
          <TextInput
            id="contract_start"
            name="contract_start"
            type="date"
            defaultValue={v.contract_start ?? ""}
          />
        </Field>
        <Field
          id="contract_end"
          label="End date"
          hint="Caddy reminds you 14 days before this date. Leave it blank if you don't know it yet."
        >
          <TextInput
            id="contract_end"
            name="contract_end"
            type="date"
            hint
            defaultValue={v.contract_end ?? ""}
          />
        </Field>
        <Field
          id="account_label"
          label="Account label (optional)"
          hint="Last 4 digits only, e.g. •••• 4821. Never the full account number, MPRN or GPRN."
        >
          <TextInput
            id="account_label"
            name="account_label"
            maxLength={60}
            hint
            defaultValue={v.account_label ?? ""}
            autoComplete="off"
          />
        </Field>
        {showStatus ? (
          <Field id="status" label="Status">
            <select
              id="status"
              name="status"
              defaultValue={v.status ?? "active"}
              className={inputClass}
            >
              {CONTRACT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <Field id="notes" label="Notes (optional)">
        <textarea
          id="notes"
          name="notes"
          maxLength={2000}
          rows={3}
          defaultValue={v.notes ?? ""}
          className={`${inputClass} py-2`}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <FormMessage error={state.error} notice={state.notice} />
      </div>
    </form>
  );
}
