# Nearby places (module `places`)

Shows childcare/ECCE, primary and secondary schools, further and higher education, bus stops,
mosques and halal food around a location (a Cost Rental home, or any address on `/places`),
on a map and in grouped lists. Implements PLAN D10, D11 and §7.1 "Nearby panel".

## Where things are

| What | Path |
|---|---|
| Migration | `supabase/migrations/20261021250000_places.sql` |
| Pure logic + adapters + job (Node-runnable, D26 rules) | `src/modules/places/server/` |
| Queries / server actions / Nominatim (app only) | `src/modules/places/{queries,actions,nominatim}.ts` |
| UI | `src/modules/places/components/` (`NearbyPanel` is the entry point) |
| "Check an area" page (not in nav) | `src/app/(app)/places/page.tsx` → `/places?q=…` |
| DB tests | `tests/db/places.test.ts` |
| Overpass fixtures | `tests/fixtures/overpass/` |

## Using the panel (for the Housing integrator)

```tsx
import { NearbyPanel, NearbyPanelSkeleton } from "@/modules/places/components/nearby-panel";
import { listingAnchorKey } from "@/modules/places/server/anchors";

// latitude/longitude null → pass anchor={null}: "We couldn't place this home on a map yet."
<Suspense fallback={<NearbyPanelSkeleton />}>
  <NearbyPanel anchor={listing.latitude != null && listing.longitude != null
    ? { key: listingAnchorKey(listing.id), label: listing.title ?? "This home",
        latitude: listing.latitude, longitude: listing.longitude }
    : null} />
</Suspense>
```

The page that renders it should `export const maxDuration = 60;`: the "Look up nearby places
now" button waits on Overpass (up to 20 s per mirror, then falls back to the next).

## Categories and radii

| Key | Label | Glyph | Radius | Shown |
|---|---|---|---|---|
| childcare | Childcare / ECCE | C | 2 km | 8 |
| primary | Primary | P | 2 km | 8 |
| secondary | Secondary | S | 3 km | 8 |
| higher | Further & higher ed | U | 10 km | 8 |
| bus | Bus stops | B | 0.5 km | 5 |
| mosque | Mosques | M | 5 km | 8 |
| halal | Halal food | H | 5 km | 8 |

Stored category `school` = a school whose level OSM doesn't state; it appears under both Primary
and Secondary as "School (level not stated)". Nothing is guessed.

Places the household added or pinned are always listed (up to 10 km), on top of the nearest N.
Hidden places collapse into "Hidden (n)". Distances are straight-line (haversine); walking time is
`distance × 1.3 ÷ 5 km/h`, rounded up, and labelled as an estimate.

Change radii/categories in `server/categories.ts` and bump `CATEGORIES_VERSION` so every location
is searched again.

## Sources

1. **OpenStreetMap via Overpass** (always on). One combined query per location
   (`server/overpass.ts → buildOverpassQuery`), radius + 150 m margin because searches are
   shared per ~100 m cell. Mirrors in order: overpass-api.de, overpass.kumi.systems,
   overpass.private.coffee; 25 s timeout each; User-Agent `Caddy/1.0 (private household app; +https://caddy-beryl.vercel.app)`;
   ≥1 s between calls. Classification (`server/classify.ts`):
   - childcare: `amenity=kindergarten|childcare`
   - schools: `amenity=school`, level from `isced:level` / `school:level` / `school`, then Irish
     names (secondary first: "Secondary", "Post-primary", "Community College/School",
     "Comprehensive", "Coláiste", "College"; then primary: "Primary", "National School", "NS",
     "Scoil", "Gaelscoil", "Educate Together", "Junior/Infant")
   - higher: `amenity=university|college`
   - bus: `highway=bus_stop` or `public_transport=platform` + `bus=yes` (stop number from `ref`)
   - mosque: `amenity=place_of_worship` + `religion=muslim`
   - halal: `diet:halal=yes|only`, `cuisine~halal`, or a food place / food shop with "halal" in
     its name. The detail line says which ("Tagged halal (diet:halal=yes)", "Halal in the name").
2. **Google Places (optional)**: on only when `GOOGLE_PLACES_API_KEY` is set. Text Search (New)
   with `"halal restaurant"` and `"mosque"`, circle `locationBias` at the category radius,
   `regionCode=IE`. **Only halal and mosques** use Google.
   - Field mask: `places.id,places.displayName,places.location,places.formattedAddress,places.googleMapsUri`.
     No `rating`, reviews or `userRatingCount`: those move every call from the Pro SKU
     (5,000 free calls/month) to Enterprise (1,000 free, ~$35 per 1,000). Keeping this mask keeps
     the household in the Pro tier. A unit test fails if the mask changes.
   - At most **40 Google calls per scheduled run** (2 per home; 15 homes per run = 30).
   - Results are labelled "Google search match: “halal restaurant”": Google's ranking, not a
     halal certification.
3. **Your places**: adults add a place (name, category, map tap or address, note), pin and hide
   places. Provenance `user`, private to the household (RLS).

### Cross-source dedupe (`server/dedupe.ts`)

Same category (unknown-level schools match primary/secondary), names similar after normalising
(accents, "St"→"Saint", punctuation, ≥60% word overlap or one name contained in the other) and
≤75 m apart → one place. Identical names up to 1 km apart are merged too (campuses mapped as
several OSM objects), except bus stops. Bus stops with different stop numbers are never merged.
Kept row: user > official > google > osm. Household marks on any merged copy are kept (a pin
wins over a hide), and pin/hide/unhide apply to every merged copy.

