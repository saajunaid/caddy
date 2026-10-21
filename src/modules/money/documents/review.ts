// Review rules for document fields: validating edits, merging proposals without touching what the
// user confirmed, and mapping fields to database columns. Pure; shared by client and server.

import { formatMoney, parseToCents } from "../../../server/domain/money.ts";
import {
  DOCUMENT_TYPE_LABELS,
  FIELD_DEF,
  FIELD_KEYS,
  isDocumentType,
  isFieldKey,
  type FieldKey,
  type FieldValue,
  type ProposedFields,
} from "./fields.ts";
import { MASK, maskIdentifier } from "./server/parsers/values.ts";

export type FieldValues = Partial<Record<FieldKey, FieldValue | null>>;

/**
 * Applies newly proposed values. Fields the user confirmed are user-owned and never change;
 * a proposal without a value (only candidates) never clears an existing value.
 */
export function applyProposals(
  current: FieldValues,
  confirmed: readonly string[],
  proposals: ProposedFields,
): FieldValues {
  const locked = new Set(confirmed);
  const next: FieldValues = { ...current };
  for (const [key, proposal] of Object.entries(proposals)) {
    if (!isFieldKey(key) || locked.has(key) || !proposal) continue;
    if (proposal.value === null) continue;
    next[key] = proposal.value;
  }
  return next;
}

export type ParsedInput =
  { ok: true; value: FieldValue | null } | { ok: false; error: string };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (y < 2000 || y > 2100) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Validates what the user typed for a field. Empty input means "unknown" (null). */
export function parseFieldInput(key: FieldKey, raw: string): ParsedInput {
  const input = raw.trim();
  if (input === "") return { ok: true, value: null };
  const def = FIELD_DEF[key];
  switch (def.kind) {
    case "money":
      try {
        return { ok: true, value: parseToCents(input) };
      } catch {
        return { ok: false, error: "Enter an amount like 212.48" };
      }
    case "date":
      return validIsoDate(input)
        ? { ok: true, value: input }
        : { ok: false, error: "Enter a real date" };
    case "decimal": {
      const cleaned = input
        .replace(/,/g, "")
        .replace(/\s?(%|kwh|c\/kwh|c)$/i, "");
      if (!/^\d{1,9}(\.\d{1,6})?$/.test(cleaned)) {
        return { ok: false, error: "Enter a number like 412 or 37.12" };
      }
      return { ok: true, value: cleaned.replace(/^0+(?=\d)/, "") };
    }
    case "masked": {
      // Only the last four characters are ever stored.
      if (new RegExp(`^${MASK} [A-Za-z0-9]{4}$`).test(input))
        return { ok: true, value: input };
      const compact = input.replace(/[\s•*xX-]/g, "");
      if (/^[A-Za-z0-9]{4}$/.test(compact)) {
        return { ok: true, value: `${MASK} ${compact.toUpperCase()}` };
      }
      const masked = maskIdentifier(compact);
      return masked
        ? { ok: true, value: masked.toUpperCase() }
        : { ok: false, error: "Enter at least the last four characters" };
    }
    case "documentType":
      return isDocumentType(input)
        ? { ok: true, value: input }
        : { ok: false, error: "Choose a document type" };
    default:
      return input.length <= 120
        ? { ok: true, value: input }
        : { ok: false, error: "Keep it under 120 characters" };
  }
}

/** Value for an <input>: money as "212.48", everything else as text. */
export function inputValue(
  key: FieldKey,
  value: FieldValue | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  if (FIELD_DEF[key].kind === "money" && typeof value === "number") {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  }
  return String(value);
}

