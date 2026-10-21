// Irish suppliers and retailers Caddy recognises, and how to spot them in document text.
// Pure; runs in Node. Patterns run against accent-free lower-case text (see foldForMatch).

import type { Confidence } from "../../fields.ts";
import { foldForMatch } from "./values.ts";

export type SupplierKind = "energy" | "telecom" | "retail";

export type Supplier = {
  id: string;
  name: string;
  kind: SupplierKind;
  /** Name patterns. Each distinct pattern found adds to the score. */
  names: RegExp[];
  /** Web domains printed on documents (strong signal). */
  domains: string[];
};

export const SUPPLIERS: readonly Supplier[] = [
  // Electricity and gas
  {
    id: "electric-ireland",
    name: "Electric Ireland",
    kind: "energy",
    names: [/\belectric ireland\b/],
    domains: ["electricireland.ie"],
  },
  {
    id: "sse-airtricity",
    name: "SSE Airtricity",
    kind: "energy",
    names: [/\bsse airtricity\b/, /\bairtricity\b/],
    domains: ["sseairtricity.com"],
  },
  {
    id: "energia",
    name: "Energia",
    kind: "energy",
    names: [/\benergia\b/],
    domains: ["energia.ie"],
  },
  {
    id: "bord-gais-energy",
    name: "Bord Gáis Energy",
    kind: "energy",
    names: [/\bbord gais energy\b/, /\bbord gais\b/],
    domains: ["bordgaisenergy.ie"],
  },
  {
    id: "flogas",
    name: "Flogas",
    kind: "energy",
    names: [/\bflogas\b/],
    domains: ["flogas.ie"],
  },
  {
    id: "pinergy",
    name: "Pinergy",
    kind: "energy",
    names: [/\bpinergy\b/],
    domains: ["pinergy.ie"],
  },
  {
    id: "prepaypower",
    name: "PrePayPower",
    kind: "energy",
    names: [/\bprepay ?power\b/],
    domains: ["prepaypower.ie"],
  },
  {
    id: "yuno-energy",
    name: "Yuno Energy",
    kind: "energy",
    names: [/\byuno energy\b/, /\byuno\b/],
    domains: ["yunoenergy.ie"],
  },
  {
    id: "community-power",
    name: "Community Power",
    kind: "energy",
    names: [/\bcommunity power\b/],
    domains: ["communitypower.ie"],
  },
  {
    id: "ecopower",
    name: "Ecopower",
    kind: "energy",
    names: [/\becopower\b/],
    domains: ["ecopower.ie"],
  },
  // Broadband and phone. "Three" and "Sky" are ordinary words, so they need a qualifier.
  {
    id: "eir",
    name: "Eir",
    kind: "telecom",
    names: [/\beir\b/],
    domains: ["eir.ie"],
  },
  {
    id: "virgin-media",
    name: "Virgin Media",
    kind: "telecom",
    names: [/\bvirgin media\b/],
    domains: ["virginmedia.ie"],
  },
  {
    id: "vodafone",
    name: "Vodafone",
    kind: "telecom",
    names: [/\bvodafone\b/],
    domains: ["vodafone.ie"],
  },
  {
    id: "sky",
    name: "Sky",
    kind: "telecom",
    names: [
      /\bsky ireland\b/,
      /\bsky broadband\b/,
      /\bsky (?:tv|talk|mobile)\b/,
    ],
    domains: ["sky.ie"],
  },
  {
    id: "three",
    name: "Three",
    kind: "telecom",
    names: [/\bthree ireland\b/, /\bthree broadband\b/],
    domains: ["three.ie"],
  },
  {
    id: "pure-telecom",
    name: "Pure Telecom",
    kind: "telecom",
    names: [/\bpure telecom\b/],
    domains: ["puretelecom.ie"],
  },
  {
    id: "digiweb",
    name: "Digiweb",
    kind: "telecom",
    names: [/\bdigiweb\b/],
    domains: ["digiweb.ie"],
  },
  // Retailers (receipts)
  {
    id: "tesco",
    name: "Tesco",
    kind: "retail",
    names: [/\btesco\b/, /\bclubcard\b/],
    domains: ["tesco.ie"],
  },
  {
    id: "dunnes",
    name: "Dunnes Stores",
    kind: "retail",
    names: [/\bdunnes stores\b/, /\bdunnes\b/],
    domains: ["dunnesstores.com"],
  },
  {
    id: "lidl",
    name: "Lidl",
    kind: "retail",
    names: [/\blidl\b/],
    domains: ["lidl.ie"],
  },
  {
    id: "aldi",
    name: "Aldi",
    kind: "retail",
    names: [/\baldi\b/],
    domains: ["aldi.ie"],
  },
  {
    id: "supervalu",
    name: "SuperValu",
    kind: "retail",
    names: [/\bsuper ?valu\b/],
    domains: ["supervalu.ie"],
  },
];

export type SupplierDetection = {
  supplier: Supplier | null;
  confidence: Confidence;
  /** Every supplier seen, best first, when more than one was. */
  candidates: Supplier[];
  snippet?: string;
};

function score(folded: string, supplier: Supplier): number {
  let total = 0;
  for (const pattern of supplier.names) {
    const global = new RegExp(pattern.source, "g");
    const hits = folded.match(global)?.length ?? 0;
    total += Math.min(hits, 3);
  }
  for (const domain of supplier.domains) {
    if (folded.includes(domain)) total += 3;
  }
  return total;
}

/**
 * Finds the supplier. One clear winner → high (or medium if seen only once). Several with
 * similar scores → no supplier, low confidence, all of them as candidates: the user picks.
 */
export function detectSupplier(text: string): SupplierDetection {
  const folded = foldForMatch(text);
  const scored = SUPPLIERS.map((supplier) => ({
    supplier,
    score: score(folded, supplier),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return { supplier: null, confidence: "low", candidates: [] };
  }
  const [best, second] = scored;
  const snippet = firstLineMentioning(text, best.supplier);
  if (!second) {
    return {
      supplier: best.supplier,
      confidence: best.score >= 2 ? "high" : "medium",
      candidates: [],
      snippet,
    };
  }
  if (best.score >= second.score * 2 && best.score >= 3) {
    return {
      supplier: best.supplier,
      confidence: "medium",
      candidates: scored.map((s) => s.supplier),
      snippet,
    };
  }
  return {
    supplier: null,
    confidence: "low",
    candidates: scored.map((s) => s.supplier),
  };
}

function firstLineMentioning(
  text: string,
  supplier: Supplier,
): string | undefined {
  for (const line of text.split("\n")) {
    const folded = foldForMatch(line);
    if (
      supplier.names.some((p) => p.test(folded)) ||
      supplier.domains.some((d) => folded.includes(d))
    ) {
      return line.trim().slice(0, 140);
    }
  }
  return undefined;
}

export function supplierById(id: string): Supplier | undefined {
  return SUPPLIERS.find((s) => s.id === id);
}
