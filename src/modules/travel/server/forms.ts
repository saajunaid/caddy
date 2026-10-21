// Parsing and validating the travel forms. Pure (takes FormData-like input), shared by server
// actions and tests. Money never passes through floating point.
import { parseToCents } from "../../../server/domain/money.ts";
import { COUNTRIES, iataCode } from "./deep-links.ts";
import { CURRENCIES, isCurrency, parseMinor } from "./currency.ts";
import { fromDublinLocal } from "./dublin-time.ts";
import {
  BOARD_BASES,
  CANDIDATE_STATUSES,
  COMPONENT_KINDS,
  TRIP_STATUSES,
  type BoardBasis,
  type CandidateStatus,
  type ComponentKind,
  type TripBoardBasis,
  type TripStatus,
} from "./labels.ts";

type FormLike = {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
};

export type Parsed<T> =
  { ok: true; value: T } | { ok: false; errors: string[] };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class Reader {
  errors: string[] = [];
  private form: FormLike;
  constructor(form: FormLike) {
    this.form = form;
  }

  raw(name: string): string {
    const value = this.form.get(name);
    return typeof value === "string" ? value.trim() : "";
  }

  text(
    name: string,
    label: string,
    max: number,
    required = false,
  ): string | null {
    const value = this.raw(name);
    if (!value) {
      if (required) this.errors.push(`${label} is required.`);
      return null;
    }
    if (value.length > max) {
      this.errors.push(`${label} must be ${max} characters or fewer.`);
      return null;
    }
    return value;
  }

  date(name: string, label: string): string | null {
    const value = this.raw(name);
    if (
      !ISO_DATE.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ) {
      this.errors.push(`${label} must be a date.`);
      return null;
    }
    // Reject dates like 2027-02-30 that Date.parse rolls over.
    if (new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
      this.errors.push(`${label} must be a real date.`);
      return null;
    }
    return value;
  }

  int(name: string, label: string, min: number, max: number): number | null {
    const value = this.raw(name);
    if (!value) return null;
    if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
      this.errors.push(
        `${label} must be a whole number from ${min} to ${max}.`,
      );
      return null;
    }
    return Number(value);
  }

  checked(name: string): boolean {
    const value = this.raw(name);
    return (
      value === "on" || value === "1" || value === "true" || value === "yes"
    );
  }

  oneOf<T extends string>(
    name: string,
    label: string,
    options: readonly T[],
    fallback: T,
  ): T {
    const value = this.raw(name);
    if (!value) return fallback;
    if (!(options as readonly string[]).includes(value)) {
      this.errors.push(`${label} isn't a valid choice.`);
      return fallback;
    }
    return value as T;
  }

  done<T>(value: T): Parsed<T> {
    return this.errors.length > 0
      ? { ok: false, errors: this.errors }
      : { ok: true, value };
  }
}

/** "DUB" stays a code; "belfast" becomes "Belfast"-as-typed; at most 40 characters. */
function normaliseAirport(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return iataCode(trimmed) ?? trimmed.slice(0, 40);
}

/** "4.5" hours → 270 minutes, exactly. */
export function hoursToMinutes(value: string): number | null {
  const m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) return null;
  const hundredths = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Math.round((hundredths * 60) / 100);
}

