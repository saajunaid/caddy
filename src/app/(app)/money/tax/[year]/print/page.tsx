import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  formatDate,
  MONTH_SHORT,
  periodLabel,
} from "@/modules/money/documents/review";
import {
  ALLOWANCE_CATEGORY,
  isTaxCategory,
  TAX_CATEGORY_LABELS,
  WFH_CATEGORY_SHORT,
} from "@/modules/money/tax/categories";
import { PrintButton } from "@/modules/money/tax/components/print-button";
import {
  HIGHER_RATE_PERCENT,
  STANDARD_RATE_PERCENT,
} from "@/modules/money/tax/domain/wfh";
import {
  isSupportedYear,
  loadTaxYear,
} from "@/modules/money/tax/server/queries";
import { link } from "@/modules/money/ui";
import { requireHousehold } from "@/server/auth";
import { formatMoney } from "@/server/domain/money";

export async function generateMetadata({
  params,
}: PageProps<"/money/tax/[year]/print">) {
  const { year } = await params;
  return { title: `Tax ${year} summary` };
}

// Paper-friendly: hide the app chrome, use dark text on white, keep tables together.
const PRINT_CSS = `
@media print {
  :root, :root[data-theme] { --bg:#fff; --surface:#fff; --sunk:#fff; --fg:#000; --muted:#333; --line:#bbb; color-scheme: light; }
  body { background:#fff !important; color:#000 !important; font-size: 11pt; }
  body::before, body header, aside[aria-label="Main navigation"], nav[aria-label="Main navigation"], [role="status"] { display:none !important; }
  main { padding:0 !important; }
  .print-sheet table { page-break-inside: avoid; }
  a { color:#000 !important; text-decoration:none !important; }
  @page { margin: 16mm; }
}
`;

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr className="border-b border-line">
      <td className={`py-1.5 pr-4 ${strong ? "font-bold" : ""}`}>{label}</td>
      <td className={`num py-1.5 text-right ${strong ? "font-bold" : ""}`}>
        {value}
      </td>
    </tr>
  );
}

