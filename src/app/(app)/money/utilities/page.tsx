import Link from "next/link";
import { connection } from "next/server";
import { Plus, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Chip } from "@/components/ui/status";
import { jobStatus } from "@/components/jobs/job-list";
import { requireHousehold } from "@/server/auth";
import { dublinDate } from "@/server/domain/dates";
import { formatChecked } from "@/server/domain/relative-time";
import {
  ContractList,
  CountdownCard,
} from "@/modules/money/utilities/components/contracts";
import { DualFuelCard } from "@/modules/money/utilities/components/dual-fuel";
import { Exclusions } from "@/modules/money/utilities/components/exclusions";
import { primaryButtonClass } from "@/modules/money/utilities/components/form-bits";
import { loadUtilities } from "@/modules/money/utilities/data";
import { compareDualFuel } from "@/modules/money/utilities/server/compare";
import {
  excludedSuppliers,
  householdDualFuel,
} from "@/modules/money/utilities/server/rows";
import { mostUrgent } from "@/modules/money/utilities/server/view";

export const metadata = { title: "Utilities" };

export default async function UtilitiesPage() {
  await connection(); // "Today" must be the current Dublin date.
  const { profile } = await requireHousehold();
  if (!profile) {
    return (
      <EmptyState icon={Zap} title="Your account isn't linked yet">
        An adult in your household can add you from Settings.
      </EmptyState>
    );
  }
  const data = await loadUtilities();
  const now = new Date();
  const today = dublinDate(now);
  const excluded = excludedSuppliers(data.preferences);
  const urgent = mostUrgent(data.contracts, today);
  const others = data.contracts.filter((c) => c.id !== urgent?.id);
  const dualInput = householdDualFuel(
    data.contracts,
    data.usage,
    data.offers,
    excluded,
  );
  const lastCheck = data.lastCheck;
  const check = lastCheck ? jobStatus(lastCheck.status) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.25rem] leading-tight font-bold">Utilities</h2>
          <p className="text-sm text-muted">
            Contracts, a reminder 14 days before each one ends, and offers
            priced with your own usage.
          </p>
        </div>
        {data.contracts.length > 0 ? (
          <Link href="/money/utilities/new" className={primaryButtonClass}>
            <Plus aria-hidden="true" className="size-4" />
            Add contract
          </Link>
        ) : null}
      </div>

      {data.contracts.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No contracts yet"
          footer={
            <Link href="/money/utilities/new" className={primaryButtonClass}>
              <Plus aria-hidden="true" className="size-4" />
              Add your first contract
            </Link>
          }
        >
          Add your electricity, gas, broadband or other contracts with their end
          dates. Caddy reminds you exactly 14 days before each one ends, never
          monthly, and prices the offers you find with your own bills.
        </EmptyState>
      ) : (
        <>
          {urgent ? <CountdownCard contract={urgent} today={today} /> : null}
          {others.length > 0 ? (
            <section className="grid gap-2.5" aria-label="Other contracts">
              {urgent ? (
                <h2 className="text-[1.05rem] font-semibold">
                  Other contracts
                </h2>
              ) : null}
              <ContractList contracts={others} today={today} />
            </section>
          ) : null}
          {dualInput ? (
            <DualFuelCard result={compareDualFuel(dualInput)} />
          ) : null}
        </>
      )}

      <div className="grid gap-[22px] lg:grid-cols-2 [&>*]:min-w-0">
        <Card className="grid content-start gap-3 p-4">
          <h2 className="text-[1.05rem] font-semibold">Excluded suppliers</h2>
          <p className="text-sm text-muted">
            Shown in comparisons as &ldquo;Excluded by your preference&rdquo;,
            never ranked or recommended.
          </p>
          <Exclusions suppliers={excluded} />
        </Card>
        <Card className="grid content-start gap-2 p-4">
          <h2 className="text-[1.05rem] font-semibold">Reminder check</h2>
          {lastCheck && check ? (
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-muted">
                Last run {formatChecked(lastCheck.startedAt, now)}
                {lastCheck.summary ? ` · ${lastCheck.summary}` : ""}
                {lastCheck.error ? (
                  <span className="block text-bad">{lastCheck.error}</span>
                ) : null}
              </p>
              <Chip tone={check.tone}>{check.label}</Chip>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Not run yet. The daily check runs each morning and alerts you once
              per contract, 14 days before it ends.
            </p>
          )}
          <p className="text-xs text-muted">
            Caddy never switches supplier for you. It tells you when to look,
            and does the sums.
          </p>
        </Card>
      </div>
    </>
  );
}
