import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  dateLabel,
  dayLabel,
  euro,
  homesSummary,
  isNewToday,
  place,
  rentFrom,
  type ListingSummary,
  type SortId,
} from "../display";
import { ApplicationChip, ListingStatusChip, NewChip } from "./badges";

const th =
  "border-b border-line px-3 py-2.5 text-left text-[0.72rem] font-semibold tracking-[0.06em] whitespace-nowrap text-muted uppercase";
const td = "border-b border-line px-3 py-[11px] align-middle";

function SortHeader({
  id,
  label,
  sort,
  dir,
  query,
  align = "left",
}: {
  id: SortId;
  label: string;
  sort: SortId;
  dir: "asc" | "desc";
  query: Record<string, string>;
  align?: "left" | "right";
}) {
  const active = sort === id;
  const nextDir = active
    ? dir === "asc"
      ? "desc"
      : "asc"
    : id === "first_seen"
      ? "desc"
      : "asc";
  const params = new URLSearchParams({ ...query, sort: id, dir: nextDir });
  const Icon = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={align === "right" ? `${th} text-right` : th}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={`/housing?${params}`}
        className="inline-flex items-center gap-1 hover:text-fg"
      >
        {label}
        {active ? <Icon aria-hidden="true" className="size-3" /> : null}
      </Link>
    </th>
  );
}

/** Desktop layout (≥1024px): a dense, sortable table. Sorting is done on the server via ?sort=. */
export function ListingsTable({
  listings,
  today,
  sort,
  dir,
  query,
}: {
  listings: ListingSummary[];
  today: string;
  sort: SortId;
  dir: "asc" | "desc";
  query: Record<string, string>;
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.88rem]">
        <thead>
          <tr>
            <SortHeader
              id="title"
              label="Development"
              sort={sort}
              dir={dir}
              query={query}
            />
            <th scope="col" className={th}>
              Area
            </th>
            <th scope="col" className={th}>
              Matching homes
            </th>
            <SortHeader
              id="rent"
              label="Rent from"
              sort={sort}
              dir={dir}
              query={query}
              align="right"
            />
            <th scope="col" className={th}>
              Status
            </th>
            <SortHeader
              id="closes"
              label="Closes"
              sort={sort}
              dir={dir}
              query={query}
            />
            <SortHeader
              id="first_seen"
              label="First seen"
              sort={sort}
              dir={dir}
              query={query}
            />
            <th scope="col" className={th}>
              Your application
            </th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => {
            const rent = rentFrom(listing);
            return (
              <tr
                key={listing.id}
                className="relative hover:bg-fg/4 [&:last-child>td]:border-b-0"
              >
                <td className={td}>
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
                </td>
                <td className={td}>{place(listing)}</td>
                <td className={td}>{homesSummary(listing)}</td>
                <td className={`${td} num text-right font-semibold`}>
                  {rent !== null ? (
                    euro(rent)
                  ) : (
                    <span className="font-normal text-muted">—</span>
                  )}
                </td>
                <td className={td}>
                  <ListingStatusChip listing={listing} today={today} />
                </td>
                <td className={`${td} num whitespace-nowrap`}>
                  {listing.closing_date ? (
                    dateLabel(listing.closing_date, today)
                  ) : (
                    <span className="text-muted">Not stated</span>
                  )}
                </td>
                <td className={`${td} num whitespace-nowrap`}>
                  {dayLabel(listing.first_seen_at, today)}
                </td>
                <td className={td}>
                  <ApplicationChip status={listing.application_status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
