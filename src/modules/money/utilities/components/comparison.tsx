import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Chip, ProvenanceTag, type Tone } from "@/components/ui/status";
import { daysBetween } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { deleteOfferAction, setDecisionAction } from "../actions";
import type { Comparison, ComparisonRow } from "../server/compare";
import { decimal } from "../server/exact";
import { formatRate, shortDate } from "../server/format";
import type { OfferRow } from "../server/rows";
import {
  BAND_LABELS,
  DECISIONS,
  type Band,
  type Decision,
} from "../server/types";
import { ConfirmButton } from "./confirm-button";

const DECISION: Record<Decision, { label: string; tone: Tone }> = {
  selected: { label: "Selected", tone: "mine" },
  negotiating: { label: "Negotiating", tone: "info" },
  rejected: { label: "Rejected", tone: "neutral" },
};

function euros(cents: number) {
  return formatMoney(cents, "EUR", { wholeUnits: true });
}

function VsRenewal({ cents }: { cents: number | null }) {
  if (cents === null) return <span className="text-muted">—</span>;
  const cheaper = cents >= 100;
  return (
    <span className={cheaper ? "text-ok" : "text-muted"}>
      {cents > 0 ? "−" : cents < 0 ? "+" : ""}
      {euros(Math.abs(cents))}
      <span className="sr-only">
        {cents > 0
          ? " cheaper than renewing"
          : cents < 0
            ? " dearer than renewing"
            : " same as renewing"}
      </span>
    </span>
  );
}

function SupplierCell({ row }: { row: ComparisonRow }) {
  return (
    <>
      <span className="flex flex-wrap items-center gap-1.5">
        <strong
          className={row.status === "ranked" ? "" : "font-semibold text-muted"}
        >
          {row.supplier}
        </strong>
        {row.isCurrentRenewal ? (
          <Chip tone="neutral" dot={false}>
            Current
          </Chip>
        ) : null}
        {row.decision ? (
          <Chip tone={DECISION[row.decision].tone} dot={false}>
            {DECISION[row.decision].label}
          </Chip>
        ) : null}
      </span>
      {row.tariffName ? (
        <span className="block text-xs text-muted">{row.tariffName}</span>
      ) : null}
    </>
  );
}

const STATUS_LABEL: Record<ComparisonRow["status"], string> = {
  ranked: "Ranked",
  excluded: "Excluded supplier",
  not_comparable: "Not comparable",
};

/** Rank · supplier · year 1 · year 2 · vs renewal · includes, as in the prototype; sortable. */
export function ComparisonTable({ comparison }: { comparison: Comparison }) {
  return (
    <DataTable
      label="Offers ranked by first-year cost with your usage"
      prefix="offers"
      searchPlaceholder="Search supplier or tariff"
      minWidth="620px"
      columns={[
        { key: "rank", label: "#" },
        {
          key: "supplier",
          label: "Supplier",
          filter: true,
          filterAll: "All suppliers",
        },
        { key: "year1", label: "Year 1", align: "right" },
        { key: "year2", label: "Year 2", align: "right" },
        { key: "vs", label: "vs renewal", align: "right" },
        {
          key: "status",
          label: "Includes",
          filter: true,
          filterAll: "Any status",
          sortable: false,
        },
      ]}
      rows={comparison.rows.map((row) => ({
        key: row.offerId,
        sort: {
          rank: row.rank,
          supplier: row.supplier,
          year1: row.year1Cents,
          year2: row.year2Cents,
          vs: row.vsRenewalCents,
        },
        filter: { supplier: row.supplier, status: STATUS_LABEL[row.status] },
        search: `${row.supplier} ${row.tariffName ?? ""}`,
        rowClassName: "align-top",
        cells: {
          rank: <span className="num text-muted">{row.rank ?? "—"}</span>,
          supplier: <SupplierCell row={row} />,
          year1:
            row.year1Cents !== null ? (
              <span className="num font-semibold">{euros(row.year1Cents)}</span>
            ) : (
              <span className="text-xs text-muted">{row.reason}</span>
            ),
          year2: (
            <span className="num">
              {row.year2Cents !== null ? euros(row.year2Cents) : "—"}
            </span>
          ),
          vs:
            row.year1Cents !== null ? (
              <span className="num">
                <VsRenewal cents={row.vsRenewalCents} />
              </span>
            ) : (
              "—"
            ),
          status: (
            <span className="text-xs text-muted">
              {row.year1Cents === null
                ? STATUS_LABEL[row.status]
                : row.status === "excluded"
                  ? "Excluded by your preference · shown as your baseline"
                  : row.includes}
            </span>
          ),
        },
      }))}
    />
  );
}