## Caching and terms

- `place_searches` keeps one row per source × ~100 m cell × category version. OSM is refreshed
  after 30 days, Google after 25 days. After a failure the job waits 20 h; the button can retry
  straight away, but the same location can only be looked up once a minute.
- OSM rows: `refresh_after = fetched_at + 30 days`; rows not confirmed for 30 days past that are
  hidden as probably gone.
- Google rows: the place id (`source_id`) may be kept indefinitely; other fields may be cached
  for at most 30 days. Every Google row has `refresh_after = fetched_at + 30 days`, it's
  refreshed after 25, expired rows are never shown and the daily job deletes them. Marks on a deleted Google row go with it;
  this only happens when no home near it has been refreshed for 30 days.
- Nominatim (address search): one request per form submit, identifying User-Agent, responses
  cached by Next.js for 7 days, Ireland/NI only.
- OSM data is © OpenStreetMap contributors (ODbL). The map shows "© OpenStreetMap contributors,
  OpenFreeMap" plus the style's own attribution.

## Scheduled job `places-refresh` (daily)

`src/modules/places/server/job.ts`, registered in `src/server/jobs/registry.ts`. Idempotency key
`places-refresh:<Dublin date>`. Steps: read anchors (`anchorsFromHousing`: `housing_listings` rows
with coordinates, read untyped and checked with zod), pick up to 15 with a due source
(never-searched first, then oldest), run Overpass (+ Google), upsert into `places`, log
`place_searches`, record one source check per home and source (`overpass · housing:<id>`), purge
expired Google rows. No notifications. It only writes global source rows: never user places or
household marks (unit-tested).

Until the Housing module's `housing_listings` table exists the job fails loudly ("Couldn't read
housing listings"); that's intended (failure ≠ zero results).

The on-demand button runs the same lookup through `runJob` as job type `places-lookup`
(trigger `manual`, household-scoped), so every lookup has a ledger row with source checks.

## Enabling Google Places

1. Create a Google Cloud project with billing, enable **Places API (New)**, create an API key
   restricted to that API.
2. Scheduled lookups: add the key as GitHub Actions secret **`GOOGLE_PLACES_API_KEY`**
   (`.github/workflows/daily.yml` already passes it to the job).
3. On-demand lookups in the app: add the same key in Vercel as a **Sensitive** environment
   variable `GOOGLE_PLACES_API_KEY` (Production + Preview), then redeploy.
4. Optionally set a daily quota cap in Google Cloud as a second safety net.

## Map

MapLibre GL JS **6.12.0** with OpenFreeMap's `liberty` style. MapLibre 6 starts its web worker
from a file next to its own module, which Turbopack doesn't copy, so the browser loads the
published ES module build from jsDelivr at the pinned version (`components/nearby-map.tsx`); the
npm package (devDependency) supplies types, and a unit test keeps both versions equal. If the
map can't load (no WebGL, CDN or tiles blocked) the panel says so and the lists keep working.
Verified in headless Chromium: module, worker, style, tiles and pins load; no horizontal scroll
at 390 px.

## Known gaps

- **Halal food in OSM is patchy** in Ireland: few places carry `diet:halal`. Google (when
  enabled) and your own additions fill the gap. Mosques are reasonably mapped in cities, less so
  for prayer rooms.
- **School levels**: many Irish schools in OSM lack `isced:level`; names usually decide, else
  "level not stated". Special schools often end up there.
- **Childcare** in OSM is incomplete versus the Tusla register.
- **Eircodes**: Nominatim doesn't know most full Eircodes (checked: `V94 T9PX` and routing key
  `V94` return nothing). The UI says so and asks for street and town.
- **Overpass mirrors** are often slow or reset from some networks. The dev sandbox could only
  reach overpass.private.coffee, which took 95–245 s and sometimes answered 200 with a
  `runtime error: Query timed out` remark (saved as a fixture; treated as "busy"). From GitHub
  Actions overpass-api.de is normally fast; watch the job's source checks.
- Walking times are straight-line estimates; real routing (openrouteservice) is a later add-on.

## Official registers (later enhancement, not built)

- **Department of Education school lists**: data.gov.ie lists "Data on Individual Schools"
  (primary and post-primary, annual XLSX/CSV on gov.ie / education.ie, modified 2026-09-22) and a
  Smart Dublin "Schools in Dublin Region" set (2019/20 XLSX). They include roll numbers and
  addresses; whether the current files carry Eircodes or coordinates (older lists had ITM
  easting/northing) was **not verified**. Would map to `source='official'`, `source_id=<roll number>`.
- **Tusla Early Years register** (ECCE/creches): published by Tusla; format and licence not
  checked here.
- **NTA/TFI GTFS** (`stops.txt` with stop ids, names and coordinates) would give authoritative
  bus stops and routes.

## Fixtures

- `castletroy-limerick.json`: real Overpass response for Castletroy (52.6738, −8.5530), fetched
  21 Oct 2026 from overpass.private.coffee (its OSM base was 1 Jun 2026), with a slightly older
  query (no radius margin, unrestricted shop clause).
- `ballincollig-timeout-remark.json`: real 200 answer with a timeout remark and no elements.
- `synthetic-mosque-halal.json`: **hand-built** in Overpass JSON format with invented names,
  because the city-centre query timed out from the sandbox.
