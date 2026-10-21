// Deterministic bill and receipt reader: text → proposed fields with per-field confidence and the
// matched line. No AI, no I/O; runs in Node and in the app. Nothing here is ever auto-confirmed.

import type {
  Confidence,
  DocumentType,
  FieldKey,
  FieldValue,
  ProposedField,
  ProposedFields,
} from "../../fields.ts";
import {
  EXCLUDE,
  GENERIC,
  SUPPLIER_PROFILES,
  type LabelGroup,
  type Profile,
} from "./profiles.ts";
import { detectSupplier, type Supplier } from "./suppliers.ts";
import {
  findDates,
  findMoney,
  foldForMatch,
  normalizeText,
  readAccount,
  readGprn,
  readMprn,
  readPercent,
  readRate,
  readReference,
  readUnits,
  redactSnippet,
  splitLines,
} from "./values.ts";

/** Bump when parsing rules change, so stored extractions show which rules produced them. */
export const ENGINE_VERSION = "1";
/** Longest text the parsers read. Bills are a few thousand characters; this caps abuse. */
export const MAX_TEXT_CHARS = 150_000;

export type ParseResult = {
  extractor: string;
  extractorVersion: string;
  supplierId: string | null;
  documentType: DocumentType | null;
  fields: ProposedFields;
  warnings: string[];
};

type Values = Partial<Record<FieldKey, FieldValue>>;

const GROUPS: readonly LabelGroup[] = [
  "document_date",
  "period",
  "due_date",
  "total",
  "vat",
  "standing_charge",
  "invoice",
  "account",
  "mprn",
  "gprn",
  "day",
  "night",
  "peak",
  "standard",
  "gas",
];

/** Groups whose value may sit on the line after the label (two-column layouts). */
const NEXT_LINE: ReadonlySet<LabelGroup> = new Set([
  "document_date",
  "period",
  "due_date",
  "total",
  "invoice",
  "account",
  "mprn",
  "gprn",
]);

const IDENTIFIER_LABEL: Partial<Record<LabelGroup, string>> = {
  account: "Account",
  mprn: "MPRN",
  gprn: "GPRN",
};

const UNIT_FIELDS: Record<
  "day" | "night" | "peak" | "standard" | "gas",
  [FieldKey, FieldKey]
> = {
  day: ["day_kwh", "day_rate_cents"],
  night: ["night_kwh", "night_rate_cents"],
  peak: ["peak_kwh", "peak_rate_cents"],
  standard: ["standard_kwh", "standard_rate_cents"],
  gas: ["gas_kwh", "gas_rate_cents"],
};

function lastMoney(text: string): number | undefined {
  const tokens = findMoney(text);
  return tokens.length ? tokens[tokens.length - 1].cents : undefined;
}

function firstDate(text: string): string | undefined {
  return findDates(text)[0]?.iso;
}

/** Reads the values a label group can hold from the text after the label. */
export function readGroup(group: LabelGroup, text: string): Values {
  const out: Values = {};
  const set = (key: FieldKey, value: FieldValue | null | undefined) => {
    if (value !== null && value !== undefined) out[key] = value;
  };
  switch (group) {
    case "document_date":
      set("document_date", firstDate(text));
      break;
    case "due_date":
      set("due_date", firstDate(text));
      break;
    case "period": {
      const dates = findDates(text);
      if (dates.length >= 2 && dates[1].iso >= dates[0].iso) {
        set("period_start", dates[0].iso);
        set("period_end", dates[1].iso);
      }
      break;
    }
    case "total":
      set("total_cents", lastMoney(text));
      break;
    case "vat":
      set("vat_cents", lastMoney(text));
      set("vat_rate_percent", readPercent(text));
      break;
    case "standing_charge":
      set("standing_charge_cents", lastMoney(text));
      break;
    case "invoice":
      set("invoice_number", readReference(text));
      break;
    case "account":
      set("account_number_masked", readAccount(text));
      break;
    case "mprn":
      set("mprn_masked", readMprn(text));
      break;
    case "gprn":
      set("gprn_masked", readGprn(text));
      break;
    default: {
      const [unitsKey, rateKey] = UNIT_FIELDS[group];
      set(unitsKey, readUnits(text)?.value);
      set(rateKey, readRate(text));
    }
  }
  return out;
}

type Hit = { values: Values; snippet: string };

function scan(
  group: LabelGroup,
  pattern: RegExp,
  folded: string[],
  original: string[],
  applyExclude: boolean,
): Hit[] {
  const hits: Hit[] = [];
  const exclude = applyExclude ? EXCLUDE[group] : undefined;
  folded.forEach((line, i) => {
    const match = pattern.exec(line);
    if (!match) return;
    if (exclude?.test(line)) return;
    const remainder = line.slice(match.index + match[0].length);
    let values = readGroup(group, remainder);
    let snippet = original[i];
    if (
      Object.keys(values).length === 0 &&
      NEXT_LINE.has(group) &&
      i + 1 < folded.length
    ) {
      values = readGroup(group, folded[i + 1]);
      snippet = `${original[i]} ${original[i + 1]}`;
    }
    if (Object.keys(values).length === 0) return;
    const label = IDENTIFIER_LABEL[group];
    hits.push({
      values,
      // Identifier lines are rebuilt from the masked value so the full number never leaves here.
      snippet: label
        ? `${label} ${Object.values(values)[0]}`
        : redactSnippet(snippet),
    });
  });
  return hits;
}

