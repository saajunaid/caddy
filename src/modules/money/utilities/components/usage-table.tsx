import { Trash2 } from "lucide-react";
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

/** Bill periods entered for a contract, newest first. */
export function UsageTable({
  contractId,
  usage,
  bands,
}: {
  contractId: string;
  usage: UsageRow[];
  bands: Band[];
}) {
  const rows = [...usage].sort((a, b) =>
    b.period_start.localeCompare(a.period_start),
  );
  return (
    <div className="relative min-w-0 overflow-x-auto">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <caption className="sr-only">Usage per bill period, in kWh</caption>
        <thead>
          <tr className="border-y border-line text-left text-xs text-muted">
            <th scope="col" className="px-4 py-2 font-semibold">
              Period
            </th>
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Days
            </th>
            {bands.map((band) => (
              <th
                key={band}
                scope="col"
                className="px-2 py-2 text-right font-semibold"
              >
                {BAND_LABELS[band]} kWh
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-right font-semibold">
              Total
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              From
            </th>
            <th scope="col" className="px-2 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="num px-4 py-2 whitespace-nowrap">
                {shortDate(row.period_start)} – {shortDate(row.period_end)}
              </td>
              <td className="num px-2 py-2 text-right">
                {periodDays({
                  periodStart: row.period_start,
                  periodEnd: row.period_end,
                })}
              </td>
              {bands.map((band) => {
                const value = row[FIELD[band]] as number | null;
                return (
                  <td key={band} className="num px-2 py-2 text-right">
                    {value === null ? (
                      <span className="text-muted">—</span>
                    ) : (
                      formatKwh(decimal(value))
                    )}
                  </td>
                );
              })}
              <td className="num px-2 py-2 text-right">
                {row.total_cents === null ? (
                  <span className="text-muted">—</span>
                ) : (
                  formatMoney(row.total_cents)
                )}
              </td>
              <td className="px-2 py-2">
                <ProvenanceTag source="user" />
                {row.source === "bill" ? (
                  <span className="ml-1 text-xs text-muted">bill</span>
                ) : null}
              </td>
              <td className="px-2 py-1 text-right">
                <form action={deleteUsageAction.bind(null, contractId, row.id)}>
                  <ConfirmButton
                    message="Delete this bill period?"
                    label={`Delete bill period from ${shortDate(row.period_start)}`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </ConfirmButton>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
