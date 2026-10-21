# Travel planner (R5)

Plan family trips with options you find yourself, and see what each one costs the whole family, all-in.

## What it does

- **Trip brief** (`/travel/new`, `/travel/[id]/edit`): travel window, nights, departure airports (DUB, SNN, ORK chips plus free text), travellers, budget, board basis, room needs and hard constraints (stops, longest flight, free cancellation).
- **Travellers** are prefilled from household members. A child's **age at travel** is worked out from their date of birth on the first day of the window, and has to be **confirmed for each trip**. Moving the dates recalculates the age and clears the confirmation.
- **Options** (`trip_candidates`): one destination on one set of dates. Each option is made of **prices** (`trip_components`): flights, accommodation, transfers, car hire, insurance, meals, activities or other. Each price is entered by a person and records the provider, the price in the site's own currency, what it includes and excludes, cancellation terms, a booking link (https only), when it was checked, and whether it's an estimate.
- **Comparison** (`/travel/[id]`): option cards side by side on desktop and stacked on a phone. Each card shows its rank, the total, the cost per person, budget status, the estimated share, every price with its checked date and link, constraint failures and unknowns, trade-offs, and a score.
- **Search links**: Skyscanner, Google Flights, Booking.com and Irish DFA travel advice, prefilled from the brief and from each option.
- **Status**: option → shortlisted → booked (recorded by you), or rejected.

## What it doesn't do

- **No live price search.** Amadeus Self-Service, the last free flight and hotel API, shut down on 17 July 2026. No free API covers flights, hotels and board basis together, and scraping booking sites breaches their terms and runs into bot protection (PLAN D6). Caddy builds links; you search on the sites and paste back what you find.
- **Never books, holds or pays.** "Mark booked" only records that you booked it yourself.
- **No invented prices.** Every price comes from a person. Estimates (groceries, fuel, tourist tax) are tagged **Estimate**, and the card shows how much of the total is estimated.

## Money and exchange rates

- Prices are stored as integer **minor units** of their currency (`price_minor bigint` + `currency char(3)`), using ISO 4217 exponents: 2 for EUR, GBP, USD, TRY, MAD, AED, EGP, CHF, PLN, CZK, HUF, SEK, NOK, DKK, THB and others; 0 for JPY and ISK.
- **ECB reference rates** (`fx_rates`, global and read-only for members) are stored as exact `numeric(18,8)` values, meaning units of currency per €1, as the ECB publishes them. The `fx-ecb` daily job fetches `eurofxref-daily.xml`. On its first run, or whenever fewer than 200 rates are stored, it also fetches the 90-day history once. Rates already stored are never changed.
- **Conversion**: `cents = minor × 100 × den ÷ (10^exponent × num)`, using bigint arithmetic and **rounding half-up once** per price. The total is the sum of the converted prices, so the lines always add up to it.
- **Which rate**: the latest rate on or before the price's checked date (in Dublin time). It is pinned on save (`fx_rate_id`, enforced by a composite FK to be the same currency). If no rate existed then, the latest suitable rate is looked up when the trip is shown.
- **No rate, no total**: a price without a rate is **left out** of the total and flagged, e.g. "Can't convert TRY: no rate on or before 12 Oct". The ECB doesn't publish MAD, AED or EGP, so those prices are kept but can't be added up. Enter the euro price if the site shows one. "Within budget" isn't shown while a price is missing; "over budget" still is.

## Constraints and ranking

1. Options you rejected are listed separately. So are options with no prices yet.
2. **Hard constraints** from the brief:
   - dates inside the window;
   - nights within the minimum and maximum;
   - board basis on the accommodation, treated as a minimum meal plan (all-inclusive meets half board, but self-catering only meets self-catering);
   - the most stops and the longest one-way flight entered on the flights;
   - free cancellation on every stay.

   A detail that wasn't entered counts as **unknown** (shown in yellow), never as a failure. Options that fail a constraint are listed under "Don't meet the brief" with the reason.
3. Options that meet the brief are ranked **by total cost in euro, cheapest first**. Ties go to booked, then shortlisted, then the earliest date.
4. **Score** (0–100) uses adjustable weights (`?wc=&wt=&wf=`, 0–5 each, default 3/1/1) for cost, flight time and flexibility (free cancellation). Unknown parts are left out of the weighting. The score is shown next to each option but **never changes the order**. When the best-scoring option isn't the cheapest, a note says so and gives the extra cost.
5. **Trade-offs** are generated against the cheapest option, e.g. "€412.67 more than Albufeira. Flight 2h 00m longer. Free cancellation (the cheapest has none). All inclusive vs half board". Your own trade-off notes are shown as well.
6. Gaps are flagged, e.g. "No accommodation entered yet" or "Total leaves out 1 price that can't be converted".

## Deep links (`src/modules/travel/server/deep-links.ts`, unit-tested)

| Site | Format |
|---|---|
| Skyscanner | `https://www.skyscanner.ie/transport/flights/<from>/<to>/<yymmdd>/<yymmdd>/?adultsv2=N&childrenv2=8%7C4`. Needs airport codes. Without a destination code it uses the "everywhere" search `/transport/flights-from/<from>/…`. |
| Google Flights | `https://www.google.com/travel/flights?q=` + "Flights from DUB to FAO on 2027-02-14 returning 2027-02-21 for 2 adults and 2 children" (place names if there's no code) |
| Booking.com | `https://www.booking.com/searchresults.html?ss=<dest>&checkin=…&checkout=…&group_adults=N&group_children=M&age=8&age=4&no_rooms=1` |
| DFA advice | `https://www.ireland.ie/en/dfa/overseas-travel/advice/<country-slug>/`, or the advice index when the country is unknown or its slug isn't confirmed |

Brief-level links search from the first departure airport, from the first day of the window, for the longest stay that fits. Children whose age is unknown are left out of the age lists, and the page asks you to confirm their ages.

## Jobs

| Job | Group | What it does |
|---|---|---|
| `fx-ecb` | daily (`daily.yml`) | Fetches ECB rates (with a one-time 90-day backfill) and inserts the ones not stored yet. A non-200 response, a network error, or a page that parses to **zero rates** is recorded as a failed source. Writes only `fx_rates`. |
| `travel-weekly` | weekly (`weekly.yml`, Mondays 07:07 UTC) | For trips still being planned whose window starts within 60 days, or that have shortlisted prices checked more than 7 days ago: one notification per trip per ISO week, e.g. "Prices for Mid-term Feb 2027 were last checked 12 Oct: recheck before booking". Writes only `notifications`. |

## Not verified from the build sandbox

- The DFA advice pages return 403 from the sandbox (CloudFront), so the country slugs are unconfirmed. Czechia, Türkiye, the UK and the US link to the index until they're checked.
- The Skyscanner, Google Flights and Booking.com URL formats were built to the agreed spec and tested as strings. They weren't opened in a real browser session (bot protection), and the Skyscanner "everywhere" fallback is the least certain.
