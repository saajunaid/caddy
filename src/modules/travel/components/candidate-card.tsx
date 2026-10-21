import Link from "next/link";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Chip, ProvenanceTag } from "@/components/ui/status";
import { cn } from "@/lib/utils";
import {
  formatEur,
  formatMinor,
  formatShortDate,
  trimRate,
} from "../server/currency";
import {
  BOARD_LABELS,
  formatDateRange,
  formatDuration,
  KIND_LABELS,
  type CandidateStatus,
} from "../server/labels";
import type { RankedCandidate } from "../server/ranking";
import {
  budgetText,
  estimateShare,
  type ComponentLine,
} from "../server/totals";
import type { Party } from "../server/travellers";
import { SearchLinks } from "./search-links";
import { StatusButtons } from "./status-buttons";
import { linkClass, smallButtonClass } from "./ui";

export type CandidateExtras = {
  destinationAirport: string | null;
  destinationCountry: string | null;
  departureAirport: string;
  notes: string | null;
  tradeOffs: string | null;
};

const STATUS_CHIP: Partial<
  Record<CandidateStatus, { tone: "mine" | "ok" | "bad"; label: string }>
> = {
  shortlisted: { tone: "mine", label: "Shortlisted" },
  booked: { tone: "ok", label: "Booked by you" },
  rejected: { tone: "bad", label: "Rejected" },
};

function details(line: ComponentLine): string[] {
  const c = line.component;
  const out: string[] = [];
  if (c.kind === "flight") {
    if (c.stops !== null)
      out.push(
        c.stops === 0 ? "Direct" : `${c.stops} stop${c.stops === 1 ? "" : "s"}`,
      );
    if (c.durationMinutes !== null) out.push(formatDuration(c.durationMinutes));
  }
  if (c.kind === "accommodation") {
    if (c.boardBasis) out.push(BOARD_LABELS[c.boardBasis]);
    if (c.freeCancellation === true) out.push("Free cancellation");
    if (c.freeCancellation === false) out.push("Non-refundable");
  }
  return out;
}

