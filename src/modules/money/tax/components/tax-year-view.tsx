import Link from "next/link";
import { Download, Printer, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/server/domain/money";
import { inputValue, periodLabel } from "../../documents/review";
import { btn, link, sectionTitle } from "../../ui";
import {
  ALLOWANCE_CATEGORY,
  TAX_CATEGORY_LABELS,
  isTaxCategory,
} from "../categories";
import type { TaxYearData } from "../server/queries";
import { FIRST_TAX_YEAR } from "../server/queries";
import { AllowanceForm } from "./allowance-form";
import { EvidenceChecklist } from "./evidence-checklist";
import { ClaimNote, ReliefCard } from "./relief-card";
import { WfhDaysForm } from "./wfh-days-form";

const categoryLabel = (c: string) =>
  isTaxCategory(c) ? TAX_CATEGORY_LABELS[c] : c;

export function TaxYearView({
  year,
  currentYear,
  data,
}: {
  year: number;
  currentYear: number;
  data: TaxYearData;
}) {
  const { summary, members } = data;
  const years = Array.from(
    new Set([
      ...Array.from(
        { length: currentYear - FIRST_TAX_YEAR + 1 },
        (_, i) => currentYear - i,
      ),
      ...data.yearsWithData,
    ]),
  ).sort((a, b) => b - a);
  const evidenceItems = summary.members.flatMap((m) =>
    m.evidence
      .filter((e) => e.category !== ALLOWANCE_CATEGORY)
      .map((e) => ({ ...e, memberName: m.member.name })),
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Tax year"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto"
        >
          {years.map((y) => (
            <Link
              key={y}
              href={`/money/tax/${y}`}
              aria-current={y === year ? "page" : undefined}
              className={cn(
                "num flex-none rounded-full border px-3 py-1.5 text-sm font-medium",
                y === year
                  ? "border-fg bg-fg text-bg"
                  : "border-line text-fg hover:border-muted",
              )}
            >
              {y}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap gap-2">
          <a href={`/money/tax/${year}/export.csv`} download className={btn}>
            <Download aria-hidden="true" />
            Export CSV
          </a>
          <Link href={`/money/tax/${year}/print`} className={btn}>
            <Printer aria-hidden="true" />
            Year summary
          </Link>
        </div>
      </div>

      {members.length === 0 ? (
        <EmptyState icon={Users} title="No adults to claim for">
          Remote working relief is worked out per adult. Adults appear here once
          they&apos;re in your household (Settings → Invite an adult).
        </EmptyState>
      ) : null}

      {!summary.rule ? (
        <EmptyState icon={Users} title={`No relief rule for ${year}`}>
          Caddy only estimates with a reviewed Revenue rule. There isn&apos;t
          one for {year} yet, so nothing is estimated.
        </EmptyState>
      ) : null}

      {members.length > 0 && summary.rule ? (
        <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
          <div className="grid content-start gap-[22px]">
            {summary.members.map((m) => (
              <ReliefCard key={m.member.id} summary={m} rule={summary.rule!} />
            ))}
            <ClaimNote rule={summary.rule} />
          </div>
          <div className="grid content-start gap-[22px]">
            <EvidenceChecklist
              checklist={summary.checklist}
              members={summary.members}
            />
            <Card className="grid gap-5 p-4">
              <div className="grid gap-1">
                <h3 className={sectionTitle}>Working-from-home days</h3>
                <p className="text-sm text-muted">
                  Days you worked from home for a substantial part of the day.
                  Your employer or diary is the best source.
                </p>
              </div>
              {summary.members.map((m) => (
                <div
                  key={m.member.id}
                  className="grid gap-4 border-t border-line pt-4 first-of-type:border-t-0 first-of-type:pt-0"
                >
                  <WfhDaysForm
                    memberId={m.member.id}
                    memberName={m.member.name}
                    year={year}
                    daysByMonth={m.daysByMonth}
                  />
                  <AllowanceForm
                    memberId={m.member.id}
                    memberName={m.member.name}
                    year={year}
                    amount={
                      data.allowanceByMember[m.member.id]
                        ? inputValue(
                            "total_cents",
                            data.allowanceByMember[m.member.id],
                          )
                        : ""
                    }
                  />
                </div>
              ))}
            </Card>
          </div>
        </div>
      ) : null}

      {members.length > 0 ? (
        <section aria-labelledby="evidence-items" className="grid gap-2.5">
          <h3 id="evidence-items" className={sectionTitle}>
            Evidence for {year}
          </h3>
          {evidenceItems.length === 0 ? (
            <p className="text-sm text-muted">
              No bills linked to {year} yet. Open a bill and tick &ldquo;Tax
              evidence&rdquo; to add it here.{" "}
              <Link href="/money" className={link}>
                Go to bills
              </Link>
            </p>
          ) : (
            <DataTable
              label={`Evidence for ${year}`}
              prefix="ev"
              searchPlaceholder="Search supplier"
              minWidth="560px"
              columns={[
                { key: "bill", label: "Bill" },
                {
                  key: "category",
                  label: "Counts as",
                  filter: true,
                  filterAll: "All kinds",
                },
                {
                  key: "member",
                  label: "For",
                  filter: true,
                  filterAll: "Everyone",
                },
                {
                  key: "amount",
                  label: "Amount",
                  align: "right",
                  firstDir: "desc",
                },
                { key: "share", label: "Share", align: "right" },
              ]}
              rows={evidenceItems.map((e) => ({
                key: e.id,
                sort: {
                  bill: e.periodStart ?? e.documentDate ?? null,
                  category: categoryLabel(e.category),
                  member: e.memberName,
                  amount: e.paidCents,
                  share: e.sharePercent,
                },
                filter: {
                  category: categoryLabel(e.category),
                  member: e.memberName,
                },
                search: `${e.supplier ?? ""} ${categoryLabel(e.category)} ${e.memberName}`,
                cells: {
                  bill: (
                    <>
                      {e.documentId ? (
                        <Link
                          href={`/money/bills/${e.documentId}`}
                          className={link}
                        >
                          {e.supplier ?? "Bill"}
                        </Link>
                      ) : (
                        (e.supplier ?? "—")
                      )}
                      <span className="block text-xs text-muted">
                        {periodLabel(
                          e.periodStart,
                          e.periodEnd,
                          e.documentDate,
                        ) ?? "Date unknown"}
                      </span>
                    </>
                  ),
                  category: categoryLabel(e.category),
                  member: e.memberName,
                  amount: (
                    <span className="num">{formatMoney(e.paidCents)}</span>
                  ),
                  share: <span className="num">{e.sharePercent}%</span>,
                },
              }))}
            />
          )}
        </section>
      ) : null}
    </>
  );
}
