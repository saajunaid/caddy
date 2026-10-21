import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProvenanceTag } from "@/components/ui/status";
import { requireHousehold } from "@/server/auth";
import { dublinDate } from "@/server/domain/dates";
import { formatMoney } from "@/server/domain/money";
import { formatWhen } from "@/server/domain/relative-time";
import {
  addUsageAction,
  deleteContractAction,
  saveComparisonAction,
  saveOfferAction,
  updateContractAction,
} from "@/modules/money/utilities/actions";
import {
  Assumptions,
  ComparisonTable,
  OfferList,
} from "@/modules/money/utilities/components/comparison";
import { ConfirmButton } from "@/modules/money/utilities/components/confirm-button";
import { ContractForm } from "@/modules/money/utilities/components/contract-form";
import {
  contractTitle,
  CountdownCard,
} from "@/modules/money/utilities/components/contracts";
import { DualFuelCard } from "@/modules/money/utilities/components/dual-fuel";
import {
  buttonClass,
  inputClass,
} from "@/modules/money/utilities/components/form-bits";
import { OfferForm } from "@/modules/money/utilities/components/offer-form";
import { UsageForm } from "@/modules/money/utilities/components/usage-form";
import { UsageTable } from "@/modules/money/utilities/components/usage-table";
import { loadComparisons, loadUtilities } from "@/modules/money/utilities/data";
import {
  compareDualFuel,
  type ComparisonRow,
} from "@/modules/money/utilities/server/compare";
import {
  offerToInput,
  offerTypesFor,
} from "@/modules/money/utilities/server/forms";
import { comparisonLinks } from "@/modules/money/utilities/server/links";
import {
  asDecision,
  asMeterType,
  asUtilityType,
  contractComparison,
  contractProfile,
  excludedSuppliers,
  householdDualFuel,
  type OfferRow,
} from "@/modules/money/utilities/server/rows";
import {
  BANDS,
  electricityBands,
  isEnergy,
  UTILITY_TYPE_LABELS,
  type Band,
} from "@/modules/money/utilities/server/types";
import {
  annualUsageSentence,
  coverageSentence,
} from "@/modules/money/utilities/server/usage";

