import Link from "next/link";
import { connection } from "next/server";
import { Building2, SearchX } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireHousehold } from "@/server/auth";
import { addDays, dublinDate } from "@/server/domain/dates";
import { FilterBar } from "@/modules/housing/components/filter-bar";
import { Freshness } from "@/modules/housing/components/freshness";
import { ListingsTable } from "@/modules/housing/components/listings-table";
import { NewsPanel } from "@/modules/housing/components/news-panel";
import { btn, note } from "@/modules/housing/components/styles";
import {
  FILTERS,
  inFilter,
  parseFilter,
  sortListings,
  type FilterId,
} from "@/modules/housing/display";
import { latestRun, loadListings, loadNews } from "@/modules/housing/queries";
import { MATCH_RULE_TEXT } from "@/modules/housing/server/matching";

export const metadata = { title: "Housing" };

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HousingPage({
  searchParams,
}: PageProps<"/housing">) {
  await connection();
  const { profile } = await requireHousehold();
  const params = await searchParams;
  const now = new Date();
  const today = dublinDate(now);

  if (!profile) {
    return (
      <>
        <PageHeader eyebrow="Cost Rental Watch" title="Housing" />
        <EmptyState icon={Building2} title="Your account isn't linked yet">
          An adult in your household can add you from Settings.
        </EmptyState>
      </>
    );
  }

  const [listings, run, news, newsRun] = await Promise.all([
    loadListings(),
    latestRun("housing-daily"),
    loadNews(addDays(today, -30)),
    latestRun("housing-news"),
  ]);

  const filter = parseFilter(one(params.filter));
  const counts = Object.fromEntries(
    FILTERS.map((f) => [
      f.id,
      listings.filter((l) => inFilter(l, f.id, today)).length,
    ]),
  ) as Record<FilterId, number>;
  // Newest first by default; the table lets you search, filter and re-sort.
  const shown = sortListings(
    listings.filter((l) => inFilter(l, filter, today)),
    "first_seen",
    "desc",
  );

  return (
    <>
      <PageHeader
        eyebrow="Cost Rental Watch"
        title="Housing"
        actions={
          <Link href="/housing/pipeline" className={btn}>
            Limerick pipeline
          </Link>
        }
      />
      <Freshness run={run} now={now} />
      <p className={note}>{MATCH_RULE_TEXT} Alerts cover all of Ireland.</p>

      {listings.length === 0 ? (
        <EmptyState icon={Building2} title="No listings yet">
          Every morning Caddy checks every Cost Rental listing on
          newstarterhomes.ie, keeps its history, and alerts you about 3-bed
          houses and 4-bed homes. Listings appear here after the first check.
        </EmptyState>
      ) : (
        <>
          <FilterBar filter={filter} counts={counts} />
          {shown.length === 0 ? (
            <EmptyState icon={SearchX} title="Nothing here right now">
              {filter === "matches"
                ? "No open listing matches today. Caddy keeps checking every morning and will alert you as soon as one appears."
                : "No listings fit this filter. Try “All”."}
            </EmptyState>
          ) : (
            <ListingsTable listings={shown} today={today} />
          )}
        </>
      )}

      <NewsPanel items={news} run={newsRun} now={now} today={today} />
    </>
  );
}
