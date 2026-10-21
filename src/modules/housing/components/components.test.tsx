import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ListingSummary } from "../display";
import { Freshness } from "./freshness";
import { ListingCard } from "./listing-card";
import { NewsPanel } from "./news-panel";

const NOW = new Date("2026-10-21T06:20:00Z");

const listing: ListingSummary = {
  id: "abc",
  title: "Longview, Whites Cross",
  url: "https://newstarterhomes.ie/rent/long/",
  provider: null,
  address_text: "Longview, Co. Cork",
  locality: "Longview",
  county: "Cork",
  status: "closing_soon",
  closing_date: "2026-10-24",
  opening_date: null,
  unit_types: [
    {
      label: "four bedroom home",
      bedrooms: 4,
      property_type: "unknown",
      rent_cents: 159400,
      homes: 13,
    },
  ],
  bedrooms_text: "3 & 4 Bed",
  matches: "match",
  min_matching_rent_cents: 159400,
  rent_from_cents: 145500,
  first_seen_at: "2026-10-21T06:15:00Z",
  last_checked_at: "2026-10-21T06:15:00Z",
  missing_note: null,
  application_status: "applied",
};

describe("ListingCard", () => {
  it("shows status, application, matching homes and rent", () => {
    render(<ListingCard listing={listing} today="2026-10-21" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/housing/abc");
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.getByText("Closes in 3 days")).toBeInTheDocument();
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("4 bed, type not stated")).toBeInTheDocument();
    expect(screen.getByText("€1,594")).toBeInTheDocument();
  });

  it("says when rent isn't stated instead of showing zero", () => {
    render(
      <ListingCard
        listing={{
          ...listing,
          unit_types: [],
          min_matching_rent_cents: null,
          rent_from_cents: null,
        }}
        today="2026-10-21"
      />,
    );
    expect(screen.getByText("Rent not stated")).toBeInTheDocument();
  });
});

describe("Freshness", () => {
  it("shows a healthy check", () => {
    render(
      <Freshness
        now={NOW}
        run={{
          status: "succeeded",
          summary: "203 listings checked · 1 match · 2 new",
          error: null,
          startedAt: new Date("2026-10-21T06:14:00Z"),
          finishedAt: null,
          stats: {},
        }}
      />,
    );
    expect(screen.getByText("Checked today 07:14")).toBeInTheDocument();
    expect(screen.getByText(/203 listings checked/)).toBeInTheDocument();
  });

  it("shows a failed check in red, never as zero results", () => {
    render(
      <Freshness
        now={NOW}
        run={{
          status: "failed",
          summary: null,
          error: "Parser found no listings on https://newstarterhomes.ie/rent/",
          startedAt: new Date("2026-10-21T06:14:00Z"),
          finishedAt: null,
          stats: {},
        }}
      />,
    );
    expect(screen.getByText("Failed today 07:14")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Parser found no listings",
    );
  });

  it("explains the state before the first run", () => {
    render(<Freshness now={NOW} run={null} />);
    expect(screen.getByText("Not checked yet")).toBeInTheDocument();
  });
});

describe("NewsPanel", () => {
  it("warns when no research run arrived in 36 hours", () => {
    render(
      <NewsPanel
        items={[]}
        now={NOW}
        today="2026-10-21"
        run={{
          status: "succeeded",
          summary: "3 items",
          error: null,
          startedAt: new Date("2026-10-19T05:00:00Z"),
          finishedAt: null,
          stats: {},
        }}
      />,
    );
    expect(screen.getByText(/News: no update since/)).toBeInTheDocument();
  });

  it("lists items with their verification", () => {
    render(
      <NewsPanel
        now={NOW}
        today="2026-10-21"
        run={null}
        items={[
          {
            id: "n1",
            title: "Council approves homes at Dock Road",
            url: "https://example.ie/dock-road",
            source_name: "Example News",
            source_type: "news",
            published_on: "2026-10-12",
            retrieved_at: "2026-10-21T05:00:00Z",
            summary: null,
            locality: "Limerick City",
            cost_rental_confirmed: "unconfirmed",
            verification: "reported",
          },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Dock Road/ })).toHaveAttribute(
      "href",
      "https://example.ie/dock-road",
    );
    expect(screen.getByText("Reported")).toBeInTheDocument();
    expect(
      screen.getByText(/no research run has arrived yet/),
    ).toBeInTheDocument();
  });
});