function ComponentRow({
  line,
  editHref,
}: {
  line: ComponentLine;
  editHref: string;
}) {
  const c = line.component;
  const extra = details(line);
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 border-t border-dashed border-line py-2 text-[0.84rem]">
      <div className="min-w-0">
        <span className="font-medium">
          {KIND_LABELS[c.kind]}
          {c.provider ? ` · ${c.provider}` : ""}
        </span>{" "}
        <ProvenanceTag source={c.isEstimate ? "estimate" : "user"} />
        {c.description ? (
          <div className="text-[0.8rem] text-muted">{c.description}</div>
        ) : null}
        {extra.length > 0 ? (
          <div className="text-[0.8rem] text-muted">{extra.join(" · ")}</div>
        ) : null}
        {c.includes ? (
          <div className="text-[0.8rem] text-muted">Includes: {c.includes}</div>
        ) : null}
        {c.excludes ? (
          <div className="text-[0.8rem] text-muted">Excludes: {c.excludes}</div>
        ) : null}
        {c.cancellationTerms ? (
          <div className="text-[0.8rem] text-muted">
            Cancellation: {c.cancellationTerms}
          </div>
        ) : null}
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[0.8rem]">
          <span className="text-muted">
            checked {formatShortDate(line.checkedOn)}
          </span>
          {c.bookingUrl ? (
            <a
              href={c.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(linkClass, "inline-flex items-center gap-1")}
            >
              Open offer
              <ExternalLink aria-hidden="true" className="size-3" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          <Link href={editHref} className={linkClass}>
            Edit<span className="sr-only"> {KIND_LABELS[c.kind]} price</span>
          </Link>
        </div>
      </div>
      <div className="text-right">
        {line.eurCents !== null ? (
          <div className="num">{formatEur(line.eurCents)}</div>
        ) : (
          <div className="num text-review">
            {formatMinor(c.priceMinor, c.currency)}
          </div>
        )}
        {c.currency !== "EUR" && line.rate ? (
          <div className="num text-[0.75rem] text-muted">
            {formatMinor(c.priceMinor, c.currency)}
            <br />
            at ECB {formatShortDate(line.rate.rateDate)} (
            {trimRate(line.rate.rate)})
          </div>
        ) : null}
      </div>
      {line.problem ? (
        <p className="col-span-2 text-[0.8rem] text-review">{line.problem}</p>
      ) : null}
    </li>
  );
}

export function CandidateCard({
  entry,
  extras,
  tripId,
  party,
  rankLabel,
}: {
  entry: RankedCandidate;
  extras: CandidateExtras;
  tripId: string;
  party: Party;
  rankLabel: string;
}) {
  const { candidate, checks, score, tradeOffs, gaps } = entry;
  const total = candidate.total;
  const chip = STATUS_CHIP[candidate.status];
  const failures = checks.filter((c) => c.status === "fail");
  const unknowns = checks.filter(
    (c) => c.status === "unknown" && !gaps.includes(c.message),
  );
  const share = estimateShare(total);
  const board = candidate.components.find(
    (c) => c.kind === "accommodation" && c.boardBasis,
  )?.boardBasis;
  const base = `/travel/${tripId}/candidates/${candidate.id}`;
  const priced = candidate.components.length > 0;

  return (
    <article
      id={`option-${candidate.id}`}
      className={cn(
        "grid scroll-mt-20 content-start gap-3 rounded-[10px] border bg-surface p-4 shadow-sm",
        candidate.status === "shortlisted" ? "border-mine/60" : "border-line",
      )}
      aria-labelledby={`option-${candidate.id}-title`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "num text-xs",
            failures.length > 0 ? "text-bad" : "text-muted",
          )}
        >
          {rankLabel}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {chip ? (
            <Chip tone={chip.tone} dot={false}>
              {chip.label}
            </Chip>
          ) : null}
          {total.oldestCheck ? (
            <span className="text-xs text-muted">
              checked {formatShortDate(total.oldestCheck)}
            </span>
          ) : null}
        </span>
      </div>

      <div>
        <h2
          id={`option-${candidate.id}-title`}
          className="text-[1.05rem] font-semibold"
        >
          {candidate.destination}
        </h2>
        <p className="text-sm text-muted">
          {[
            board ? BOARD_LABELS[board] : null,
            `${candidate.nights} nights`,
            formatDateRange(candidate.outboundDate, candidate.returnDate),
            `from ${extras.departureAirport}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {priced && total.converted === 0 ? (
        <p className="text-sm text-review">
          Can&apos;t total yet: none of these prices can be converted to euro.
        </p>
      ) : priced ? (
        <div>
          <div className="num text-2xl font-semibold">
            {formatEur(total.totalCents)}
            {!total.complete ? (
              <span className="ml-1 align-middle text-xs font-normal text-review">
                + unconverted
              </span>
            ) : null}
          </div>
          <p className="text-sm text-muted">
            {total.perPersonCents !== null
              ? `${total.complete ? "" : "at least "}${formatEur(total.perPersonCents)} per person`
              : "Add travellers for a per-person cost"}
            {total.budget ? (
              <>
                {" · "}
                <span
                  className={
                    total.budget.status === "within" ? "text-ok" : "text-due"
                  }
                >
                  {budgetText(total.budget)}
                </span>
              </>
            ) : null}
          </p>
          {share ? <p className="text-sm text-review">{share}</p> : null}
        </div>
      ) : (
        <p className="text-sm text-muted">
          No prices yet. Add the flights, stay and extras you found.
        </p>
      )}

      {failures.length + unknowns.length + gaps.length > 0 ? (
        <ul className="grid gap-1 text-sm">
          {failures.map((c) => (
            <li key={c.key} className="text-bad">
              ✕ {c.message}
            </li>
          ))}
          {unknowns.map((c) => (
            <li key={c.key} className="text-review">
              ? {c.message}
            </li>
          ))}
          {gaps.map((g) => (
            <li key={g} className="text-review">
              ! {g}
            </li>
          ))}
        </ul>
      ) : null}

      {priced ? (
        <ul>
          {total.lines.map((line) => (
            <ComponentRow
              key={line.component.id}
              line={line}
              editHref={`${base}/components/${line.component.id}/edit`}
            />
          ))}
        </ul>
      ) : null}

      {tradeOffs.length > 0 || extras.tradeOffs || extras.notes ? (
        <div className="grid gap-1 text-sm">
          {tradeOffs.length > 0 ? <p>{tradeOffs.join(". ")}.</p> : null}
          {extras.tradeOffs ? (
            <p>
              <span className="text-muted">Your trade-offs: </span>
              {extras.tradeOffs}
            </p>
          ) : null}
          {extras.notes ? <p className="text-muted">{extras.notes}</p> : null}
        </div>
      ) : null}

      {score?.overall != null ? (
        <p className="text-xs text-muted">
          Score <span className="num text-fg">{score.overall}</span> · cost{" "}
          <span className="num">{score.cost ?? "—"}</span> · flight time{" "}
          <span className="num">{score.time ?? "—"}</span> · flexibility{" "}
          <span className="num">{score.flexibility ?? "—"}</span>
        </p>
      ) : null}

      <SearchLinks
        target={{
          from: extras.departureAirport,
          flightsTo: extras.destinationAirport ?? candidate.destination,
          stay: candidate.destination,
          country: extras.destinationCountry,
          outbound: candidate.outboundDate,
          inbound: candidate.returnDate,
          party,
        }}
      />

      <div className="flex flex-wrap gap-2">
        <Link href={`${base}/components/new`} className={smallButtonClass}>
          <Plus aria-hidden="true" className="size-3.5" />
          Add price
        </Link>
        <Link href={`${base}/edit`} className={smallButtonClass}>
          <Pencil aria-hidden="true" className="size-3.5" />
          Edit option
        </Link>
        <StatusButtons
          tripId={tripId}
          candidateId={candidate.id}
          status={candidate.status}
          destination={candidate.destination}
        />
      </div>
    </article>
  );
}
