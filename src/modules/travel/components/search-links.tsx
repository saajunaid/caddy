import { ExternalLink } from "lucide-react";
import {
  bookingUrl,
  dfaAdviceUrl,
  googleFlightsUrl,
  skyscannerUrl,
} from "../server/deep-links";
import type { Party } from "../server/travellers";
import { buttonClass, linkClass } from "./ui";

export type SearchTarget = {
  from: string;
  /** Airport code or place name for flights; null = anywhere. */
  flightsTo: string | null;
  /** Place name for Booking.com; null leaves it empty. */
  stay: string | null;
  country: string | null;
  outbound: string;
  inbound: string;
  party: Party;
};

function links(target: SearchTarget) {
  const flight = {
    from: target.from,
    to: target.flightsTo,
    outbound: target.outbound,
    inbound: target.inbound,
    party: target.party,
  };
  return [
    { label: "Skyscanner", href: skyscannerUrl(flight) },
    { label: "Google Flights", href: googleFlightsUrl(flight) },
    {
      label: "Booking.com",
      href: bookingUrl({
        destination: target.stay,
        checkin: target.outbound,
        checkout: target.inbound,
        party: target.party,
      }),
    },
  ].filter((l): l is { label: string; href: string } => l.href !== null);
}

/** Large "Search on" buttons for the trip brief. */
export function SearchButtons({ target }: { target: SearchTarget }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links(target).map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass}
        >
          {l.label}
          <ExternalLink aria-hidden="true" className="size-3" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      ))}
      <a
        href={dfaAdviceUrl(target.country)}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonClass}
      >
        Travel advice (DFA)
        <ExternalLink aria-hidden="true" className="size-3" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}

/** Compact links on each option card. */
export function SearchLinks({ target }: { target: SearchTarget }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <span className="text-muted">Search:</span>
      {links(target).map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {l.label}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
      <a
        href={dfaAdviceUrl(target.country)}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        Travel advice
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </p>
  );
}