// Fixed names so output doesn't depend on the runtime's ICU data (en-IE says "Sept" in some).
export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function parts(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function utc(iso: string): Date {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "3 Oct 2026" for a date-only value. */
export function formatDate(iso: string): string {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

const monthYear = (iso: string) => {
  const { y, m } = parts(iso);
  return `${MONTH_SHORT[m - 1]} ${y}`;
};

/** Display text for a field value. */
export function formatFieldValue(
  key: FieldKey,
  value: FieldValue | null | undefined,
  currency = "EUR",
): string {
  if (value === null || value === undefined) return "Unknown";
  const def = FIELD_DEF[key];
  switch (def.kind) {
    case "money":
      return typeof value === "number"
        ? formatMoney(value, currency)
        : String(value);
    case "date":
      return typeof value === "string" && validIsoDate(value)
        ? formatDate(value)
        : String(value);
    case "documentType":
      return isDocumentType(value)
        ? DOCUMENT_TYPE_LABELS[value]
        : String(value);
    case "decimal":
      return def.unit === "%"
        ? `${value}%`
        : `${value} ${def.unit ?? ""}`.trim();
    default:
      return String(value);
  }
}

/**
 * "Sep 2026" for a one-month period, "Jul–Aug 2026" across months, "Dec 2026–Jan 2027" across
 * years, else the document date ("14 Oct 2026"). Null when nothing is known.
 */
export function periodLabel(
  start: string | null,
  end: string | null,
  documentDate: string | null,
): string | null {
  if (start && end) {
    const a = parts(start);
    const b = parts(end);
    if (a.y !== b.y) return `${monthYear(start)}–${monthYear(end)}`;
    if (a.m === b.m) return monthYear(start);
    return `${MONTH_SHORT[a.m - 1]}–${monthYear(end)}`;
  }
  if (end) return monthYear(end);
  if (documentDate) return formatDate(documentDate);
  return null;
}

/** Months (1–12) of `year` a bill covers: its period, else its date's month. */
export function monthsCovered(
  start: string | null,
  end: string | null,
  documentDate: string | null,
  year: number,
): number[] {
  const from = start ?? end ?? documentDate;
  const to = end ?? start ?? documentDate;
  if (!from || !to || !validIsoDate(from) || !validIsoDate(to)) return [];
  const DAY = 86_400_000;
  const s = utc(from).getTime();
  const e = utc(to).getTime();
  if (e < s) return [];
  const periodDays = (e - s) / DAY + 1;
  const months: number[] = [];
  // A month counts when the bill covers at least a week of it (or all of a shorter bill).
  // Capped at 36 months: a longer "bill" is a data error, not a loop.
  const first = utc(from);
  for (let i = 0; i < 36; i += 1) {
    const y =
      first.getUTCFullYear() + Math.floor((first.getUTCMonth() + i) / 12);
    const m = ((first.getUTCMonth() + i) % 12) + 1;
    const monthStart = Date.UTC(y, m - 1, 1);
    if (monthStart > e) break;
    const monthEnd = Date.UTC(y, m, 0);
    const overlap = (Math.min(e, monthEnd) - Math.max(s, monthStart)) / DAY + 1;
    if (y === year && overlap >= Math.min(7, periodDays)) months.push(m);
  }
  return months;
}

type DocumentColumns = {
  supplier: string | null;
  document_type: string | null;
  document_date: string | null;
  period_start: string | null;
  period_end: string | null;
  due_date: string | null;
  total_cents: number | null;
  vat_cents: number | null;
};

/** Splits field values into documents columns and the details JSON. */
export function toDocumentUpdate(values: FieldValues): {
  columns: DocumentColumns;
  details: Record<string, FieldValue>;
} {
  const text = (key: FieldKey) => {
    const v = values[key];
    return typeof v === "string" ? v : null;
  };
  const cents = (key: FieldKey) => {
    const v = values[key];
    return typeof v === "number" ? v : null;
  };
  const details: Record<string, FieldValue> = {};
  for (const key of FIELD_KEYS) {
    const value = values[key];
    if (!FIELD_DEF[key].column && value !== null && value !== undefined) {
      details[key] = value;
    }
  }
  return {
    columns: {
      supplier: text("supplier"),
      document_type: text("document_type"),
      document_date: text("document_date"),
      period_start: text("period_start"),
      period_end: text("period_end"),
      due_date: text("due_date"),
      total_cents: cents("total_cents"),
      vat_cents: cents("vat_cents"),
    },
    details,
  };
}

/** Reads field values back from a documents row. */
export function fromDocumentRow(
  row: DocumentColumns & { details: unknown },
): FieldValues {
  const values: FieldValues = {
    supplier: row.supplier,
    document_type: row.document_type,
    document_date: row.document_date,
    period_start: row.period_start,
    period_end: row.period_end,
    due_date: row.due_date,
    total_cents: row.total_cents,
    vat_cents: row.vat_cents,
  };
  if (
    row.details &&
    typeof row.details === "object" &&
    !Array.isArray(row.details)
  ) {
    for (const [key, value] of Object.entries(
      row.details as Record<string, unknown>,
    )) {
      if (
        isFieldKey(key) &&
        !FIELD_DEF[key].column &&
        (typeof value === "string" || typeof value === "number")
      ) {
        values[key] = value;
      }
    }
  }
  return values;
}

/** Problems that stop a review being saved (beyond per-field validation). */
export function crossFieldErrors(values: FieldValues): string[] {
  const errors: string[] = [];
  const start = values.period_start;
  const end = values.period_end;
  if (typeof start === "string" && typeof end === "string" && end < start) {
    errors.push("The period ends before it starts.");
  }
  return errors;
}
