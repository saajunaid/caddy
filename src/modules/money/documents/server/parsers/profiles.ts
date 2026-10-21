// Label profiles: the wording each document uses before a value. Patterns run against one line at a
// time, lower-cased and accent-free (see foldForMatch). Pure; runs in Node.
//
// Three tiers, tried in order for every field:
//   1. the supplier's own profile (wording checked against sample layouts)  → high confidence
//   2. the generic labels, when the supplier is known                         → medium confidence
//   3. the generic labels, when the supplier is unknown                       → low confidence
// To add a supplier parser: add a profile below keyed by the supplier id in suppliers.ts, add a
// synthetic fixture in tests/fixtures/bills/ and a test in parsers.test.ts.

export type LabelGroup =
  | "document_date"
  | "period"
  | "due_date"
  | "total"
  | "vat"
  | "standing_charge"
  | "invoice"
  | "account"
  | "mprn"
  | "gprn"
  | "day"
  | "night"
  | "peak"
  | "standard"
  | "gas";

export type LabelSet = Partial<Record<LabelGroup, RegExp[]>>;

export type Profile = {
  id: string;
  version: string;
  labels: LabelSet;
};

/** Lines that look like a label but never hold the value for that group. */
export const EXCLUDE: Partial<Record<LabelGroup, RegExp>> = {
  total:
    /\bsub ?total\b|\bprevious\b|\blast bill\b|\bbrought forward\b|\bpayments? received\b|\bsavings?\b|\byou saved\b|\bitems?\b|\bkwh\b|\bunits\b|\btotal vat\b|\bvat total\b|\bexcl/,
  vat: /\breg(?:istration|\.)?\b|\bvat (?:no|number)\b|\bincl(?:uding|\.)?\b|\bexcl(?:uding|\.)?\b|\btotal\b|\bsummary\b|\bbefore vat\b/,
  document_date: /\bdue\b|\bperiod\b|\bnext\b|\breading\b/,
  due_date: /\bperiod\b/,
  account: /\biban\b|\bbic\b|\bsort code\b/,
  invoice: /\bdate\b/,
  day: /\bdays?\b.*\bperiod\b|\bnumber of days\b/,
};

export const GENERIC: Profile = {
  id: "generic",
  version: "1",
  labels: {
    document_date: [
      /\b(?:bill|invoice|statement|issue|document|print) date\b/,
      /\bdate of (?:bill|invoice|issue|statement)\b/,
      /\btax point\b/,
      /^date\b/,
    ],
    period: [
      /\b(?:billing|bill|service|invoice|statement|charging|usage) period\b/,
      /\bfor the period\b/,
      /\bperiod (?:from|covered)\b/,
      /^period\b/,
    ],
    due_date: [
      /\b(?:due date|payment due|pay by|please pay by|due on|due by)\b/,
      /\bdirect debit (?:on|date)\b/,
      /\bwill be (?:debited|collected)\b/,
      /\bon or (?:after|before)\b/,
    ],
    total: [
      /\b(?:total amount due|amount due|total due|balance due|amount to pay|total to pay|amount payable|total payable|total this bill|total for this bill)\b/,
      /^(?:grand )?total\b/,
    ],
    vat: [/\bvat\b/],
    standing_charge: [/\bstanding charges?\b/],
    invoice: [
      /\b(?:invoice|bill|statement) (?:no|number|ref(?:erence)?)\b\.?/,
      /\binvoice #/,
    ],
    account: [
      /\baccount (?:no|number|ref(?:erence)?)\b\.?/,
      /\bcustomer (?:no|number|ref(?:erence)?)\b\.?/,
    ],
    mprn: [/\bmprn\b/],
    gprn: [/\bgprn\b/],
    day: [/^day\b/, /\bday (?:units|rate|energy|usage)\b/],
    night: [/^night\b/, /\bnight (?:units|rate|energy|usage)\b/],
    peak: [/^peak\b/, /\bpeak (?:units|rate|energy|usage)\b/],
    standard: [
      /\b24 ?(?:hr|hour)\b/,
      /\bstandard (?:units|rate)\b/,
      /\bgeneral domestic\b/,
    ],
    gas: [
      /\bgas (?:units|used|usage|consumption|kwh)\b/,
      /\bkwh used\b/,
      /\btotal kwh\b/,
    ],
  },
};

