import { describe, expect, it } from "vitest";
import {
  applicationBadge,
  countiesOf,
  dateLabel,
  dayLabel,
  homesSummary,
  inFilter,
  isNewToday,
  parseDir,
  parseFilter,
  parseSort,
  rentFrom,
  sortListings,
  statusBadge,
  type ListingSummary,
} from "./display";
import { applicationFormSchema, projectFormSchema } from "./forms";

const TODAY = "2026-10-21";

function listing(overrides: Partial<ListingSummary> = {}): ListingSummary {
  return {
    id: "1",
    title: "Riverside Quarter",
    url: "https://newstarterhomes.ie/rent/riverside/",
    provider: null,
    address_text: "Castletroy, Co. Limerick",
    locality: "Castletroy",
    county: "Limerick",
    status: "open",
    closing_date: "2026-11-06",
    opening_date: null,
    unit_types: [
      {
        label: "2 bed apartment",
        bedrooms: 2,
        property_type: "apartment",
        rent_cents: 124000,
        homes: 18,
      },
      {
        label: "3 bed house",
        bedrooms: 3,
        property_type: "house",
        rent_cents: 149500,
        homes: 12,
      },
    ],
    bedrooms_text: "2 & 3 Bed",
    matches: "match",
    min_matching_rent_cents: 149500,
    rent_from_cents: 124000,
    first_seen_at: "2026-10-21T06:15:00Z",
    last_checked_at: "2026-10-21T06:15:00Z",
    missing_note: null,
    application_status: null,
    ...overrides,
  };
}

describe("statusBadge", () => {
  it("shows open listings with their closing date in green", () => {
    expect(statusBadge(listing(), TODAY)).toEqual({
      label: "Open · closes 6 Nov",
      tone: "ok",
    });
    expect(statusBadge(listing({ closing_date: null }), TODAY)).toEqual({
      label: "Open · closing date not stated",
      tone: "ok",
    });
  });

  it("counts down the last 7 days in orange, recomputed for today", () => {
    expect(statusBadge(listing({ closing_date: "2026-10-24" }), TODAY)).toEqual(
      {
        label: "Closes in 3 days",
        tone: "due",
      },
    );
    expect(
      statusBadge(
        listing({ status: "closing_soon", closing_date: "2026-10-21" }),
        TODAY,
      ).label,
    ).toBe("Closes today");
    expect(
      statusBadge(listing({ closing_date: "2026-10-22" }), TODAY).label,
    ).toBe("Closes in 1 day");
  });

  it("flags an open listing whose deadline has passed for review", () => {
    expect(statusBadge(listing({ closing_date: "2026-10-01" }), TODAY)).toEqual(
      {
        label: "Open · deadline 1 Oct passed",
        tone: "review",
      },
    );
  });

  it("shows coming soon, closed and unknown listings", () => {
    expect(
      statusBadge(
        listing({ status: "coming_soon", opening_date: "2026-10-23" }),
        TODAY,
      ),
    ).toEqual({
      label: "Opens 23 Oct",
      tone: "info",
    });
    expect(
      statusBadge(
        listing({ status: "closed", closing_date: "2024-09-04" }),
        TODAY,
      ),
    ).toEqual({
      label: "Closed 4 Sep 2024",
      tone: "bad",
    });
    expect(statusBadge(listing({ status: "unknown" }), TODAY)).toEqual({
      label: "Status unknown",
      tone: "review",
    });
  });
});

describe("applicationBadge", () => {
  it("labels the household's application", () => {
    expect(applicationBadge(null).label).toBe("Not applied");
    expect(applicationBadge("lottery_entered")).toEqual({
      label: "Lottery entered",
      tone: "info",
    });
    expect(applicationBadge("bogus").label).toBe("Not applied");
  });
});

describe("rentFrom", () => {
  it("prefers the cheapest matching home", () => {
    expect(rentFrom(listing())).toBe(149500);
  });

  it("falls back to the cheapest home, then the site's figure if plausible", () => {
    expect(
      rentFrom(listing({ matches: "none", min_matching_rent_cents: null })),
    ).toBe(124000);
    expect(
      rentFrom(
        listing({
          min_matching_rent_cents: null,
          unit_types: [],
          rent_from_cents: 139500,
        }),
      ),
    ).toBe(139500);
    // newstarterhomes.ie once showed "€146,250" as a monthly rent; never display that.
    expect(
      rentFrom(
        listing({
          min_matching_rent_cents: null,
          unit_types: [],
          rent_from_cents: 14_625_000,
        }),
      ),
    ).toBeNull();
  });
});

describe("homesSummary", () => {
  it("summarises matching homes, or says why there's no match", () => {
    expect(homesSummary(listing())).toBe("3 bed house");
    expect(
      homesSummary(listing({ matches: "none", bedrooms_text: "1 & 2 Bed" })),
    ).toBe("1 & 2 Bed · no match");
  });
});

