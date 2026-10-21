import { Landmark } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { TaxYearView } from "@/modules/money/tax/components/tax-year-view";
import {
  currentTaxYear,
  loadTaxYear,
} from "@/modules/money/tax/server/queries";
import { requireHousehold } from "@/server/auth";

export const metadata = { title: "Tax" };

/** The current tax year. Other years live at /money/tax/<year>. */
export default async function TaxPage() {
  const { profile } = await requireHousehold();
  if (!profile) {
    return (
      <EmptyState icon={Landmark} title="Not part of a household yet">
        Ask an adult in your household to add you from Settings.
      </EmptyState>
    );
  }
  const year = currentTaxYear();
  const data = await loadTaxYear(year);
  return <TaxYearView year={year} currentYear={year} data={data} />;
}
