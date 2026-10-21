// Fields Caddy reads from bills and receipts. Shared by the parsers (Node), server actions and the
// review screen, so: no imports beyond plain TypeScript.

export const DOCUMENT_TYPES = [
  "electricity_bill",
  "gas_bill",
  "dual_fuel_bill",
  "broadband_bill",
  "receipt",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  electricity_bill: "Electricity bill",
  gas_bill: "Gas bill",
  dual_fuel_bill: "Dual fuel bill",
  broadband_bill: "Broadband bill",
  receipt: "Receipt",
  other: "Other",
};

export function isDocumentType(value: unknown): value is DocumentType {
  return (
    typeof value === "string" &&
    (DOCUMENT_TYPES as readonly string[]).includes(value)
  );
}

export type Confidence = "high" | "medium" | "low";

/**
 * How a value is stored:
 * - money: integer cents
 * - date: "YYYY-MM-DD"
 * - decimal: exact decimal string, e.g. "412" kWh, "37.12" cent per kWh, "9" percent
 * - masked: identifier with only the last four characters kept, e.g. "•••• 4821"
 * - text / documentType: plain string
 */
export type FieldKind =
  "text" | "documentType" | "date" | "money" | "decimal" | "masked";

export type FieldValue = string | number;

export const FIELD_KEYS = [
  "supplier",
  "document_type",
  "document_date",
  "period_start",
  "period_end",
  "due_date",
  "total_cents",
  "vat_cents",
  "vat_rate_percent",
  "standing_charge_cents",
  "invoice_number",
  "account_number_masked",
  "mprn_masked",
  "gprn_masked",
  "day_kwh",
  "night_kwh",
  "peak_kwh",
  "standard_kwh",
  "gas_kwh",
  "day_rate_cents",
  "night_rate_cents",
  "peak_rate_cents",
  "standard_rate_cents",
  "gas_rate_cents",
] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];

export type FieldDef = {
  key: FieldKey;
  label: string;
  kind: FieldKind;
  /** Column on public.documents; fields without one live in documents.details. */
  column: boolean;
  /** Unit shown after decimal values. */
  unit?: string;
};

export const FIELD_DEFS: readonly FieldDef[] = [
  { key: "supplier", label: "Supplier", kind: "text", column: true },
  {
    key: "document_type",
    label: "Document type",
    kind: "documentType",
    column: true,
  },
  { key: "document_date", label: "Bill date", kind: "date", column: true },
  { key: "period_start", label: "Period start", kind: "date", column: true },
  { key: "period_end", label: "Period end", kind: "date", column: true },
  { key: "due_date", label: "Due date", kind: "date", column: true },
  { key: "total_cents", label: "Total due", kind: "money", column: true },
  { key: "vat_cents", label: "VAT", kind: "money", column: true },
  {
    key: "vat_rate_percent",
    label: "VAT rate",
    kind: "decimal",
    column: false,
    unit: "%",
  },
  {
    key: "standing_charge_cents",
    label: "Standing charge",
    kind: "money",
    column: false,
  },
  {
    key: "invoice_number",
    label: "Invoice number",
    kind: "text",
    column: false,
  },
  {
    key: "account_number_masked",
    label: "Account",
    kind: "masked",
    column: false,
  },
  { key: "mprn_masked", label: "MPRN", kind: "masked", column: false },
  { key: "gprn_masked", label: "GPRN", kind: "masked", column: false },
  {
    key: "day_kwh",
    label: "Day units",
    kind: "decimal",
    column: false,
    unit: "kWh",
  },
  {
    key: "night_kwh",
    label: "Night units",
    kind: "decimal",
    column: false,
    unit: "kWh",
  },
  {
    key: "peak_kwh",
    label: "Peak units",
    kind: "decimal",
    column: false,
    unit: "kWh",
  },
  {
    key: "standard_kwh",
    label: "24-hour units",
    kind: "decimal",
    column: false,
    unit: "kWh",
  },
  {
    key: "gas_kwh",
    label: "Gas units",
    kind: "decimal",
    column: false,
    unit: "kWh",
  },
  {
    key: "day_rate_cents",
    label: "Day rate",
    kind: "decimal",
    column: false,
    unit: "c/kWh",
  },
  {
    key: "night_rate_cents",
    label: "Night rate",
    kind: "decimal",
    column: false,
    unit: "c/kWh",
  },
  {
    key: "peak_rate_cents",
    label: "Peak rate",
    kind: "decimal",
    column: false,
    unit: "c/kWh",
  },
  {
    key: "standard_rate_cents",
    label: "24-hour rate",
    kind: "decimal",
    column: false,
    unit: "c/kWh",
  },
  {
    key: "gas_rate_cents",
    label: "Gas rate",
    kind: "decimal",
    column: false,
    unit: "c/kWh",
  },
];

export const FIELD_DEF: Record<FieldKey, FieldDef> = Object.fromEntries(
  FIELD_DEFS.map((def) => [def.key, def]),
) as Record<FieldKey, FieldDef>;

export function isFieldKey(value: unknown): value is FieldKey {
  return (
    typeof value === "string" &&
    (FIELD_KEYS as readonly string[]).includes(value)
  );
}

/** One field the parsers propose. A null value with candidates means "several found; you pick". */
export type ProposedField = {
  value: FieldValue | null;
  confidence: Confidence;
  /** The line the value was read from, with long numbers masked. */
  snippet?: string;
  candidates?: FieldValue[];
};

export type ProposedFields = Partial<Record<FieldKey, ProposedField>>;

/** Fields shown for each document type, in display order. */
export function fieldsForType(type: DocumentType | null): FieldKey[] {
  const base: FieldKey[] = [
    "supplier",
    "document_type",
    "document_date",
    "total_cents",
    "vat_cents",
    "vat_rate_percent",
  ];
  const bill: FieldKey[] = [
    "period_start",
    "period_end",
    "due_date",
    "invoice_number",
    "account_number_masked",
  ];
  switch (type) {
    case "electricity_bill":
      return [
        ...base,
        ...bill,
        "mprn_masked",
        "standing_charge_cents",
        "day_kwh",
        "day_rate_cents",
        "night_kwh",
        "night_rate_cents",
        "peak_kwh",
        "peak_rate_cents",
        "standard_kwh",
        "standard_rate_cents",
      ];
    case "gas_bill":
      return [
        ...base,
        ...bill,
        "gprn_masked",
        "standing_charge_cents",
        "gas_kwh",
        "gas_rate_cents",
      ];
    case "dual_fuel_bill":
      return [
        ...base,
        ...bill,
        "mprn_masked",
        "gprn_masked",
        "standing_charge_cents",
        "day_kwh",
        "night_kwh",
        "peak_kwh",
        "standard_kwh",
        "standard_rate_cents",
        "gas_kwh",
        "gas_rate_cents",
      ];
    case "broadband_bill":
      return [...base, ...bill];
    case "receipt":
      return base;
    default:
      return [...base, ...bill];
  }
}
