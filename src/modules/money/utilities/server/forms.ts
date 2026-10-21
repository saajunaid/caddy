/**
 * Validates Utilities form input into database rows. Every message tells the user how to fix it.
 * Pure (no I/O); server actions call these and add household_id themselves.
 */
import { parseToCents } from "../../../../server/domain/money.ts";
import type { IsoDate } from "../../../../server/domain/dates.ts";
import {
  CONTRACT_STATUSES,
  isEnergy,
  METER_TYPES,
  offerBands,
  UTILITY_TYPES,
  type Band,
  type ContractStatus,
  type MeterType,
  type UtilityType,
} from "./types.ts";

export type Input = Record<string, string | undefined>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

class FormError extends Error {}

function fail(message: string): never {
  throw new FormError(message);
}

function wrap<T>(fn: () => T): Parsed<T> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    if (error instanceof FormError) return { ok: false, error: error.message };
    throw error;
  }
}

/** FormData → plain strings (files ignored). */
export function formInput(formData: FormData): Input {
  const input: Input = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") input[key] = value;
  }
  return input;
}

function text(input: Input, key: string, label: string, max: number) {
  const value = (input[key] ?? "").trim();
  if (value.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return value;
}

function required(input: Input, key: string, label: string, max: number) {
  const value = text(input, key, label, max);
  if (!value) fail(`Enter the ${label.toLowerCase()}.`);
  return value;
}

function optional(input: Input, key: string, label: string, max: number) {
  return text(input, key, label, max) || null;
}

function oneOf<T extends string>(
  input: Input,
  key: string,
  allowed: readonly T[],
  label: string,
  fallback?: T,
): T {
  const value = (input[key] ?? "").trim();
  if (!value && fallback !== undefined) return fallback;
  if (!(allowed as readonly string[]).includes(value))
    fail(`Choose a ${label}.`);
  return value as T;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

function date(input: Input, key: string, label: string): IsoDate | null {
  const value = (input[key] ?? "").trim();
  if (!value) return null;
  if (!isRealDate(value)) fail(`${label} isn't a real date.`);
  return value;
}

function decimalString(
  input: Input,
  key: string,
  label: string,
  { places, max }: { places: number; max: number },
): string | null {
  const raw = (input[key] ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const match = new RegExp(`^\\d+(\\.\\d{1,${places}})?$`).exec(raw);
  if (!match) {
    fail(
      `${label}: enter a number with up to ${places} decimal place${places === 1 ? "" : "s"}.`,
    );
  }
  if (Number(raw) > max) fail(`${label} looks too large.`);
  return raw;
}

function cents(input: Input, key: string, label: string): number | null {
  const raw = (input[key] ?? "").trim();
  if (!raw) return null;
  try {
    const value = parseToCents(raw);
    if (value < 0) fail(`${label} can't be negative.`);
    if (value > 10_000_000_00) fail(`${label} looks too large.`);
    return value;
  } catch (error) {
    if (error instanceof FormError) throw error;
    fail(`${label}: enter an amount in euros, e.g. 280.00.`);
  }
}

// Contracts --------------------------------------------------------------------------------

export type ContractValues = {
  utility_type: UtilityType;
  supplier: string;
  tariff_name: string | null;
  account_label: string | null;
  meter_type: MeterType;
  contract_start: IsoDate | null;
  contract_end: IsoDate | null;
  status: ContractStatus;
  notes: string | null;
};

export function parseContract(input: Input): Parsed<ContractValues> {
  return wrap(() => {
    const utilityType = oneOf(
      input,
      "utility_type",
      UTILITY_TYPES,
      "utility type",
    );
    const accountLabel = optional(input, "account_label", "Account label", 60);
    if (accountLabel && /\d{7,}/.test(accountLabel.replace(/\s/g, ""))) {
      fail(
        "Don't store full account numbers, MPRNs or GPRNs. Enter the last 4 digits only, e.g. •••• 4821.",
      );
    }
    const start = date(input, "contract_start", "Start date");
    const end = date(input, "contract_end", "End date");
    if (start && end && end <= start)
      fail("The end date must be after the start date.");
    return {
      utility_type: utilityType,
      supplier: required(input, "supplier", "Supplier", 80),
      tariff_name: optional(input, "tariff_name", "Tariff name", 120),
      account_label: accountLabel,
      meter_type: isEnergy(utilityType)
        ? oneOf(input, "meter_type", METER_TYPES, "meter type", "unknown")
        : "unknown",
      contract_start: start,
      contract_end: end,
      status: oneOf(input, "status", CONTRACT_STATUSES, "status", "active"),
      notes: optional(input, "notes", "Notes", 2000),
    };
  });
}

// Usage --------------------------------------------------------------------------------------

export type UsageValues = {
  period_start: IsoDate;
  period_end: IsoDate;
  day_kwh: number | null;
  night_kwh: number | null;
  peak_kwh: number | null;
  standard_kwh: number | null;
  gas_kwh: number | null;
  total_cents: number | null;
};

const KWH = { places: 3, max: 1_000_000 };

/** Numeric strings go to Postgres via JSON numbers; ≤ 4 decimals round-trip exactly. */
function asNumber(value: string | null): number | null {
  return value === null ? null : Number(value);
}

export function parseUsage(input: Input): Parsed<UsageValues> {
  return wrap(() => {
    const start = date(input, "period_start", "Period start");
    const end = date(input, "period_end", "Period end");
    if (!start || !end) fail("Enter the bill period's start and end dates.");
    if (end <= start) fail("The period must end after it starts.");
    const kwh = {
      day_kwh: asNumber(decimalString(input, "day_kwh", "Day kWh", KWH)),
      night_kwh: asNumber(decimalString(input, "night_kwh", "Night kWh", KWH)),
      peak_kwh: asNumber(decimalString(input, "peak_kwh", "Peak kWh", KWH)),
      standard_kwh: asNumber(
        decimalString(input, "standard_kwh", "24-hour kWh", KWH),
      ),
      gas_kwh: asNumber(decimalString(input, "gas_kwh", "Gas kWh", KWH)),
    };
    if (Object.values(kwh).every((v) => v === null)) {
      fail("Enter the kWh for at least one band, exactly as on the bill.");
    }
    return {
      period_start: start,
      period_end: end,
      ...kwh,
      total_cents: cents(input, "total", "Bill total"),
    };
  });
}

/** Whether a new period overlaps existing ones by more than a shared meter-read day. */
export function overlapsExisting(
  period: { period_start: IsoDate; period_end: IsoDate },
  existing: readonly { period_start: IsoDate; period_end: IsoDate }[],
): boolean {
  return existing.some(
    (e) =>
      period.period_start < e.period_end && e.period_start < period.period_end,
  );
}

// Offers -------------------------------------------------------------------------------------

export type OfferValues = {
  supplier: string;
  tariff_name: string | null;
  utility_type: UtilityType;
  day_rate_cents: number | null;
  night_rate_cents: number | null;
  peak_rate_cents: number | null;
  standard_rate_cents: number | null;
  gas_rate_cents: number | null;
  standing_charge_cents_per_year: number;
  discount_percent: number;
  discount_includes_standing: boolean;
  discount_months: number;
  cashback_cents: number;
  exit_fee_cents: number;
  vat_percent: number;
  source_url: string | null;
  checked_on: IsoDate;
  notes: string | null;
  is_current_renewal: boolean;
};

const RATE = { places: 4, max: 10_000 };

const RATE_FIELDS: Record<Band, keyof OfferValues> = {
  day: "day_rate_cents",
  night: "night_rate_cents",
  peak: "peak_rate_cents",
  standard: "standard_rate_cents",
  gas: "gas_rate_cents",
};

/** Offer types allowed on a contract: its own type, plus dual fuel for energy. */
export function offerTypesFor(contractType: UtilityType): UtilityType[] {
  if (contractType === "electricity") return ["electricity", "dual_fuel"];
  if (contractType === "gas") return ["gas", "dual_fuel"];
  if (contractType === "dual_fuel") return ["dual_fuel", "electricity", "gas"];
  return [contractType];
}

export function parseOffer(
  input: Input,
  contractType: UtilityType,
  today: IsoDate,
): Parsed<OfferValues> {
  return wrap(() => {
    const utilityType = oneOf(
      input,
      "utility_type",
      offerTypesFor(contractType),
      "offer type",
      contractType,
    );
    const allowed = offerBands(utilityType);
    const rates: Partial<Record<keyof OfferValues, number | null>> = {};
    for (const [band, field] of Object.entries(RATE_FIELDS) as [
      Band,
      keyof OfferValues,
    ][]) {
      const label = `${band === "standard" ? "24-hour" : band[0].toUpperCase() + band.slice(1)} rate`;
      const value = allowed.includes(band)
        ? decimalString(input, field, label, RATE)
        : null;
      if (value !== null && Number(value) > 0 && Number(value) < 1) {
        fail(
          `${label} looks like euros per kWh. Enter cents, e.g. 34.20 for €0.3420.`,
        );
      }
      rates[field] = asNumber(value);
    }
    if (
      isEnergy(utilityType) &&
      Object.values(rates).every((v) => v === null)
    ) {
      fail("Enter at least one unit rate in cents per kWh, before VAT.");
    }
    const standing =
      cents(
        input,
        "standing_charge",
        isEnergy(utilityType) ? "Standing charge" : "Annual price",
      ) ?? 0;
    if (!isEnergy(utilityType) && standing === 0) {
      fail("Enter the annual price before VAT.");
    }
    const discount = decimalString(input, "discount_percent", "Discount", {
      places: 2,
      max: 100,
    });
    const monthsRaw = (input.discount_months ?? "").trim();
    const months = monthsRaw ? Number(monthsRaw) : discount ? 12 : 0;
    if (!Number.isInteger(months) || months < 0 || months > 12) {
      fail("Discount months must be a whole number from 0 to 12.");
    }
    const vat = decimalString(input, "vat_percent", "VAT", {
      places: 2,
      max: 50,
    });
    if (vat === null) fail("Enter the VAT rate (9% for electricity and gas).");
    const url = optional(input, "source_url", "Source link", 500);
    if (url && !/^https?:\/\/[^\s]+$/.test(url)) {
      fail("The source link must start with https://");
    }
    const checked = date(input, "checked_on", "Checked on");
    if (!checked) fail("Enter the date you checked these prices.");
    if (checked > today) fail("The checked date can't be in the future.");
    return {
      supplier: required(input, "supplier", "Supplier", 80),
      tariff_name: optional(input, "tariff_name", "Tariff name", 120),
      utility_type: utilityType,
      day_rate_cents: rates.day_rate_cents ?? null,
      night_rate_cents: rates.night_rate_cents ?? null,
      peak_rate_cents: rates.peak_rate_cents ?? null,
      standard_rate_cents: rates.standard_rate_cents ?? null,
      gas_rate_cents: rates.gas_rate_cents ?? null,
      standing_charge_cents_per_year: standing,
      discount_percent: discount ? Number(discount) : 0,
      discount_includes_standing: input.discount_includes_standing === "on",
      discount_months: discount && Number(discount) > 0 ? months : 0,
      cashback_cents: cents(input, "cashback", "Cashback") ?? 0,
      exit_fee_cents: cents(input, "exit_fee", "Exit fee") ?? 0,
      vat_percent: Number(vat),
      source_url: url,
      checked_on: checked,
      notes: optional(input, "notes", "Notes", 2000),
      is_current_renewal: input.is_current_renewal === "on",
    };
  });
}

/** Cents as a plain euro amount for a form field: 28000 → "280.00", 0 → "". */
export function centsToInput(cents: number | null): string {
  if (!cents) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Form values for editing a saved offer. */
export function offerToInput(row: {
  supplier: string;
  tariff_name: string | null;
  utility_type: string;
  day_rate_cents: number | null;
  night_rate_cents: number | null;
  peak_rate_cents: number | null;
  standard_rate_cents: number | null;
  gas_rate_cents: number | null;
  standing_charge_cents_per_year: number;
  discount_percent: number;
  discount_includes_standing: boolean;
  discount_months: number;
  cashback_cents: number;
  exit_fee_cents: number;
  vat_percent: number;
  source_url: string | null;
  checked_on: string;
  notes: string | null;
  is_current_renewal: boolean;
}): Input {
  const num = (value: number | null) => (value === null ? "" : String(value));
  return {
    supplier: row.supplier,
    tariff_name: row.tariff_name ?? "",
    utility_type: row.utility_type,
    day_rate_cents: num(row.day_rate_cents),
    night_rate_cents: num(row.night_rate_cents),
    peak_rate_cents: num(row.peak_rate_cents),
    standard_rate_cents: num(row.standard_rate_cents),
    gas_rate_cents: num(row.gas_rate_cents),
    standing_charge: centsToInput(row.standing_charge_cents_per_year),
    discount_percent: row.discount_percent ? String(row.discount_percent) : "",
    discount_months: String(row.discount_months),
    discount_includes_standing: row.discount_includes_standing ? "on" : "",
    cashback: centsToInput(row.cashback_cents),
    exit_fee: centsToInput(row.exit_fee_cents),
    vat_percent: String(row.vat_percent),
    source_url: row.source_url ?? "",
    checked_on: row.checked_on,
    notes: row.notes ?? "",
    is_current_renewal: row.is_current_renewal ? "on" : "",
  };
}

// Exclusions ---------------------------------------------------------------------------------

export function parseSupplierName(input: Input): Parsed<string> {
  return wrap(() => required(input, "supplier", "Supplier", 80));
}