const RATE_BANDS: [Band, keyof OfferRow][] = [
  ["day", "day_rate_cents"],
  ["night", "night_rate_cents"],
  ["peak", "peak_rate_cents"],
  ["standard", "standard_rate_cents"],
  ["gas", "gas_rate_cents"],
];

function ratesLine(offer: OfferRow): string {
  const parts = RATE_BANDS.flatMap(([band, field]) => {
    const value = offer[field] as number | null;
    return value === null
      ? []
      : [`${BAND_LABELS[band]} ${formatRate(decimal(value))}`];
  });
  parts.push(
    `standing ${formatMoney(offer.standing_charge_cents_per_year)}/yr`,
    `VAT ${offer.vat_percent}%`,
  );
  return parts.join(" · ");
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

/** Each offer with its source, how year 1 is worked out, and the household's decision. */
export function OfferList({
  contractId,
  rows,
  offers,
  today,
}: {
  contractId: string;
  rows: ComparisonRow[];
  offers: OfferRow[];
  today: string;
}) {
  const byId = new Map(offers.map((o) => [o.id, o]));
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const offer = byId.get(row.offerId);
        if (!offer) return null;
        const age = daysBetween(offer.checked_on, today);
        return (
          <li key={row.offerId} className="grid gap-2 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <SupplierCell row={row} />
                <p className="num mt-1 text-xs text-muted">
                  {ratesLine(offer)}
                </p>
              </div>
              <div className="flex items-center">
                <Link
                  href={`/money/utilities/${contractId}?offer=${offer.id}#offer-form`}
                  aria-label={`Edit ${offer.supplier} offer`}
                  className="grid size-10 place-items-center rounded-[9px] text-muted hover:text-fg"
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Link>
                <form
                  action={deleteOfferAction.bind(null, contractId, offer.id)}
                >
                  <ConfirmButton
                    message={`Delete the ${offer.supplier} offer?`}
                    label={`Delete ${offer.supplier} offer`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </ConfirmButton>
                </form>
              </div>
            </div>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {offer.source_url ? (
                <a
                  href={offer.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info underline-offset-2 hover:underline"
                >
                  {sourceHost(offer.source_url)}
                </a>
              ) : (
                <Chip tone="review" dot={false}>
                  No source link
                </Chip>
              )}
              <span>checked {shortDate(offer.checked_on)}</span>
              {age > 30 ? (
                <Chip tone="review" dot={false}>
                  {age} days old: check again
                </Chip>
              ) : null}
              <ProvenanceTag source="user" />
            </p>
            {offer.notes ? <p className="text-sm">{offer.notes}</p> : null}
            {row.reason && row.assumptions.length === 0 ? (
              <p className="text-xs text-muted">{row.reason}</p>
            ) : null}
            {row.assumptions.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted">
                  How year 1 is worked out
                </summary>
                <dl className="mt-2 grid max-w-sm grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                  {row.breakdown.map((line) => (
                    <div key={line.label} className="contents">
                      <dt className="text-muted">{line.label}</dt>
                      <dd className="num text-right">
                        {formatMoney(line.cents)}
                      </dd>
                    </div>
                  ))}
                  <dt className="font-semibold">Year 1</dt>
                  <dd className="num text-right font-semibold">
                    {row.year1Cents !== null
                      ? formatMoney(row.year1Cents)
                      : "—"}
                  </dd>
                </dl>
                <ul className="mt-2 grid list-disc gap-1 pl-5 text-muted">
                  {row.assumptions.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-muted">
                  Lines are rounded for display; the total is worked out exactly
                  and rounded once.
                </p>
              </details>
            ) : null}
            <form
              action={setDecisionAction.bind(null, contractId, offer.id)}
              className="flex flex-wrap gap-2"
              aria-label={`Your decision on ${offer.supplier}`}
            >
              {DECISIONS.map((d) => {
                const active = row.decision === d;
                return (
                  <button
                    key={d}
                    type="submit"
                    name="decision"
                    value={active ? "" : d}
                    aria-pressed={active}
                    className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold ${
                      active
                        ? "border-accent bg-accent/15 text-fg"
                        : "border-line text-muted hover:border-muted hover:text-fg"
                    }`}
                  >
                    {DECISION[d].label}
                  </button>
                );
              })}
            </form>
          </li>
        );
      })}
    </ul>
  );
}

/** Global assumptions and usage caveats under the table. */
export function Assumptions({ comparison }: { comparison: Comparison }) {
  return (
    <div className="grid gap-2">
      {comparison.warnings.map((w) => (
        <p
          key={w}
          className="rounded-lg border border-review/40 bg-review/10 px-3 py-2 text-sm"
        >
          {w}
        </p>
      ))}
      <ul className="grid list-disc gap-1 pl-5 text-sm text-muted">
        {comparison.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}
