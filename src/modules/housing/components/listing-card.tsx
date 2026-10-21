import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  euro,
  homesSummary,
  isNewToday,
  place,
  rentFrom,
  type ListingSummary,
} from "../display";
import { ApplicationChip, ListingStatusChip, NewChip } from "./badges";

/** Phone layout: one card per listing (prototype "listing-card"). */
export function ListingCard({
  listing,
  today,
}: {
  listing: ListingSummary;
  today: string;
}) {
  const rent = rentFrom(listing);
  return (
    <Card className="grid gap-2.5 px-4 py-3.5 hover:border-muted">
      <Link href={`/housing/${listing.id}`} className="grid gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[0.95rem] font-semibold">
              {listing.title}
              {isNewToday(listing, today) ? (
                <span className="ml-1.5 align-middle">
                  <NewChip />
                </span>
              ) : null}
            </h3>
            <p className="text-sm text-muted">
              {place(listing)}
              {listing.provider ? ` · ${listing.provider}` : ""}
            </p>
          </div>
          {rent !== null ? (
            <div className="shrink-0 text-right">
              <div className="num font-semibold">{euro(rent)}</div>
              <div className="text-xs text-muted">/month from</div>
            </div>
          ) : (
            <div className="shrink-0 text-right text-sm text-muted">
              Rent not stated
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ListingStatusChip listing={listing} today={today} />
          <ApplicationChip status={listing.application_status} />
          <span className="text-sm text-muted">{homesSummary(listing)}</span>
        </div>
      </Link>
    </Card>
  );
}
