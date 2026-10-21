// Tax evidence categories (must match the check constraint on public.tax_evidence_items). Pure.
import type { DocumentType } from "../documents/fields.ts";

export const TAX_CATEGORIES = [
  "remote_working_electricity",
  "remote_working_heating",
  "remote_working_broadband",
  "employer_remote_working_allowance",
  "medical",
  "other",
] as const;
export type TaxCategory = (typeof TAX_CATEGORIES)[number];

/** Categories a bill can be linked as (the allowance is entered on the tax page). */
export const BILL_TAX_CATEGORIES = [
  "remote_working_electricity",
  "remote_working_heating",
  "remote_working_broadband",
  "medical",
  "other",
] as const satisfies readonly TaxCategory[];

export const WFH_CATEGORIES = [
  "remote_working_electricity",
  "remote_working_heating",
  "remote_working_broadband",
] as const satisfies readonly TaxCategory[];

export const ALLOWANCE_CATEGORY = "employer_remote_working_allowance";

export const TAX_CATEGORY_LABELS: Record<TaxCategory, string> = {
  remote_working_electricity: "Remote working · electricity",
  remote_working_heating: "Remote working · heating",
  remote_working_broadband: "Remote working · broadband",
  employer_remote_working_allowance: "Employer remote working allowance",
  medical: "Medical expenses",
  other: "Other",
};

export const WFH_CATEGORY_SHORT: Record<
  (typeof WFH_CATEGORIES)[number],
  string
> = {
  remote_working_electricity: "Electricity",
  remote_working_heating: "Heating",
  remote_working_broadband: "Broadband",
};

export function isTaxCategory(value: unknown): value is TaxCategory {
  return (
    typeof value === "string" &&
    (TAX_CATEGORIES as readonly string[]).includes(value)
  );
}

/** Suggested evidence category for a bill. Dual fuel defaults to electricity; the user can change it. */
export function taxCategoryFor(type: DocumentType | null): TaxCategory {
  switch (type) {
    case "electricity_bill":
    case "dual_fuel_bill":
      return "remote_working_electricity";
    case "gas_bill":
      return "remote_working_heating";
    case "broadband_bill":
      return "remote_working_broadband";
    default:
      return "other";
  }
}
