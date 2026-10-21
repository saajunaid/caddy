import Link from "next/link";
import { DataTable, type DataRow } from "@/components/ui/data-table";
import {
  applicationBadge,
  dateLabel,
  dayLabel,
  euro,
  homesSummary,
  isNewToday,
  place,
  rentFrom,
  statusBadge,
  type ListingSummary,
} from "../display";
import { ApplicationChip, ListingStatusChip, NewChip } from "./badges";
import { ListingCard } from "./listing-card";

const MATCH_RANK = { match: 0, possible: 1, none: 2 } as const;

/**
 * Listings with search, county/status/application filters and sortable columns. Phones get the
 * cards, desktops the table; both follow the same search, filters and order.
 */
export function ListingsTable({
  listings,
  today,
}: {
  listings: ListingSummary[];
  today: string;
}) {
  const rows: DataRow[] = listings.map((listing) => {
    const rent = rentFrom(listing);
    const status = statusBadge(listing, today);
    const application = applicationBadge(listing.application_status);
    const county = listing.county ? `Co. ${listing.county}` : null;
    return {
      key: listing.id,
      sort: {
        title: listing.title,
        area: place(listing),
        homes: MATCH_RANK[listing.matches],
        rent,
        status: status.label,
        closes: listing.closing_date,
        first_seen: listing.first_seen_at,
        application: application.label,
      },
      filter: {
        area: county,
        status: status.label.split(" · ")[0],
        application: application.label,
      },
      search: [
        listing.title,
        listing.provider,
        place(listing),
        listing.locality,
        county,
        homesSummary(listing),
        listing.bedrooms_text,
      ]
        .filter(Boolean)
        .join(" "),
      card: <ListingCard listing={listing} today={today} />,
      rowClassName: "relative",
      cells: {
        title: (
          <>
            <Link
              href={`/housing/${listing.id}`}
              className="font-semibold after:absolute after:inset-0 after:content-['']"
            >
              {listing.title}
            </Link>
            {isNewToday(listing, today) ? (
              <span className="ml-1.5">
                <NewChip />
              </span>
            ) : null}
            {listing.provider ? (
              <div className="text-sm text-muted">{listing.provider}</div>
            ) : null}
          </>
        ),
        area: place(listing),
        homes: homesSummary(listing),
        rent:
          rent !== null ? (
            <span className="num font-semibold">{euro(rent)}</span>
          ) : (
            <span className="text-muted">—</span>
          ),
        status: <ListingStatusChip listing={listing} today={today} />,
        closes: listing.closing_date ? (
          <span className="num whitespace-nowrap">
            {dateLabel(listing.closing_date, today)}
          </span>
        ) : (
          <span className="text-muted">Not stated</span>
        ),
        first_seen: (
          <span className="num whitespace-nowrap">
            {dayLabel(listing.first_seen_at, today)}
          </span>
        ),
        application: <ApplicationChip status={listing.application_status} />,
      },
    };
  });

  return (
    <DataTable
      label="Cost Rental listings"
      searchPlaceholder="Search development, provider or area"
      rows={rows}
      columns={[
        { key: "title", label: "Development" },
        { key: "area", label: "Area", filter: true, filterAll: "All counties" },
        { key: "homes", label: "Homes" },
        { key: "rent", label: "Rent from", align: "right" },
        {
          key: "status",
          label: "Status",
          filter: true,
          filterAll: "Any status",
        },
        { key: "closes", label: "Closes" },
        { key: "first_seen", label: "First seen", firstDir: "desc" },
        {
          key: "application",
          label: "Application",
          filter: true,
          filterAll: "Any application",
        },
      ]}
    />
  );
}
