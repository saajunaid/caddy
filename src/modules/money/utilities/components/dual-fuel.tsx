import { Card } from "@/components/ui/card";
import { ProvenanceTag } from "@/components/ui/status";
import { formatMoney } from "@/server/domain/money";
import type { DualFuelResult } from "../server/compare";

function Option({
  label,
  detail,
  cents,
  best,
}: {
  label: string;
  detail: string;
  cents: number | null;
  best: boolean;
}) {
  return (
    <div className="grid gap-0.5 rounded-lg border border-line bg-sunk p-3">
      <span className="label">{label}</span>
      <span className="text-sm">{detail}</span>
      <span className={`num text-lg font-semibold ${best ? "text-ok" : ""}`}>
        {cents === null ? (
          <span className="text-muted">—</span>
        ) : (
          formatMoney(cents)
        )}
        <span className="sr-only">{best ? " (cheaper)" : ""}</span>
      </span>
    </div>
  );
}

/** Best dual fuel offer vs the best separate electricity + gas pair. */
export function DualFuelCard({ result }: { result: DualFuelResult }) {
  const diff = result.differenceCents;
  return (
    <Card className="grid gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[1.05rem] font-semibold">
          Dual fuel or separate suppliers?
        </h2>
        <ProvenanceTag source="estimate" />
      </div>
      <p className={diff === null ? "text-sm text-muted" : "text-sm"}>
        {result.verdict}
      </p>
      {result.separate || result.dual ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Option
            label="Separate · year 1"
            detail={
              result.separate
                ? `${result.separate.electricity.supplier} + ${result.separate.gas.supplier}`
                : "Needs a comparable electricity and gas offer"
            }
            cents={result.separate?.year1Cents ?? null}
            best={diff !== null && diff < 0}
          />
          <Option
            label="Dual fuel · year 1"
            detail={
              result.dual?.supplier ?? "Needs a comparable dual fuel offer"
            }
            cents={result.dual?.year1Cents ?? null}
            best={diff !== null && diff > 0}
          />
        </div>
      ) : null}
      <ul className="grid list-disc gap-1 pl-5 text-xs text-muted">
        {result.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </Card>
  );
}