/** 270 minutes → "4.5", 255 → "4.25" (for showing a stored limit in the form). */
export function minutesToHours(minutes: number): string {
  const hundredths = Math.round((minutes * 100) / 60);
  const whole = Math.floor(hundredths / 100);
  const fraction = String(hundredths % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

export type TravellerInput = {
  id: string | null;
  memberId: string | null;
  name: string;
  isChild: boolean;
  ageAtTravel: number | null;
  confirmed: boolean;
};

export type TripInput = {
  name: string;
  dateFrom: string;
  dateTo: string;
  nightsMin: number | null;
  nightsMax: number | null;
  departureAirports: string[];
  destinationIdeas: string | null;
  budgetCents: number | null;
  boardBasis: TripBoardBasis;
  roomNeeds: string | null;
  maxStops: number | null;
  maxFlightMinutes: number | null;
  requireFreeCancellation: boolean;
  status: TripStatus;
  notes: string | null;
  travellers: TravellerInput[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | null | undefined): value is string =>
  !!value && UUID.test(value);

export function parseTripForm(form: FormLike): Parsed<TripInput> {
  const r = new Reader(form);
  const name = r.text("name", "Trip name", 120, true) ?? "";
  const dateFrom = r.date("date_from", "Earliest departure") ?? "";
  const dateTo = r.date("date_to", "Latest return") ?? "";
  if (dateFrom && dateTo && dateTo < dateFrom)
    r.errors.push("Latest return must be on or after the earliest departure.");
  const nightsMin = r.int("nights_min", "Minimum nights", 1, 365);
  const nightsMax = r.int("nights_max", "Maximum nights", 1, 365);
  if (nightsMin !== null && nightsMax !== null && nightsMax < nightsMin)
    r.errors.push("Maximum nights must be at least the minimum.");

  const airports: string[] = [];
  const addAirport = (value: string) => {
    const code = normaliseAirport(value);
    if (code && !airports.some((a) => a.toLowerCase() === code.toLowerCase()))
      airports.push(code);
  };
  for (const value of form.getAll("airport"))
    if (typeof value === "string") addAirport(value);
  for (const value of r.raw("airports_other").split(",")) addAirport(value);
  if (airports.length === 0)
    r.errors.push("Pick at least one departure airport.");
  if (airports.length > 8) r.errors.push("Pick at most 8 departure airports.");

  let budgetCents: number | null = null;
  const budget = r.raw("budget");
  if (budget) {
    try {
      budgetCents = parseToCents(budget);
      if (budgetCents < 0 || budgetCents > 2_000_000_000) throw new Error();
    } catch {
      r.errors.push("Budget must be an amount in euro, like 3200 or 3,200.00.");
      budgetCents = null;
    }
  }

  let maxFlightMinutes: number | null = null;
  const hours = r.raw("max_flight_hours");
  if (hours) {
    maxFlightMinutes = hoursToMinutes(hours);
    if (
      maxFlightMinutes === null ||
      maxFlightMinutes < 30 ||
      maxFlightMinutes > 2880
    ) {
      r.errors.push("Longest flight must be in hours, like 4 or 4.5.");
      maxFlightMinutes = null;
    }
  }

  const travellers: TravellerInput[] = [];
  const rows = r.int("traveller_rows", "Traveller rows", 0, 30) ?? 0;
  for (let i = 0; i < rows; i += 1) {
    const p = `t${i}_`;
    if (!r.checked(`${p}include`)) continue;
    const travellerName = r.text(
      `${p}name`,
      `Traveller ${i + 1} name`,
      60,
      true,
    );
    const isChild = r.checked(`${p}child`);
    const age = r.int(
      `${p}age`,
      `${travellerName ?? "Traveller"}'s age`,
      0,
      120,
    );
    const confirmed = isChild ? r.checked(`${p}confirmed`) : true;
    if (isChild && confirmed && age === null)
      r.errors.push(
        `Enter ${travellerName ?? "the child"}'s age at travel before confirming it.`,
      );
    const id = r.raw(`${p}id`);
    const memberId = r.raw(`${p}member`);
    travellers.push({
      id: isUuid(id) ? id : null,
      memberId: isUuid(memberId) ? memberId : null,
      name: travellerName ?? "",
      isChild,
      ageAtTravel: age,
      confirmed,
    });
  }
  if (!travellers.some((t) => !t.isChild))
    r.errors.push("Add at least one adult traveller.");

  return r.done({
    name,
    dateFrom,
    dateTo,
    nightsMin,
    nightsMax,
    departureAirports: airports,
    destinationIdeas: r.text("destination_ideas", "Destination ideas", 500),
    budgetCents,
    boardBasis: r.oneOf(
      "board_basis",
      "Board basis",
      [...BOARD_BASES, "any"] as const,
      "any",
    ),
    roomNeeds: r.text("room_needs", "Room needs", 500),
    maxStops: r.int("max_stops", "Maximum stops", 0, 5),
    maxFlightMinutes,
    requireFreeCancellation: r.checked("require_free_cancellation"),
    status: r.oneOf("status", "Status", TRIP_STATUSES, "planning"),
    notes: r.text("notes", "Notes", 4000),
    travellers,
  });
}

export type CandidateInput = {
  destination: string;
  destinationAirport: string | null;
  destinationCountry: string | null;
  outboundDate: string;
  returnDate: string;
  departureAirport: string;
  notes: string | null;
  tradeOffs: string | null;
  status: CandidateStatus;
};

export function parseCandidateForm(form: FormLike): Parsed<CandidateInput> {
  const r = new Reader(form);
  const destination = r.text("destination", "Destination", 120, true) ?? "";
  const airportRaw = r.raw("destination_airport");
  const destinationAirport = airportRaw ? iataCode(airportRaw) : null;
  if (airportRaw && !destinationAirport)
    r.errors.push(
      "Destination airport must be a 3-letter code like FAO, or left empty.",
    );
  const countryRaw = r.raw("destination_country");
  const destinationCountry = COUNTRIES.some((c) => c.code === countryRaw)
    ? countryRaw
    : null;
  const outboundDate = r.date("outbound_date", "Outbound date") ?? "";
  const returnDate = r.date("return_date", "Return date") ?? "";
  if (outboundDate && returnDate && returnDate <= outboundDate)
    r.errors.push("Return date must be after the outbound date.");
  const departure = normaliseAirport(r.raw("departure_airport"));
  if (!departure) r.errors.push("Departure airport is required.");
  return r.done({
    destination,
    destinationAirport,
    destinationCountry,
    outboundDate,
    returnDate,
    departureAirport: departure ?? "",
    notes: r.text("notes", "Notes", 4000),
    tradeOffs: r.text("trade_offs", "Trade-offs", 2000),
    status: r.oneOf("status", "Status", CANDIDATE_STATUSES, "option"),
  });
}

export type ComponentInput = {
  kind: ComponentKind;
  provider: string | null;
  description: string | null;
  priceMinor: number;
  currency: string;
  isEstimate: boolean;
  includes: string | null;
  excludes: string | null;
  bookingUrl: string | null;
  cancellationTerms: string | null;
  freeCancellation: boolean | null;
  boardBasis: BoardBasis | null;
  stops: number | null;
  durationMinutes: number | null;
  checkedAt: Date;
};

export function parseComponentForm(
  form: FormLike,
  now: Date,
): Parsed<ComponentInput> {
  const r = new Reader(form);
  const kind = r.oneOf("kind", "Type", COMPONENT_KINDS, "other");
  const isEstimate = r.checked("is_estimate");
  const provider = r.text("provider", "Provider", 120);
  if (!provider && !isEstimate)
    r.errors.push("Add who quoted this price, or tick “This is an estimate”.");

  const currency = r.raw("currency") || "EUR";
  let priceMinor = 0;
  if (!isCurrency(currency)) {
    r.errors.push(`Currency must be one of ${CURRENCIES.join(", ")}.`);
  } else {
    try {
      priceMinor = parseMinor(r.raw("price"), currency);
    } catch (error) {
      r.errors.push(
        r.raw("price")
          ? `Price: ${(error as Error).message}.`
          : "Price is required.",
      );
    }
  }

  let bookingUrl = r.text("booking_url", "Booking link", 2000);
  if (bookingUrl) {
    try {
      const url = new URL(bookingUrl);
      if (url.protocol !== "https:") throw new Error();
      bookingUrl = url.toString();
    } catch {
      r.errors.push("Booking link must be a full https:// address.");
      bookingUrl = null;
    }
  }

  const checkedRaw = r.raw("checked_at");
  let checkedAt = now;
  if (checkedRaw) {
    const parsed = fromDublinLocal(checkedRaw);
    if (!parsed) r.errors.push("Checked must be a date and time.");
    else if (parsed.getTime() > now.getTime() + 5 * 60_000)
      r.errors.push("Checked can't be in the future.");
    else checkedAt = parsed;
  }

  const isStay = kind === "accommodation";
  const isFlight = kind === "flight";
  const free = r.raw("free_cancellation");
  let durationMinutes: number | null = null;
  if (isFlight) {
    const h = r.int("duration_hours", "Flight hours", 0, 47);
    const m = r.int("duration_minutes", "Flight minutes", 0, 59);
    if (h !== null || m !== null) durationMinutes = (h ?? 0) * 60 + (m ?? 0);
    if (durationMinutes === 0) durationMinutes = null;
  }
  const board = isStay ? r.raw("board_basis") : "";
  if (board && !(BOARD_BASES as readonly string[]).includes(board))
    r.errors.push("Board basis isn't a valid choice.");

  return r.done({
    kind,
    provider,
    description: r.text("description", "Description", 500),
    priceMinor,
    currency,
    isEstimate,
    includes: r.text("includes", "Includes", 500),
    excludes: r.text("excludes", "Excludes", 500),
    bookingUrl,
    cancellationTerms: r.text("cancellation_terms", "Cancellation terms", 500),
    freeCancellation: isStay && free ? free === "yes" : null,
    boardBasis: board ? (board as BoardBasis) : null,
    stops: isFlight ? r.int("stops", "Stops", 0, 5) : null,
    durationMinutes,
    checkedAt,
  });
}