export const metadata = { title: "Utility contract" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const USAGE_FIELD = {
  day: "day_kwh",
  night: "night_kwh",
  peak: "peak_kwh",
  standard: "standard_kwh",
  gas: "gas_kwh",
} as const satisfies Record<Band, string>;

/** An offer for another fuel on this contract: listed here, priced in the dual fuel card. */
function elsewhereRow(offer: OfferRow): ComparisonRow {
  return {
    offerId: offer.id,
    supplier: offer.supplier,
    tariffName: offer.tariff_name,
    isCurrentRenewal: offer.is_current_renewal,
    decision: asDecision(offer.decision),
    sourceUrl: offer.source_url,
    checkedOn: offer.checked_on,
    status: "not_comparable",
    rank: null,
    year1Cents: null,
    year2Cents: null,
    vsRenewalCents: null,
    includes: "",
    reason: `${UTILITY_TYPE_LABELS[asUtilityType(offer.utility_type)]} offer: compared in "Dual fuel or separate suppliers?"`,
    assumptions: [],
    breakdown: [],
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Bands the usage form asks for: what the meter records, or every band if unknown. */
function usageBands(
  type: ReturnType<typeof asUtilityType>,
  meter: ReturnType<typeof asMeterType>,
): Band[] {
  const elec =
    meter === "unknown"
      ? (["day", "night", "peak", "standard"] as Band[])
      : electricityBands(meter);
  if (type === "electricity") return elec;
  if (type === "gas") return ["gas"];
  return [...elec, "gas"];
}

function Section({
  id,
  title,
  aside,
  children,
}: {
  id?: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="grid scroll-mt-20 gap-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4">
        <h2 className="text-[1.05rem] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </Card>
  );
}

export default async function ContractPage({
  params,
  searchParams,
}: PageProps<"/money/utilities/[id]">) {
  await connection();
  const { id } = await params;
  const query = await searchParams;
  if (!UUID.test(id)) notFound();
  const { profile } = await requireHousehold();
  if (!profile) notFound();

  const [data, saved] = await Promise.all([
    loadUtilities(),
    loadComparisons(id),
  ]);
  const contract = data.contracts.find((c) => c.id === id);
  if (!contract) notFound();

  const now = new Date();
  const today = dublinDate(now);
  const type = asUtilityType(contract.utility_type);
  const meter = asMeterType(contract.meter_type);
  const energy = isEnergy(type);
  const excluded = excludedSuppliers(data.preferences);
  const switchParam = first(query.switch);
  const switchDate =
    switchParam && ISO.test(switchParam) ? switchParam : contract.contract_end;
  const comparison = contractComparison(
    contract,
    data.usage,
    data.offers,
    excluded,
    switchDate,
  );
  const profileUsage = energy ? contractProfile(contract, data.usage) : null;
  const contractUsage = data.usage.filter((u) => u.contract_id === id);
  const contractOffers = data.offers.filter((o) => o.contract_id === id);
  const otherTypeOffers = contractOffers.filter(
    (o) => o.utility_type !== contract.utility_type,
  );
  const editingId = first(query.offer);
  const editing = contractOffers.find((o) => o.id === editingId);
  const dualInput = energy
    ? householdDualFuel(data.contracts, data.usage, data.offers, excluded)
    : null;
  const tableBands: Band[] = BANDS.filter((band) =>
    contractUsage.some((u) => u[USAGE_FIELD[band]] !== null),
  );
  const links = comparisonLinks(type);
  const title = contractTitle(contract);

  return (
    <>
      <div className="grid gap-1">
        <Link
          href="/money/utilities"
          className="inline-flex items-center gap-1 text-sm text-info hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Utilities
        </Link>
      </div>

      <CountdownCard contract={contract} today={today} link={false} />

      <Section
        id="comparison"
        title="First-year cost with your usage"
        aside={<ProvenanceTag source="estimate" />}
      >
        <div className="grid gap-1 px-4">
          {profileUsage && profileUsage.bands.length > 0 ? (
            <p className="text-sm text-muted">
              {annualUsageSentence(profileUsage)} ·{" "}
              {coverageSentence(profileUsage)}
            </p>
          ) : null}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="text-muted">Find offers on</span>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-info hover:underline"
              >
                {link.label}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            ))}
            <a href="#offer-form" className="text-info hover:underline">
              Add offer
            </a>
          </p>
        </div>

        {comparison.blocked ? (
          <p className="mx-4 rounded-lg border border-review/40 bg-review/10 px-3 py-2 text-sm">
            {comparison.blocked}
          </p>
        ) : null}

        {comparison.rows.length > 0 ? (
          <ComparisonTable comparison={comparison} />
        ) : (
          <p className="px-4 text-sm text-muted">
            No offers yet. Look up two to five offers on the sites above, then
            add each one below with its rates, discount, cashback and the page
            you copied it from.
          </p>
        )}

        <div className="grid gap-3 px-4">
          {comparison.rows.length > 0 ? (
            <p className="text-sm text-muted">
              {comparison.estimateLabel}. Includes standing charge and VAT.
              Prices entered by you <ProvenanceTag source="user" />.{" "}
              <strong className="text-fg">
                Caddy never switches supplier for you.
              </strong>
            </p>
          ) : null}
          <Assumptions comparison={comparison} />
          {otherTypeOffers.length > 0 ? (
            <p className="text-xs text-muted">
              {otherTypeOffers.length} offer
              {otherTypeOffers.length === 1 ? " covers" : "s cover"} a different
              fuel and {otherTypeOffers.length === 1 ? "is" : "are"} compared in
              &ldquo;Dual fuel or separate suppliers?&rdquo;.
            </p>
          ) : null}
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <label htmlFor="switch" className="text-sm font-semibold">
                Assumed switch date
              </label>
              <input
                id="switch"
                name="switch"
                type="date"
                defaultValue={switchDate ?? ""}
                className={`${inputClass} w-auto`}
              />
            </div>
            <button type="submit" className={buttonClass}>
              Recalculate
            </button>
          </form>
          <p className="text-xs text-muted">
            Switching before the contract ends adds the exit fee you entered to
            year 1.
          </p>
        </div>
      </Section>

      {dualInput ? <DualFuelCard result={compareDualFuel(dualInput)} /> : null}

      <Section id="offers" title="Offers">
        {comparison.rows.length + otherTypeOffers.length > 0 ? (
          <div className="border-t border-line">
            <OfferList
              contractId={id}
              rows={[
                ...comparison.rows,
                ...otherTypeOffers.map((o) => elsewhereRow(o)),
              ]}
              offers={contractOffers}
              today={today}
            />
          </div>
        ) : null}
        <div
          id="offer-form"
          className="grid scroll-mt-20 gap-3 border-t border-line px-4 pt-4"
        >
          <h3 className="font-semibold">
            {editing ? `Edit ${editing.supplier}` : "Add an offer"}
          </h3>
          <OfferForm
            key={editing?.id ?? "new"}
            action={saveOfferAction.bind(null, id, editing?.id ?? null)}
            offerTypes={offerTypesFor(type)}
            initial={editing ? offerToInput(editing) : undefined}
            today={today}
            cancelHref={editing ? `/money/utilities/${id}#offers` : undefined}
          />
        </div>
      </Section>

      {energy ? (
        <Section id="usage" title="Usage from your bills">
          {contractUsage.length > 0 ? (
            <UsageTable
              contractId={id}
              usage={contractUsage}
              bands={tableBands}
            />
          ) : (
            <p className="px-4 text-sm text-muted">
              No bill periods yet. Add the kWh from each bill; a year of bills
              gives the fairest comparison. Caddy never fills gaps with national
              averages.
            </p>
          )}
          <div className="border-t border-line px-4 pt-4">
            <UsageForm
              action={addUsageAction.bind(null, id)}
              bands={usageBands(type, meter)}
            />
          </div>
        </Section>
      ) : null}

      <Section id="snapshots" title="Saved comparisons">
        <div className="grid gap-3 px-4">
          {saved.length > 0 ? (
            <ul className="divide-y divide-line">
              {saved.map((s) => {
                const results = s.results as {
                  bestOfferId?: string | null;
                  rows?: {
                    offerId: string;
                    supplier: string;
                    year1Cents: number | null;
                    vsRenewalCents: number | null;
                  }[];
                } | null;
                const best = results?.rows?.find(
                  (r) => r.offerId === results.bestOfferId,
                );
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm"
                  >
                    <span>
                      {formatWhen(new Date(s.created_at), now)} ·{" "}
                      {s.trigger === "due" ? "14-day reminder" : "Saved by you"}
                    </span>
                    <span className="text-muted">
                      {best && best.year1Cents !== null
                        ? `Best: ${best.supplier} ${formatMoney(best.year1Cents)}${
                            best.vsRenewalCents !== null &&
                            best.vsRenewalCents > 0
                              ? ` · ${formatMoney(best.vsRenewalCents)} less than renewing`
                              : ""
                          }`
                        : "No ranked offer"}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              None yet. The 14-day reminder saves one automatically when offers
              exist; save one yourself to check expected savings against later
              bills.
            </p>
          )}
          <form
            action={saveComparisonAction.bind(null, id, switchDate ?? null)}
          >
            <button
              type="submit"
              className={buttonClass}
              disabled={comparison.rows.length === 0}
            >
              Save this comparison
            </button>
          </form>
        </div>
      </Section>

      <Section id="contract" title="Contract details">
        <div className="grid gap-4 px-4">
          <ContractForm
            action={updateContractAction.bind(null, id)}
            submitLabel="Save contract"
            showStatus
            initial={{
              utility_type: contract.utility_type,
              supplier: contract.supplier,
              tariff_name: contract.tariff_name ?? "",
              account_label: contract.account_label ?? "",
              meter_type: contract.meter_type,
              contract_start: contract.contract_start ?? "",
              contract_end: contract.contract_end ?? "",
              status: contract.status,
              notes: contract.notes ?? "",
            }}
          />
          <form
            action={deleteContractAction.bind(null, id)}
            className="border-t border-line pt-3"
          >
            <ConfirmButton
              message={`Delete ${title} with its usage and offers? This can't be undone.`}
              className="px-0"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              Delete contract
            </ConfirmButton>
          </form>
        </div>
      </Section>
    </>
  );
}
