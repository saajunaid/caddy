// Parser for the ECB euro foreign exchange reference rates XML (daily or 90-day history).
// The format is small and stable, so a strict regex parser avoids an XML dependency. Pure.
import type { IsoDate } from "../../../server/domain/dates.ts";

export const ECB_DAILY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
export const ECB_90_DAY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

export type EcbRate = { date: IsoDate; currency: string; rate: string };

const DAY =
  /<Cube\s+time\s*=\s*(['"])(\d{4}-\d{2}-\d{2})\1\s*>([\s\S]*?)<\/Cube>/g;
const RATE = /<Cube\s+([^>]*?)\/>/g;
const ATTR = /(\w+)\s*=\s*(['"])([^'"]*)\2/g;

function attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, , value] of text.matchAll(ATTR)) out[name] = value;
  return out;
}

/**
 * Every (date, currency, rate) in the file. Rates stay exact decimal strings. Entries with a
 * malformed currency or rate are skipped, so a page that changes format yields zero rates
 * (which the job reports as a failed source) rather than wrong numbers.
 */
export function parseEcbXml(xml: string): EcbRate[] {
  const rates: EcbRate[] = [];
  for (const [, , date, body] of xml.matchAll(DAY)) {
    for (const [, attrs] of body.matchAll(RATE)) {
      const { currency, rate } = attributes(attrs);
      if (!currency || !/^[A-Z]{3}$/.test(currency) || currency === "EUR")
        continue;
      if (
        !rate ||
        !/^\d{1,10}(\.\d{1,8})?$/.test(rate) ||
        /^0*\.?0*$/.test(rate)
      )
        continue;
      rates.push({ date, currency, rate });
    }
  }
  return rates;
}
