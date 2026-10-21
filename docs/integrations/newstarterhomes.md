# newstarterhomes.ie (Cost Rental listings)

Studied on 21 Oct 2026. Fixtures from that day are in `tests/fixtures/newstarterhomes/`.

## Access

- `robots.txt` is `User-agent: *` with only a `Sitemap:` line, so automated access is allowed.
- The site is a custom CMS, **not WordPress**: there is no `/wp-json/`.
- `sitemap.xml` lists only ~20 static pages (no listing pages), so it can't be used for discovery.
- All listing content is in the server-rendered HTML; no JavaScript is needed.
- We fetch with `User-Agent: CaddyBot/0.1 (+https://caddy-beryl.vercel.app; private household use)`,
  at most one request every 1.1 s, one retry on 5xx/429 after 5 s, 30 s timeout.

## Discovery (how the job finds every listing)

1. **List view** `https://newstarterhomes.ie/rent/` — 12 cards per page, paginated with
   `?page=N`. Page 1 says `Showing 1 to 12 of 203 properties` (`#count`); every page except the last
   has `#paging #next a[href="?page=N+1"]`. The job follows `next` links until there are none,
   up to 60 pages, and compares the cards it collected with the reported total. Pages past the end
   (e.g. `?page=18`) load with HTTP 200 and **no cards** — that is why a page with zero cards is
   always treated as a parser failure, never as "no listings".
   Order: open listings first, then coming soon, then closed (newest first within each).
2. **Calendar view** `https://newstarterhomes.ie/rent/calendar/` — one page linking **every**
   listing, with dates. Used as a cross-check (any slug found only here is fetched too) and as the
   source of opening/closing dates that listing pages don't show.
3. **Map view** `https://newstarterhomes.ie/rent/map/` loads a GeoJSON FeatureCollection with
   `POST /json/properties/` (`cat=2&item=0&lang=en&src=maplibre`). It held only 67 of the 203
   listings on 21 Oct, so it's **not used**; listing pages carry their own map pin.

On 21 Oct 2026: 17 list pages, **203 listings** (5 open, 2 coming soon, 196 closed), and the
calendar linked the same 203 slugs.

## List-view card (`article.property`)

| Field | Selector | Example |
|---|---|---|
| Status | class `open` / `soon` / `closed` on the article; text in `p.status` | `Applications Open`, `Coming Soon`, `Applications Closed` |
| Title | `h3` | `Woodbrook` |
| Price | `p.price` | `Prices starting from €1,495` |
| Location | `p.location span` | `Shankill, Co. Dublin` |
| Link | `footer a.button[href]`, relative to `/rent/` | `woodbrook1/` → slug `woodbrook1` |
| Listed | `p.date` | `Listed: 20/10/2026` (day first) |

## Listing page (`/rent/<slug>/`)

| Field | Selector | Notes |
|---|---|---|
| Title | `#image .pa h2` | |
| County | `#image .pa p.location` | `Co. Dublin` |
| Open + deadline | `#image .pa p.close` | `Applications Close:<br>27 October 2026 at 12:00` — only on open listings |
| Closed | `#image .pa p.soon` | `Applications Closed` |
| Coming soon | `#image .pa p.soon` | `The Sidings, Adamstown applications will be open from 09:00 on the 21st of October 2026.` |
| Apply link | `#apply a`, or `#image a[rel=external]` | only while open; points at the provider |
| Starting rent | `#info li` with `h3` "Starting From" → `p` | `€1,495` (see quirks) |
| Location | `#info` "Location" | `Shankill, Co. Dublin` |
| Bedrooms | `#info` "Bedrooms" | `1 & 2 Bed`, `1, 2 & 3 Bed` |
| Homes | `#info` "Availability" | `327 Units` |
| Unit table | first `table` in `main` | see below |
| Provider | `#details h3` "Contact" → next `p` | present on only ~2% of pages (LDA); otherwise "Not stated" |
| Map pin | `#map[data-center]` | `53.2205,-6.1147`; present on every page seen |

### Unit table

Layouts vary by provider. The parser finds the header row (the first row with a "type" or
"rent" heading, whether `<th>` in `<thead>` or `<td>` in `<tbody>`) and maps columns by heading:

- type: `Property Type`, `Type`, `Properties Available`, `Property Type e.g. studio, 1 bed apt…`
- homes: `Number of Homes`, `Number of Units`, `Numer of Homes` (sic), `Units`
- rent: `Cost Rent`, `Cost Rent (€)`, `Cost Rent €`; never `Open Market Rental Value` or
  `% Reduction…`

Row labels seen: `1-bed`, `2 bed duplex`, `Three-bedroom house`, `3 Bed Semi Detached`,
`2 Bed Mid-Terraced House`, `Two-bedroom bungalows`, `three bedroom home`, `2 BED APARTMENT - 3 PERSON`,
`Studio`, `3 Bed Duplex (The Cherry)`. Bedrooms come from digits or words; the property type is
`house` (house, terrace, semi-detached, detached, bungalow, townhouse), `duplex` (duplex,
maisonette — checked before apartment, so "Duplex Apartment" is a duplex), `apartment`
(apartment, apt, flat, penthouse, studio) or `unknown` ("home", "2-bed").

45 of 203 pages have **no table**. Their sizes come from the "Bedrooms" summary, with type, rent
and homes unknown (flagged `unitTypesFromSummary`).

## Quirks

- `griffin`: "Starting From **€146,250**" (a typo for €1,462.50). Kept as published in the snapshot;
  the app shows rent from the unit table and ignores starting rents over €10,000.
- `crossingsadams`: the rent column is headed "Maximum Sale Price (€". Not a rent heading, so rents
  stay unknown rather than guessed.
- `themaltings`: two columns both headed "Property Type" (the second is homes); homes stay unknown.
- `swiftbanks`: two "Number of Homes" columns (the second is size); the first is used.
- Rents with cents (`€1,339.50`), without the euro sign (`1,302`), with prefixes (`From €1525`) or
  suffixes (`€1,407 per calendar month`) all parse; `TBC` is unknown.
- Relets reuse the development name with a new slug (`airton-plaza`, `airton-plaza-2`, …). Each
  slug is its own listing.
- `mountneil1` says "Carrickperish, Co. Wexford" for a Waterford scheme; we show what the site says.

## Daily crawl budget

Every list page (17) + the calendar + every listing that isn't closed + new listings + listings
whose status changed + closed listings due their weekly re-read. Each closed listing has a fixed
weekday slot (hash of its slug), so about a seventh of them (~28) are re-read each day and none
goes more than 8 days unread. About 55 requests (~1 minute) on a normal day; the very first run
reads all ~220 pages (~4 minutes).