export default async function TaxPrintPage({
  params,
}: PageProps<"/money/tax/[year]/print">) {
  const { year: raw } = await params;
  const year = Number(raw);
  const { profile } = await requireHousehold();
  if (!profile || !/^\d{4}$/.test(raw) || !isSupportedYear(year)) notFound();
  const { summary, today } = await loadTaxYear(year);
  const rule = summary.rule;

  return (
    <div className="print-sheet grid gap-6">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={`/money/tax/${year}`}
          className={`${link} inline-flex items-center gap-1 text-sm`}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Tax {year}
        </Link>
        <PrintButton />
      </div>

      <div className="grid gap-1 border-b-2 border-fg pb-3">
        <h2 className="text-[1.4rem] font-bold">
          Remote working relief · tax year {year}
        </h2>
        <p className="text-sm text-muted">
          {profile.householdName} · prepared {formatDate(today)} with Caddy ·
          estimates, not a tax return
        </p>
      </div>

      {!rule ? (
        <p>
          There is no reviewed relief rule for {year}, so nothing is estimated.
        </p>
      ) : (
        <section className="grid gap-1 text-sm">
          <p>
            <strong>Rule:</strong> {rule.record.ruleCode} v{rule.record.version}
            , tax years {rule.record.taxYearFrom}
            {rule.record.taxYearTo ? `–${rule.record.taxYearTo}` : " onwards"},
            reviewed {formatDate(rule.record.reviewedOn)}
          </p>
          <p>
            <strong>Formula:</strong> {rule.formula} (A = allowable bills, B =
            days worked from home, C = days in the year, D = employer allowance)
          </p>
          <p className="break-all">
            <strong>Source:</strong> {rule.record.officialSourceUrl}
          </p>
        </section>
      )}

      {summary.members.map((m) => {
        const b = m.breakdown;
        const bills = m.evidence.filter(
          (e) => e.category !== ALLOWANCE_CATEGORY,
        );
        return (
          <section key={m.member.id} className="grid gap-3">
            <h3 className="text-[1.1rem] font-semibold">{m.member.name}</h3>
            {b ? (
              <table className="w-full max-w-xl border-collapse text-sm">
                <tbody>
                  {b.categories.map((c) => (
                    <Row
                      key={c.category}
                      label={`${WFH_CATEGORY_SHORT[c.category as keyof typeof WFH_CATEGORY_SHORT] ?? c.category} (${c.count} bill${c.count === 1 ? "" : "s"})`}
                      value={formatMoney(c.allowableCents)}
                    />
                  ))}
                  <Row
                    label="A · allowable bills"
                    value={formatMoney(b.allowableCents)}
                  />
                  <Row
                    label="B · days worked from home"
                    value={String(b.wfhDays)}
                  />
                  <Row
                    label="C · days in the year"
                    value={String(b.daysInYear)}
                  />
                  <Row
                    label="A × B ÷ C · share of bills for remote working"
                    value={formatMoney(b.wfhShareCents)}
                  />
                  <Row
                    label="D · employer allowance paid"
                    value={formatMoney(b.allowanceCents)}
                  />
                  <Row
                    label={`(A × B ÷ C − D) × ${b.ratePercent}% · estimated claimable`}
                    value={formatMoney(b.claimableCents)}
                    strong
                  />
                  <Row
                    label={`Estimated tax back at ${STANDARD_RATE_PERCENT}%`}
                    value={formatMoney(b.taxBackCents.standard)}
                  />
                  <Row
                    label={`Estimated tax back at ${HIGHER_RATE_PERCENT}%`}
                    value={formatMoney(b.taxBackCents.higher)}
                  />
                </tbody>
              </table>
            ) : null}
            {b && b.monthsMissing.length > 0 ? (
              <p className="text-sm">
                WFH days not entered for:{" "}
                {b.monthsMissing.map((n) => MONTH_SHORT[n - 1]).join(", ")}
              </p>
            ) : null}
            {bills.length > 0 ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-fg text-left">
                    <th className="py-1.5 pr-3">Supplier</th>
                    <th className="py-1.5 pr-3">Period</th>
                    <th className="py-1.5 pr-3">Counts as</th>
                    <th className="py-1.5 pr-3 text-right">Amount</th>
                    <th className="py-1.5 text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((e) => (
                    <tr key={e.id} className="border-b border-line">
                      <td className="py-1.5 pr-3">{e.supplier ?? "Unknown"}</td>
                      <td className="py-1.5 pr-3">
                        {periodLabel(
                          e.periodStart,
                          e.periodEnd,
                          e.documentDate,
                        ) ?? "Unknown"}
                      </td>
                      <td className="py-1.5 pr-3">
                        {isTaxCategory(e.category)
                          ? TAX_CATEGORY_LABELS[e.category]
                          : e.category}
                      </td>
                      <td className="num py-1.5 pr-3 text-right">
                        {formatMoney(e.paidCents)}
                      </td>
                      <td className="num py-1.5 text-right">
                        {e.sharePercent}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm">No bills linked as evidence.</p>
            )}
          </section>
        );
      })}

      <section className="grid gap-1 text-sm">
        <h3 className="font-semibold">Evidence by month</h3>
        {summary.checklist.map((line) => (
          <p key={line.category}>
            {WFH_CATEGORY_SHORT[
              line.category as keyof typeof WFH_CATEGORY_SHORT
            ] ?? line.category}
            :{" "}
            {line.covered.length
              ? line.covered.map((n) => MONTH_SHORT[n - 1]).join(", ")
              : "none"}
            {line.missing.length
              ? ` · missing ${line.missing.map((n) => MONTH_SHORT[n - 1]).join(", ")}`
              : ""}
          </p>
        ))}
      </section>

      <p className="border-t border-line pt-3 text-sm">
        Caddy organises evidence and estimates; it never files a claim. Relief
        is given at the claimant&apos;s highest rate of income tax. Verify every
        figure in Revenue myAccount before claiming. Figures are rounded for
        display; the estimate is calculated exactly and rounded once.
      </p>
    </div>
  );
}
