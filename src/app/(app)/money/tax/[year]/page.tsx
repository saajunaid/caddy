import { notFound } from "next/navigation";
import { TaxYearView } from "@/modules/money/tax/components/tax-year-view";
import {
  currentTaxYear,
  isSupportedYear,
  loadTaxYear,
} from "@/modules/money/tax/server/queries";
import { requireHousehold } from "@/server/auth";

export async function generateMetadata({
  params,
}: PageProps<"/money/tax/[year]">) {
  const { year } = await params;
  return { title: `Tax ${year}` };
}

export default async function TaxYearPage({
  params,
}: PageProps<"/money/tax/[year]">) {
  const { year: raw } = await params;
  const year = Number(raw);
  const { profile } = await requireHousehold();
  if (!profile || !/^\d{4}$/.test(raw) || !isSupportedYear(year)) notFound();
  const data = await loadTaxYear(year);
  return <TaxYearView year={year} currentYear={currentTaxYear()} data={data} />;
}