describe("filters", () => {
  const matchOpen = listing();
  const noneOpen = listing({ id: "2", matches: "none" });
  const soon = listing({
    id: "3",
    closing_date: "2026-10-25",
    status: "closing_soon",
  });
  const closedMatch = listing({ id: "4", status: "closed" });
  const closedNone = listing({ id: "5", status: "closed", matches: "none" });
  const closedApplied = listing({
    id: "6",
    status: "closed",
    matches: "none",
    application_status: "unsuccessful",
  });
  const upcoming = listing({
    id: "7",
    status: "coming_soon",
    matches: "possible",
  });
  const all = [
    matchOpen,
    noneOpen,
    soon,
    closedMatch,
    closedNone,
    closedApplied,
    upcoming,
  ];
  const ids = (f: Parameters<typeof inFilter>[1]) =>
    all.filter((l) => inFilter(l, f, TODAY)).map((l) => l.id);

  it("defaults to open matches (including possible and coming soon)", () => {
    expect(parseFilter(undefined)).toBe("matches");
    expect(parseFilter("nonsense")).toBe("matches");
    expect(ids("matches")).toEqual(["1", "3", "7"]);
  });

  it("finds matches closing within 7 days", () => {
    expect(ids("closing")).toEqual(["3"]);
  });

  it("finds applications and closed matches", () => {
    expect(ids("applied")).toEqual(["6"]);
    expect(ids("closed")).toEqual(["4", "6"]);
    expect(ids("all")).toHaveLength(7);
  });
});

describe("sorting", () => {
  const a = listing({
    id: "a",
    title: "Alpha",
    first_seen_at: "2026-10-01T06:00:00Z",
    min_matching_rent_cents: 180000,
    closing_date: null,
  });
  const b = listing({
    id: "b",
    title: "Bravo",
    first_seen_at: "2026-10-20T06:00:00Z",
    min_matching_rent_cents: 150000,
    closing_date: "2026-11-02",
  });
  const c = listing({
    id: "c",
    title: "Charlie",
    first_seen_at: "2026-10-10T06:00:00Z",
    min_matching_rent_cents: null,
    unit_types: [],
    rent_from_cents: null,
    closing_date: "2026-10-25",
  });

  it("is newest first by default", () => {
    expect(parseSort(undefined)).toBe("first_seen");
    expect(parseDir(undefined, "first_seen")).toBe("desc");
    expect(
      sortListings([a, b, c], "first_seen", "desc").map((l) => l.id),
    ).toEqual(["b", "c", "a"]);
  });

  it("sorts by rent and closing date with unknowns last", () => {
    expect(parseDir(undefined, "rent")).toBe("asc");
    expect(sortListings([a, b, c], "rent", "asc").map((l) => l.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(sortListings([a, b, c], "rent", "desc").map((l) => l.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortListings([a, b, c], "closes", "asc").map((l) => l.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect(sortListings([c, b, a], "title", "asc").map((l) => l.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("labels", () => {
  it("formats dates relative to today in Dublin", () => {
    expect(dateLabel("2026-11-06", TODAY)).toBe("6 Nov");
    expect(dateLabel("2025-11-06", TODAY)).toBe("6 Nov 2025");
    expect(dayLabel("2026-10-20T23:30:00Z", TODAY)).toBe("Today"); // 00:30 on the 21st in Dublin
    expect(dayLabel("2026-10-20T06:00:00Z", TODAY)).toBe("Yesterday");
    expect(dayLabel("2026-10-12T06:00:00Z", TODAY)).toBe("12 Oct");
    expect(isNewToday(listing(), TODAY)).toBe(true);
    expect(
      countiesOf([
        listing(),
        listing({ county: "Cork" }),
        listing({ county: null }),
      ]),
    ).toEqual(["Cork", "Limerick"]);
  });
});

describe("forms", () => {
  it("accepts an application and turns blanks into nulls", () => {
    const parsed = applicationFormSchema.parse({
      status: "applied",
      applied_on: "2026-10-03",
      provider_reference: "",
      outcome_text: " Your application was successful. ",
      next_action: "",
      next_action_due: "",
      notes: "",
    });
    expect(parsed).toEqual({
      status: "applied",
      applied_on: "2026-10-03",
      provider_reference: null,
      outcome_text: "Your application was successful.",
      next_action: null,
      next_action_due: null,
      notes: null,
    });
  });

  it("rejects unknown statuses and bad dates", () => {
    const base = {
      applied_on: "",
      provider_reference: "",
      outcome_text: "",
      next_action: "",
      next_action_due: "",
      notes: "",
    };
    expect(
      applicationFormSchema.safeParse({ ...base, status: "booked" }).success,
    ).toBe(false);
    expect(
      applicationFormSchema.safeParse({
        ...base,
        status: "applied",
        applied_on: "03/10/2026",
      }).success,
    ).toBe(false);
  });

  it("needs an official source before a project is marked confirmed", () => {
    const project = {
      name: "Dock Road",
      locality: "",
      county: "Limerick",
      provider: "",
      stage: "",
      total_homes: "",
      cost_rental_homes: "",
      bedroom_mix: "",
      cost_rental_confirmed: "yes",
      expected_date_text: "",
      source_url: "",
      notes: "",
      verification: "officially_confirmed",
      last_checked_on: "",
    };
    const missing = projectFormSchema.safeParse(project);
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].message).toBe(
      "Add the official source link before marking this confirmed",
    );
    const ok = projectFormSchema.parse({
      ...project,
      source_url: "https://www.limerick.ie/x",
      total_homes: "120",
    });
    expect(ok.total_homes).toBe(120);
    expect(ok.cost_rental_homes).toBeNull();
  });
});
