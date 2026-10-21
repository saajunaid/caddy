// CSV export of a tax year's evidence and estimates. Pure.
import { MONTH_SHORT } from "../../documents/review.ts";
import type { YearSummary } from "./summary.ts";

/** Cents as a plain decimal for spreadsheets: 21248 → "212.48", -5 → "-0.05". */
export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents))
    throw new Error("Cents must be a whole number");
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * One CSV cell. Quotes when needed, and neutralises text that a spreadsheet would run as a formula
 * (=, +, -, @ at the start), since supplier names come from documents.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(
  cells: readonly (string | number | null | undefined)[],
): string {
  return cells.map(csvCell).join(",");
}

export function taxYearCsv(
  summary: YearSummary,
  options: { generatedOn: string; categoryLabel: (category: string) => string },
): string {
  const rows: string[] = [];
  const rule = summary.rule?.record;
  rows.push(csvRow(["Caddy tax evidence export"]));
  rows.push(csvRow(["Tax year", summary.year]));
  rows.push(
    csvRow([
      "Rule",
      rule
        ? `${rule.ruleCode} v${rule.version} (reviewed ${rule.reviewedOn})`
        : "No rule for this year",
    ]),
  );
  rows.push(csvRow(["Source", rule?.officialSourceUrl ?? ""]));
  rows.push(csvRow(["Generated", options.generatedOn]));
  rows.push(
    csvRow([
      "Note",
      "Estimates only. Caddy organises evidence and estimates; it never files a claim. Verify in Revenue myAccount.",
    ]),
  );
  rows.push("");

  rows.push(
    csvRow([
      "Member",
      "Category",
      "Supplier",
      "Period start",
      "Period end",
      "Bill date",
      "Amount counted (EUR)",
      "Share %",
      "Document",
    ]),
  );
  for (const m of summary.members) {
    for (const e of m.evidence) {
      rows.push(
        csvRow([
          m.member.name,
          options.categoryLabel(e.category),
          e.supplier,
          e.periodStart,
          e.periodEnd,
          e.documentDate,
          centsToDecimal(e.paidCents),
          e.sharePercent,
          e.documentId,
        ]),
      );
    }
  }
  rows.push("");

  rows.push(
    csvRow([
      "Member",
      "A: allowable bills (EUR)",
      "B: days worked from home",
      "C: days in year",
      "Share of bills for WFH (EUR)",
      "D: employer allowance (EUR)",
      "Estimated claimable (EUR)",
      "Estimated tax back at 20% (EUR)",
      "Estimated tax back at 40% (EUR)",
      "Months without WFH days",
    ]),
  );
  for (const m of summary.members) {
    const b = m.breakdown;
    rows.push(
      csvRow(
        b
          ? [
              m.member.name,
              centsToDecimal(b.allowableCents),
              b.wfhDays,
              b.daysInYear,
              centsToDecimal(b.wfhShareCents),
              centsToDecimal(b.allowanceCents),
              centsToDecimal(b.claimableCents),
              centsToDecimal(b.taxBackCents.standard),
              centsToDecimal(b.taxBackCents.higher),
              b.monthsMissing.map((n) => MONTH_SHORT[n - 1]).join(" "),
            ]
          : [m.member.name, "No rule for this year"],
      ),
    );
  }
  return `${rows.join("\r\n")}\r\n`;
}