/** Supplier parsers, keyed by supplier id. Wording mirrors each supplier's bill layout. */
export const SUPPLIER_PROFILES: Record<string, Profile> = {
  "electric-ireland": {
    id: "electric-ireland",
    version: "1",
    labels: {
      document_date: [/^bill date\b/],
      period: [/^billing period\b/],
      due_date: [/\bpayment due date\b/, /\bdirect debit on or after\b/],
      total: [/^total amount due\b/],
      vat: [/^vat @/],
      standing_charge: [/^standing charge\b/],
      invoice: [/^invoice no\b\.?/],
      account: [/^account number\b/],
      mprn: [/^mprn\b/],
      day: [/^day units\b/],
      night: [/^night units\b/],
      peak: [/^peak units\b/],
      standard: [/^24 hour units\b/],
    },
  },
  "sse-airtricity": {
    id: "sse-airtricity",
    version: "1",
    labels: {
      document_date: [/^date of bill\b/],
      period: [/^bill period\b/],
      due_date: [/\bcollected by direct debit on or after\b/, /^due date\b/],
      total: [/^total amount due\b/],
      vat: [/^vat at\b/],
      standing_charge: [/^standing charge\b/],
      invoice: [/^bill number\b/],
      account: [/^account number\b/],
      mprn: [/^mprn\b/],
      day: [/^day units\b/],
      night: [/^night units\b/],
      standard: [/^24hr units\b/],
      gas: [/^gas units\b/],
    },
  },
  energia: {
    id: "energia",
    version: "1",
    labels: {
      document_date: [/^bill date\b/],
      period: [/^billing period\b/],
      due_date: [/^amount will be debited on\b/],
      total: [/^total due\b/],
      vat: [/^vat\b.*%/],
      standing_charge: [/^standing charge\b/],
      invoice: [/^invoice number\b/],
      account: [/^account no\b\.?/],
      mprn: [/^mprn\b/],
      day: [/^day\b/],
      night: [/^night\b/],
      peak: [/^peak\b/],
    },
  },
  "bord-gais-energy": {
    id: "bord-gais-energy",
    version: "1",
    labels: {
      document_date: [/^bill issue date\b/],
      period: [/^bill period\b/],
      due_date: [/^payment due by\b/],
      total: [/^total amount due\b/],
      vat: [/^vat \(/],
      standing_charge: [/^standing charge\b/],
      invoice: [/^bill no\b\.?/],
      account: [/^account number\b/],
      gprn: [/^gprn\b/],
      gas: [/^total gas used\b/],
    },
  },
  flogas: {
    id: "flogas",
    version: "1",
    labels: {
      document_date: [/^invoice date\b/],
      period: [/^billing period\b/],
      due_date: [/^payment due\b/],
      total: [/^total amount due\b/],
      vat: [/^vat @/],
      standing_charge: [/^(?:electricity |gas )?standing charge\b/],
      invoice: [/^invoice number\b/],
      account: [/^account number\b/],
      mprn: [/^mprn\b/],
      gprn: [/^gprn\b/],
      standard: [/^electricity 24hr units\b/],
      gas: [/^gas units\b/],
    },
  },
  eir: {
    id: "eir",
    version: "1",
    labels: {
      document_date: [/^bill date\b/],
      period: [/^monthly charges\b/],
      due_date: [/^payment due by\b/],
      total: [/^amount due\b/],
      vat: [/^vat @/],
      invoice: [/^bill number\b/],
      account: [/^account no\b\.?/],
    },
  },
  "virgin-media": {
    id: "virgin-media",
    version: "1",
    labels: {
      document_date: [/^bill date\b/],
      period: [/^service period\b/],
      due_date: [/^we will collect\b/],
      total: [/^total due\b/],
      vat: [/^vat included at\b/],
      invoice: [/^invoice number\b/],
      account: [/^account number\b/],
    },
  },
  tesco: {
    id: "tesco",
    version: "1",
    labels: {
      total: [/^total to pay\b/],
    },
  },
  lidl: {
    id: "lidl",
    version: "1",
    labels: {
      total: [/^total\b/],
      document_date: [/^date\b/],
    },
  },
};
