import { Trash2 } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { ProvenanceTag } from "@/components/ui/status";
import { formatMoney } from "@/server/domain/money";
import { deleteUsageAction } from "../actions";
import { decimal } from "../server/exact";
import { formatKwh, shortDate } from "../server/format";
import type { UsageRow } from "../server/rows";
import { BAND_LABELS, type Band } from "../server/types";
import { periodDays } from "../server/usage";
import { ConfirmButton } from "./confirm-button";

const FIELD: Record<Band, keyof UsageRow> = {
  day: "day_kwh",
  night: "night_kwh",
  peak: "peak_kwh",
  standard: "standard_kwh",
  gas: "gas_kwh",
};

/** Bill periods entered for a contract, newest first by default; every column sorts. */
export function UsageTable({
  contractId,
  usage,
  bands,
}: {
  contractId: string;
  usage: UsageRow[];
  bands: Band[];
}) {
  const num = (v: unknown) =>
    v === null || v === undefined ? null : Number(v);
  return (
    <DataTable
      label="Usage per bill period, in kWh"
      prefix="usage"
      searchable={false}
      minWidth="480px"
      defaultSort={{ column: "period", dir: "desc" }}
      columns={[
        { key: "period", label: "Period", firstDir: "desc" },
        { key: "days", label: "Days", align: "right" },
        ...bands.map((band) => ({
          key: band,
          label: `${BAND_LABELS[band]} kWh`,
          align: "right" as const,
        })),
        { key: "total", label: "Total", align: "right" },
        { key: "from", label: "From", filter: true, filterAll: "Any source" },
        {
          key: "actions",
          label: "Actions",
          sortable: false,
          headerClassName: "sr-only",
        },
      ]}
      rows={usage.map((row) => {
        const days = periodDays({
          periodStart: row.period_start,
          periodEnd: row.period_end,
        });
        const from = row.source === "bill" ? "From a bill" : "Typed in";
        return {
          key: row.id,
          sort: {
            period: row.period_start,
            days,
            total: row.total_cents,
            from,
            ...Object.fromEntries(
              bands.map((band) => [band, num(row[FIELD[band]])]),
            ),
          },
          filter: { from },
          cells: {
            period: (
              <span className="num whitespace-nowrap">
                {shortDate(row.period_start)} – {shortDate(row.period_end)}
              </span>
            ),
            days: <span className="num">{days}</span>,
            ...Object.fromEntries(
              bands.map((band) => {
                const value = row[FIELD[band]] as number | null;
                return [
                  band,
                  value === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="num">{formatKwh(decimal(value))}</span>
                  ),
                ];
              }),
            ),
            total:
              row.total_cents === null ? (
                <span className="text-muted">—</span>
              ) : (
                <span className="num">{formatMoney(row.total_cents)}</span>
              ),
            from: (
              <>
                <ProvenanceTag source="user" />
                {row.source === "bill" ? (
                  <span className="ml-1 text-xs text-muted">bill</span>
                ) : null}
              </>
            ),
            actions: (
              <form action={deleteUsageAction.bind(null, contractId, row.id)}>
                <ConfirmButton
                  message="Delete this bill period?"
                  label={`Delete bill period from ${shortDate(row.period_start)}`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </ConfirmButton>
              </form>
            ),
          },
        };
      })}
    />
  );
}
