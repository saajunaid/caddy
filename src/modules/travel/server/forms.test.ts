import { describe, expect, it } from "vitest";
import {
  hoursToMinutes,
  minutesToHours,
  parseCandidateForm,
  parseComponentForm,
  parseTripForm,
} from "./forms";

function form(entries: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const v of Array.isArray(value) ? value : [value]) data.append(key, v);
  }
  return data;
}

const trip = {
  name: "Mid-term Feb 2027",
  date_from: "2027-02-14",
  date_to: "2027-02-22",
  nights_min: "6",
  nights_max: "7",
  airport: ["DUB", "SNN"],
  airports_other: "bfs, Belfast City",
  budget: "3,200",
  board_basis: "half_board",
  max_stops: "0",
  max_flight_hours: "4.5",
  require_free_cancellation: "on",
  traveller_rows: "3",
  t0_include: "on",
  t0_name: "Adult One",
  t1_include: "on",
  t1_name: "Child One",
  t1_child: "1",
  t1_age: "8",
  t1_confirmed: "on",
  t2_name: "Not going",
};

describe("trip brief form", () => {
  it("parses a complete brief", () => {
    const result = parseTripForm(form(trip));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Mid-term Feb 2027",
      nightsMin: 6,
      nightsMax: 7,
      departureAirports: ["DUB", "SNN", "BFS", "Belfast City"],
      budgetCents: 320000,
      boardBasis: "half_board",
      maxStops: 0,
      maxFlightMinutes: 270,
      requireFreeCancellation: true,
      status: "planning",
    });
    expect(result.value.travellers).toEqual([
      {
        id: null,
        memberId: null,
        name: "Adult One",
        isChild: false,
        ageAtTravel: null,
        confirmed: true,
      },
      {
        id: null,
        memberId: null,
        name: "Child One",
        isChild: true,
        ageAtTravel: 8,
        confirmed: true,
      },
    ]);
  });

  it("explains every problem", () => {
    const result = parseTripForm(
      form({
        ...trip,
        name: "",
        date_to: "2027-02-01",
        nights_max: "3",
        airport: [],
        airports_other: "",
        budget: "lots",
        t0_include: "",
        t1_age: "",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      "Trip name is required.",
      "Latest return must be on or after the earliest departure.",
      "Maximum nights must be at least the minimum.",
      "Pick at least one departure airport.",
      "Budget must be an amount in euro, like 3200 or 3,200.00.",
      "Enter Child One's age at travel before confirming it.",
      "Add at least one adult traveller.",
    ]);
  });

  it("converts hours exactly", () => {
    expect(hoursToMinutes("4")).toBe(240);
    expect(hoursToMinutes("4.5")).toBe(270);
    expect(hoursToMinutes("4.25")).toBe(255);
    expect(hoursToMinutes("four")).toBeNull();
    expect(minutesToHours(270)).toBe("4.5");
    expect(minutesToHours(255)).toBe("4.25");
    expect(minutesToHours(240)).toBe("4");
    for (const m of [30, 95, 246, 250, 2880])
      expect(hoursToMinutes(minutesToHours(m))).toBe(m);
  });
});

describe("option form", () => {
  it("parses codes and dates", () => {
    const result = parseCandidateForm(
      form({
        destination: "Albufeira",
        destination_airport: "fao",
        destination_country: "PT",
        outbound_date: "2027-02-14",
        return_date: "2027-02-20",
        departure_airport: "dub",
      }),
    );
    expect(result).toEqual({
      ok: true,
      value: {
        destination: "Albufeira",
        destinationAirport: "FAO",
        destinationCountry: "PT",
        outboundDate: "2027-02-14",
        returnDate: "2027-02-20",
        departureAirport: "DUB",
        notes: null,
        tradeOffs: null,
        status: "option",
      },
    });
  });

  it("rejects impossible dates and bad codes", () => {
    const result = parseCandidateForm(
      form({
        destination: "Faro",
        destination_airport: "Faro airport",
        outbound_date: "2027-02-30",
        return_date: "2027-02-14",
        departure_airport: "DUB",
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      "Destination airport must be a 3-letter code like FAO, or left empty.",
      "Outbound date must be a real date.",
    ]);
  });
});

describe("price form", () => {
  const now = new Date("2026-10-21T10:00:00Z");

  it("parses a flight price in its own currency", () => {
    const result = parseComponentForm(
      form({
        kind: "flight",
        provider: "SunExpress",
        price: "11,800",
        currency: "TRY",
        booking_url: "https://example.com/deal?x=1",
        stops: "0",
        duration_hours: "4",
        duration_minutes: "50",
        board_basis: "half_board",
        checked_at: "2026-10-12T09:30",
      }),
      now,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      kind: "flight",
      priceMinor: 1180000,
      currency: "TRY",
      bookingUrl: "https://example.com/deal?x=1",
      stops: 0,
      durationMinutes: 290,
      boardBasis: null, // only for accommodation
      freeCancellation: null,
    });
    expect(result.value.checkedAt.toISOString()).toBe(
      "2026-10-12T08:30:00.000Z",
    );
  });

  it("keeps accommodation details and defaults the check to now", () => {
    const result = parseComponentForm(
      form({
        kind: "accommodation",
        provider: "Hotel Sol",
        price: "1764",
        currency: "EUR",
        free_cancellation: "no",
        board_basis: "half_board",
      }),
      now,
    );
    expect(result.ok && result.value).toMatchObject({
      freeCancellation: false,
      boardBasis: "half_board",
      checkedAt: now,
    });
  });

  it("requires a provider unless it's an estimate, and https links", () => {
    const result = parseComponentForm(
      form({
        kind: "meals",
        price: "100.555",
        currency: "EUR",
        booking_url: "http://example.com",
        checked_at: "2026-10-22T09:00",
      }),
      now,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      "Add who quoted this price, or tick “This is an estimate”.",
      "Price: EUR prices have at most 2 decimal places.",
      "Booking link must be a full https:// address.",
      "Checked can't be in the future.",
    ]);
    const estimate = parseComponentForm(
      form({ kind: "meals", price: "350", is_estimate: "on" }),
      now,
    );
    expect(estimate.ok && estimate.value.provider).toBeNull();
  });
});