function combine(
  hits: Hit[],
  key: FieldKey,
  confidence: Confidence,
): ProposedField | null {
  const withKey = hits.filter((h) => h.values[key] !== undefined);
  if (withKey.length === 0) return null;
  const distinct = [
    ...new Map(
      withKey.map((h) => [String(h.values[key]), h.values[key]!]),
    ).values(),
  ];
  if (distinct.length === 1) {
    return { value: distinct[0], confidence, snippet: withKey[0].snippet };
  }
  // Several different values for one field: show them all and let the user pick. Never guess.
  return {
    value: null,
    confidence: "low",
    snippet: withKey[0].snippet,
    candidates: distinct.slice(0, 6),
  };
}

function detectType(folded: string, supplier: Supplier | null): ProposedField {
  const electricity =
    /\bmprn\b|\belectricity\b|\bday units\b|\bnight units\b|\besb networks\b/.test(
      folded,
    );
  const gas =
    /\bgprn\b|\bgas networks ireland\b|\bgas (?:units|used|usage)\b|\bnatural gas\b/.test(
      folded,
    );
  const broadband = /\bbroadband\b|\bfibre\b|\binternet\b/.test(folded);
  const receipt =
    /\breceipt\b|\bcashier\b|\btill\b|\bchange due\b|\bcard payment\b|\bcontactless\b|\bvisa\b|\bmastercard\b/.test(
      folded,
    );

  if (supplier?.kind === "retail")
    return { value: "receipt", confidence: "high" };
  if (supplier?.kind === "telecom") {
    return {
      value: "broadband_bill",
      confidence: broadband ? "high" : "medium",
    };
  }
  if (supplier?.kind === "energy") {
    if (electricity && gas)
      return { value: "dual_fuel_bill", confidence: "high" };
    if (gas) return { value: "gas_bill", confidence: "high" };
    if (electricity) return { value: "electricity_bill", confidence: "high" };
    return {
      value: null,
      confidence: "low",
      candidates: ["electricity_bill", "gas_bill"],
    };
  }
  if (electricity && gas) return { value: "dual_fuel_bill", confidence: "low" };
  if (/\bmprn\b/.test(folded))
    return { value: "electricity_bill", confidence: "low" };
  if (/\bgprn\b/.test(folded)) return { value: "gas_bill", confidence: "low" };
  if (broadband) return { value: "broadband_bill", confidence: "low" };
  if (receipt) return { value: "receipt", confidence: "low" };
  return { value: "other", confidence: "low" };
}

/** Reads a bill or receipt's text and proposes fields. Unknown stays absent; nothing is invented. */
export function parseDocumentText(rawText: string): ParseResult {
  const text = normalizeText(rawText.slice(0, MAX_TEXT_CHARS));
  const original = splitLines(text);
  const folded = original.map(foldForMatch);
  const warnings: string[] = [];

  if (original.length === 0) {
    return {
      extractor: "rules:none",
      extractorVersion: ENGINE_VERSION,
      supplierId: null,
      documentType: null,
      fields: {},
      warnings: ["no-text"],
    };
  }

  const detection = detectSupplier(text);
  const supplier = detection.supplier;
  const profile: Profile | undefined = supplier
    ? SUPPLIER_PROFILES[supplier.id]
    : undefined;
  const tiers: {
    profile: Profile;
    confidence: Confidence;
    exclude: boolean;
  }[] = [
    ...(profile
      ? [{ profile, confidence: "high" as const, exclude: false }]
      : []),
    {
      profile: GENERIC,
      confidence: supplier ? ("medium" as const) : ("low" as const),
      exclude: true,
    },
  ];

  const fields: ProposedFields = {};
  if (supplier) {
    fields.supplier = {
      value: supplier.name,
      confidence: detection.confidence,
      snippet: detection.snippet ? redactSnippet(detection.snippet) : undefined,
    };
  } else if (detection.candidates.length > 0) {
    fields.supplier = {
      value: null,
      confidence: "low",
      candidates: detection.candidates.map((s) => s.name),
    };
    warnings.push("supplier-ambiguous");
  }

  const type = detectType(folded.join("\n"), supplier);
  fields.document_type = type;

  for (const group of GROUPS) {
    groupLoop: for (const tier of tiers) {
      for (const pattern of tier.profile.labels[group] ?? []) {
        const hits = scan(group, pattern, folded, original, tier.exclude);
        if (hits.length === 0) continue;
        const keys = new Set(
          hits.flatMap((h) => Object.keys(h.values)),
        ) as Set<FieldKey>;
        for (const key of keys) {
          const field = combine(hits, key, tier.confidence);
          if (field && !fields[key]) fields[key] = field;
        }
        break groupLoop;
      }
    }
  }

  // Generic fallback for the document date: a single date anywhere is a weak hint; several are
  // offered as choices.
  if (!fields.document_date) {
    const dates = [...new Set(findDates(text).map((d) => d.iso))];
    if (dates.length === 1) {
      fields.document_date = { value: dates[0], confidence: "low" };
    } else if (dates.length > 1 && dates.length <= 6) {
      fields.document_date = {
        value: null,
        confidence: "low",
        candidates: dates,
      };
    }
  }

  for (const [key, field] of Object.entries(fields)) {
    if (field && field.value === null && field.candidates?.length) {
      warnings.push(`${key}-ambiguous`);
    }
  }
  if (!fields.total_cents) warnings.push("total-not-found");

  return {
    extractor: `rules:${profile?.id ?? "generic"}`,
    extractorVersion: `${ENGINE_VERSION}.${profile?.version ?? GENERIC.version}`,
    supplierId: supplier?.id ?? null,
    documentType: (type.value as DocumentType | null) ?? null,
    fields,
    warnings: [...new Set(warnings)],
  };
}

/** Fields with a usable value (not just candidates). */
export function countFoundFields(fields: ProposedFields): number {
  return Object.values(fields).filter((f) => f && f.value !== null).length;
}
