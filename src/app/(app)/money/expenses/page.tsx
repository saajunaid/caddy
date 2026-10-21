import Link from "next/link";
import { ChevronLeft, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_CATEGORY_LABELS,
  isExpenseCategory,
  PAYMENT_STATUS_LABELS,
  isPaymentStatus,
} from "@/modules/money/documents/categories";
import { monthLabel, monthlyTotals } from "@/modules/money/documents/expenses";
import { formatDate } from "@/modules/money/documents/review";
import { listExpenses } from "@/modules/money/documents/server/queries";
import { link, sectionTitle } from "@/modules/money/ui";
import { requireHousehold } from "@/server/auth";
import { formatMoney } from "@/server/domain/money";

export const metadata = { title: "Household spending" };

const categoryLabel = (c: string) =>
  isExpenseCategory(c) ? EXPENSE_CATEGORY_LABELS[c] : c;
const paidLabel = (s: string) =>
  isPaymentStatus(s) ? PAYMENT_STATUS_LABELS[s] : s;

export default async function ExpensesPage({
  searchParams,
}: PageProps<"/money/expenses">) {
  const { profile } = await requireHousehold();
  const params = await searchParams;
  const requested =
    typeof params.category === "string" ? params.category : null;
  const category = requested && isExpenseCategory(requested) ? requested : null;
  const expenses = profile ? await listExpenses(category) : [];
  const totals = monthlyTotals(expenses);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <Link
            href="/money"
            className={`${link} inline-flex w-fit items-center gap-1 text-sm`}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Bills
          </Link>
          <h2 className="text-[1.35rem] leading-tight font-bold">
            Household spending
          </h2>
        </div>
      </div>

      <nav
        aria-label="Filter by category"
        className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-0.5"
      >
        {[null, ...EXPENSE_CATEGORIES].map((c) => {
          const active = c === category;
          return (
            <Link
              key={c ?? "all"}
              href={c ? `/money/expenses?category=${c}` : "/money/expenses"}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex-none rounded-full border px-3 py-1.5 text-sm font-medium",
                active
                  ? "border-fg bg-fg text-bg"
                  : "border-line text-fg hover:border-muted",
              )}
            >
              {c ? categoryLabel(c) : "All"}
            </Link>
          );
        })}
      </nav>

      {expenses.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={category ? "Nothing in this category" : "No spending yet"}
        >
          Spending appears here when you confirm a bill or receipt and tick
          &ldquo;Household spending&rdquo;.{" "}
          <Link href="/money" className={link}>
            Add a bill
          </Link>
        </EmptyState>
      ) : (
        <div className="grid gap-[22px] lg:grid-cols-[minmax(0,1fr)_280px] [&>*]:min-w-0">
          <section
            aria-labelledby="expense-list"
            className="grid content-start gap-2.5"
          >
            <h3 id="expense-list" className={sectionTitle}>
              {category ? categoryLabel(category) : "All spending"}
            </h3>
            <DataTable
              label="Household spending"
              searchPlaceholder="Search merchant or category"
              minWidth="640px"
              defaultSort={{ column: "date", dir: "desc" }}
              columns={[
                { key: "date", label: "Date", firstDir: "desc" },
                { key: "merchant", label: "Merchant" },
                {
                  key: "category",
                  label: "Category",
                  filter: true,
                  filterAll: "All categories",
                },
                {
                  key: "amount",
                  label: "Amount",
                  align: "right",
                  firstDir: "desc",
                },
                {
                  key: "paid",
                  label: "Paid",
                  filter: true,
                  filterAll: "Paid or not",
                },
                { key: "bill", label: "Bill", sortable: false },
              ]}
              rows={expenses.map((e) => ({
                key: e.id,
                sort: {
                  date: e.expenseDate,
                  merchant: e.merchant,
                  category: categoryLabel(e.category),
                  amount: e.amountCents,
                  paid: paidLabel(e.paymentStatus),
                },
                filter: {
                  category: categoryLabel(e.category),
                  paid: paidLabel(e.paymentStatus),
                },
                search: `${e.merchant} ${categoryLabel(e.category)}`,
                card: (
                  <Card className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {e.merchant}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {formatDate(e.expenseDate)} ·{" "}
                        {categoryLabel(e.category)}
                      </span>
                    </span>
                    <span className="num shrink-0 font-semibold">
                      {formatMoney(e.amountCents, e.currency)}
                    </span>
                    {e.documentId ? (
                      <Link
                        href={`/money/bills/${e.documentId}`}
                        className={`${link} shrink-0 text-sm`}
                      >
                        Bill
                      </Link>
                    ) : null}
                  </Card>
                ),
                cells: {
                  date: (
                    <span className="num whitespace-nowrap">
                      {formatDate(e.expenseDate)}
                    </span>
                  ),
                  merchant: <span className="font-semibold">{e.merchant}</span>,
                  category: categoryLabel(e.category),
                  amount: (
                    <span className="num font-semibold">
                      {formatMoney(e.amountCents, e.currency)}
                    </span>
                  ),
                  paid:
                    e.paymentStatus === "paid" ? (
                      <Chip tone="ok">Paid</Chip>
                    ) : e.paymentStatus === "unpaid" ? (
                      <Chip tone="due">Not paid</Chip>
                    ) : (
                      <span className="text-muted">
                        {paidLabel(e.paymentStatus)}
                      </span>
                    ),
                  bill: e.documentId ? (
                    <Link
                      href={`/money/bills/${e.documentId}`}
                      className={link}
                    >
                      Bill
                    </Link>
                  ) : null,
                },
              }))}
            />
          </section>

          <section
            aria-labelledby="monthly-totals"
            className="grid content-start gap-2.5"
          >
            <h3 id="monthly-totals" className={sectionTitle}>
              By month
            </h3>
            <Card className="divide-y divide-line">
              {totals.map((t) => (
                <div
                  key={`${t.month}-${t.currency}`}
                  className="flex items-baseline justify-between gap-3 px-4 py-2.5"
                >
                  <span>
                    {monthLabel(t.month)}
                    <span className="ml-1.5 text-sm text-muted">
                      {t.count} item{t.count === 1 ? "" : "s"}
                    </span>
                  </span>
                  <span className="num font-semibold">
                    {formatMoney(t.totalCents, t.currency)}
                  </span>
                </div>
              ))}
            </Card>
          </section>
        </div>
      )}
    </>
  );
}
