import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ChevronLeft, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip, ProvenanceTag } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import { requireHousehold } from "@/server/auth";
import { daysBetween, dublinDate } from "@/server/domain/dates";
import { formatChecked } from "@/server/domain/relative-time";
import { ApplicationForm } from "@/modules/housing/components/application-form";
import {
  ApplicationChip,
  ListingStatusChip,
  MatchChip,
} from "@/modules/housing/components/badges";
import { Suspense } from "react";
import { DataTable } from "@/components/ui/data-table";
import {
  NearbyPanel,
  NearbyPanelSkeleton,
} from "@/modules/places/components/nearby-panel";
import { listingAnchorKey } from "@/modules/places/server/anchors";
import { btn, link, note } from "@/modules/housing/components/styles";
import {
  dateLabel,
  dayLabel,
  euro,
  place,
  MATCH_BADGE,
  rentFrom,
} from "@/modules/housing/display";
import {
  loadApplication,
  loadListing,
  loadObservations,
  type ListingDetail,
} from "@/modules/housing/queries";
import { unitMatch } from "@/modules/housing/server/matching";
import { parseBedroomsSummary } from "@/modules/housing/server/values";

export const metadata = { title: "Listing" };

// The Nearby tab can run an on-demand lookup (OpenStreetMap is slow).
export const maxDuration = 60;

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "nearby", label: "Nearby" },
  { id: "history", label: "History" },
  { id: "application", label: "Application" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function NotStated() {
  return <span className="text-muted">Not stated</span>;
}

function Overview({
  listing,
  today,
}: {
  listing: ListingDetail;
  today: string;
}) {
  const summary = parseBedroomsSummary(listing.bedrooms_text);
  const summaryAllows = summary.length === 0 || Math.max(...summary) >= 3;
  const days = listing.closing_date
    ? daysBetween(today, listing.closing_date)
    : null;
  const rent = rentFrom(listing);
  return (
    <div className="grid gap-[22px] min-[900px]:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
      <div className="grid content-start gap-3">
        {listing.unit_types.length === 0 ? (
          <Card className="px-4 py-3 text-muted">
            The listing doesn&apos;t say which homes are available.
          </Card>
        ) : (
          <DataTable
            label="Home types"
            prefix="units"
            searchable={false}
            columns={[
              { key: "type", label: "Home type" },
              { key: "rent", label: "Rent / month", align: "right" },
              {
                key: "homes",
                label: "Homes",
                align: "right",
                firstDir: "desc",
              },
              {
                key: "match",
                label: "Match",
                filter: true,
                filterAll: "Any match",
              },
            ]}
            rows={listing.unit_types.map((unit, i) => {
              const level =
                unit.bedrooms === null
                  ? summaryAllows
                    ? "possible"
                    : "none"
                  : unitMatch(unit);
              const matchLabel = MATCH_BADGE[level].label;
              return {
                key: `${unit.label}-${i}`,
                sort: {
                  type: unit.bedrooms ?? unit.label,
                  rent: unit.rent_cents,
                  homes: unit.homes,
                  match: matchLabel,
                },
                filter: { match: matchLabel },
                cells: {
                  type: unit.label,
                  rent:
                    unit.rent_cents !== null ? (
                      <span className="num font-semibold">
                        {euro(unit.rent_cents)}
                      </span>
                    ) : (
                      <NotStated />
                    ),
                  homes:
                    unit.homes !== null ? (
                      <span className="num">{unit.homes}</span>
                    ) : (
                      <NotStated />
                    ),
                  match: <MatchChip level={level} />,
                },
              };
            })}
          />
        )}
        {listing.unit_types_from_summary ? (
          <p className={note}>
            This listing has no table of homes, so these sizes come from its
            &ldquo;Bedrooms&rdquo; summary. Property types and rents aren&apos;t
            stated.
          </p>
        ) : null}
        <p className={note}>
          Rents and home counts are copied exactly from newstarterhomes.ie.
          Unknown values stay unknown until the provider publishes them.
        </p>
      </div>

      <Card className="grid content-start gap-3 p-4">
        <h2 className="text-[1.05rem] font-semibold">Key facts</h2>
        <dl className="grid grid-cols-[minmax(110px,40%)_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[0.9rem] [&>dd]:min-w-0 [&>dt]:text-muted">
          <dt>Status</dt>
          <dd>
            {listing.status_text ?? <NotStated />}{" "}
            <ProvenanceTag source="provider" />
          </dd>
          {listing.opening_date ? (
            <>
              <dt>Applications open</dt>
              <dd>
                <span className="num">
                  {dateLabel(listing.opening_date, today)}
                </span>{" "}
                <ProvenanceTag source="provider" />
              </dd>
            </>
          ) : null}
          <dt>Deadline</dt>
          <dd>
            {listing.closing_date ? (
              <>
                <span className="num">
                  {listing.closing_text ??
                    dateLabel(listing.closing_date, today)}
                </span>
                {days !== null && days >= 0 ? (
                  <span className="text-sm text-muted">
                    {" "}
                    (
                    {days === 0
                      ? "today"
                      : `${days} day${days === 1 ? "" : "s"}`}
                    )
                  </span>
                ) : null}{" "}
                <ProvenanceTag source="provider" />
              </>
            ) : (
              <NotStated />
            )}
          </dd>
          <dt>Provider</dt>
          <dd>{listing.provider ?? <NotStated />}</dd>
          <dt>Location</dt>
          <dd>{place(listing)}</dd>
          <dt>Rent from</dt>
          <dd className="num">
            {rent !== null ? `${euro(rent)} / month` : <NotStated />}
          </dd>
          <dt>Homes available</dt>
          <dd className="num">{listing.total_homes ?? <NotStated />}</dd>
          <dt>Bedrooms</dt>
          <dd>{listing.bedrooms_text ?? <NotStated />}</dd>
          <dt>Listed</dt>
          <dd className="num">
            {listing.listed_on ? (
              dateLabel(listing.listed_on, today)
            ) : (
              <NotStated />
            )}
          </dd>
          <dt>Cost Rental</dt>
          <dd>
            Listed under &ldquo;Properties to Rent&rdquo; on newstarterhomes.ie{" "}
            <ProvenanceTag source="official" />
          </dd>
          <dt>How to apply</dt>
          <dd>
            {listing.apply_url ? (
              <a
                href={listing.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`${link} break-words`}
              >
                Apply on{" "}
                {new URL(listing.apply_url).hostname.replace(/^www\./, "")}
                <ExternalLink
                  aria-hidden="true"
                  className="ml-1 inline size-3"
                />
              </a>
            ) : (
              <span className="text-muted">No application link shown</span>
            )}
          </dd>
        </dl>
        <p className={note}>
          Caddy never applies for you. Applications go through the provider.
        </p>
      </Card>
    </div>
  );
}

async function History({
  listing,
  today,
}: {
  listing: ListingDetail;
  today: string;
}) {
  const observations = await loadObservations(listing.id);
  const now = new Date();
  return (
    <div className="grid gap-3">
      <Card className="divide-y divide-line">
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="w-1 self-stretch rounded bg-line"
          />
          <span className="min-w-0 flex-1">
            Checked {formatChecked(new Date(listing.last_checked_at), now)}
            {observations.length > 0
              ? " · no changes since the last entry"
              : ""}
          </span>
        </div>
        {observations.map((obs, index) => {
          const first = index === observations.length - 1;
          const lines = first
            ? ["First seen on newstarterhomes.ie"]
            : obs.change_summary.length > 0
              ? obs.change_summary
              : ["Listing details updated"];
          return (
            <div key={obs.id} className="flex items-start gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className="w-1 self-stretch rounded"
                style={{ background: first ? "var(--green)" : "var(--yellow)" }}
              />
              <ul className="min-w-0 flex-1">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <span className="num shrink-0 text-sm text-muted">
                {dayLabel(obs.observed_at, today)}
              </span>
            </div>
          );
        })}
      </Card>
      <p className={note}>
        Every change is kept, including when a listing closes. Closed listings
        never disappear.
      </p>
    </div>
  );
}

async function ApplicationTab({
  listing,
  today,
}: {
  listing: ListingDetail;
  today: string;
}) {
  const application = await loadApplication(listing.id);
  const now = new Date();
  return (
    <div className="grid gap-[22px] min-[900px]:grid-cols-[1.35fr_1fr] [&>*]:min-w-0">
      <Card className="grid gap-3 p-4">
        <div>
          <h2 className="text-[1.05rem] font-semibold">Your application</h2>
          <p className="text-sm text-muted">
            Only your household sees this. Daily checks never change this
            section.
          </p>
        </div>
        <ApplicationForm listingId={listing.id} application={application} />
        {application ? (
          <p className="text-sm text-muted">
            Last saved {formatChecked(new Date(application.updated_at), now)}
            {application.updated_by_name
              ? ` by ${application.updated_by_name}`
              : ""}{" "}
            <ProvenanceTag source="user" />
          </p>
        ) : null}
      </Card>
      <Card className="grid content-start gap-3 p-4">
        <h2 className="text-[1.05rem] font-semibold">Provider status</h2>
        <dl className="grid grid-cols-[minmax(110px,40%)_minmax(0,1fr)] gap-x-3.5 gap-y-2 text-[0.9rem] [&>dt]:text-muted">
          <dt>Listing status</dt>
          <dd>
            <ListingStatusChip listing={listing} today={today} />
          </dd>
          <dt>As shown</dt>
          <dd>{listing.status_text ?? <NotStated />}</dd>
        </dl>
        <p className={note}>
          This side comes from the website. Daily checks never change your side
          of this page.
        </p>
      </Card>
    </div>
  );
}

export default async function ListingPage({
  params,
  searchParams,
}: PageProps<"/housing/[id]">) {
  await connection();
  const { profile } = await requireHousehold();
  if (!profile) notFound();
  const { id } = await params;
  const query = await searchParams;
  const tabParam = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab: TabId = TABS.some((t) => t.id === tabParam)
    ? (tabParam as TabId)
    : "overview";

  const listing = await loadListing(id);
  if (!listing) notFound();
  const now = new Date();
  const today = dublinDate(now);

  return (
    <>
      <Link
        href="/housing"
        className={`${link} inline-flex items-center gap-1 text-sm`}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Housing
      </Link>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.6rem] leading-tight font-bold tracking-[-0.01em]">
              {listing.title}
            </h1>
            <p className="text-muted">
              {place(listing)}
              {listing.provider ? ` · ${listing.provider}` : ""}
            </p>
          </div>
          <a
            href={listing.url}
            target="_blank"
            rel="noopener noreferrer"
            className={btn}
          >
            <ExternalLink aria-hidden="true" className="size-4" />
            View on site
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ListingStatusChip listing={listing} today={today} />
          <ApplicationChip status={listing.application_status} />
          {listing.matches !== "none" ? (
            <Chip
              tone={listing.matches === "match" ? "ok" : "review"}
              dot={false}
            >
              {listing.matches === "match"
                ? "Matches your needs"
                : "Possible match"}
            </Chip>
          ) : null}
          <span className="text-sm text-muted">
            Last checked {formatChecked(new Date(listing.last_checked_at), now)}{" "}
            · first seen{" "}
            {dayLabel(listing.first_seen_at, today).replace(
              /^(Today|Yesterday)$/,
              (word) => word.toLowerCase(),
            )}
          </span>
        </div>
        {listing.missing_note ? (
          <p className={note} role="note">
            {listing.missing_note}
          </p>
        ) : null}
      </div>

      <nav
        aria-label="Listing sections"
        className="flex [scrollbar-width:none] gap-1 overflow-x-auto border-b border-line"
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={
              t.id === "overview"
                ? `/housing/${listing.id}`
                : `/housing/${listing.id}?tab=${t.id}`
            }
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "-mb-px flex-none border-b-2 px-3 py-2.5 font-semibold",
              tab === t.id
                ? "border-accent text-fg"
                : "border-transparent text-muted hover:text-fg",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview listing={listing} today={today} /> : null}
      {tab === "nearby" ? (
        <Suspense fallback={<NearbyPanelSkeleton />}>
          <NearbyPanel
            anchor={
              listing.latitude !== null && listing.longitude !== null
                ? {
                    key: listingAnchorKey(listing.id),
                    label: listing.title,
                    latitude: listing.latitude,
                    longitude: listing.longitude,
                  }
                : null
            }
          />
        </Suspense>
      ) : null}
      {tab === "history" ? <History listing={listing} today={today} /> : null}
      {tab === "application" ? (
        <ApplicationTab listing={listing} today={today} />
      ) : null}
    </>
  );
}
