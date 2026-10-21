# Housing: Cost Rental Watch

Every morning Caddy reads every Cost Rental listing on newstarterhomes.ie, keeps its history,
works out whether it suits the household, and alerts both adults. It never applies for anything.

## Screens

- **`/housing`** — freshness line from the latest `housing-daily` run, the matching rule, filter chips
  (Open matches · Closing soon · Applied · Closed · All, via `?filter=`), a county select
  (`?county=`), cards on phones and a sortable table at ≥1024px (`?sort=first_seen|rent|closes|title&dir=`).
  Newest first. "Closed" shows closed matches and anything you applied to; "All" shows every listing.
  The "Cost Rental news" panel lists research items from the last 30 days and warns when no
  research run has arrived for 36 hours.
- **`/housing/[id]`** — tabs via `?tab=overview|nearby|history|application`. Overview: unit table
  (rent, homes, match) and key facts with provenance tags; unknowns read "Not stated". Nearby: a
  placeholder (`components/listing-nearby.tsx`) that the Nearby module replaces. History: every
  observation with its change summary. Application: the household's own tracking form.
- **`/housing/pipeline`** — future developments, Limerick first, with confirmation chips and
  verification tags, add/edit forms and links to where to verify. Two Limerick leads are seeded
  as unverified.

## Matching rule (`server/matching.ts`)

Per unit type: **3 bedrooms and a house → match; 4+ bedrooms of any type → match; 3 bedrooms
with the type not stated → possible.** 3-bed apartments and duplexes don't match. A unit whose
bedrooms aren't stated is possible unless the listing's "Bedrooms" summary rules out 3+ beds, and a
listing with no information at all is possible. The listing's level is the best of its units.
"Possible" is never dropped silently: it shows (yellow) and alerts like a match, labelled "check
details".

## Daily job (`housing-daily`)

Registered in `src/server/jobs/registry.ts`, group `daily`, run by `.github/workflows/daily.yml`
(05:55 UTC). Idempotency key `housing-daily:<Dublin date>`, so a late or repeated trigger does
nothing once the day succeeded (failed/partial runs retry up to 3 times when triggered again).

1. **Discover** — follow `/rent/?page=N` to the end (one source check per page) and the calendar
   view (one source check). A page that loads but yields no listings is recorded as a failed
   source; on page 1 it fails the whole run (sanity guard) and sends a "Housing check failed"
   alert.
2. **Read** — fetch every listing that isn't closed, every new one and any whose status changed;
   closed listings are re-read once a week on a fixed weekday per listing (spreads the load). One aggregate source check per batch of 25; a page that
   fails is named in the check's error and the rest still save.
3. **Save** — upsert `housing_listings` by `(source, external_id)`; write a `housing_observations`
   row on first sighting and whenever the content hash changes, with a change summary
   ("Rent for 4 bed house changed €1,780 → €1,720", "Closing date set to 6 Nov",
   "Status changed to closed"). The hash excludes the URL and map pin. Status becomes
   `closing_soon` when an open listing closes within 7 days (no new observation for that).
4. **Missing listings** — only after a complete crawl (every page read and the count matches),
   listings not seen get `missed_runs + 1`. After 3, an open/unknown listing becomes `unknown`
   with a note; a closed one stays closed with the note. Nothing is ever deleted
   (foreign keys are `on delete restrict`).
5. **Geocode** — pages carry a map pin (`#map[data-center]`, provenance "provider"). Only listings
   without one are looked up on Nominatim (≤25 per run, 1.1 s apart, identifying User-Agent);
   the query is stored so the same address is never looked up twice. One source check
   ("Nominatim geocoding", `skipped` when nothing needed it).
6. **Alerts** (all households, all of Ireland), with stable dedupe keys:
   - new or newly matching/possible listing that isn't closed — `housing:<slug>:match` /
     `housing:<slug>:possible` ("New 4-bed match: <title>, <locality>");
   - a match closing within 7 days — `housing:<slug>:closing:<closing date>`;
   - a match that reopens — `housing:<slug>:reopened:<date>`;
   - a failed check — `housing:check-failed:<date>`.
7. **Summary** — e.g. `203 listings checked · 1 match · 2 new` ("match" counts open or coming-soon
   listings that match or possibly match), plus stats in `job_runs.stats`.

The job never reads or writes `housing_applications` (`server/store.ts` has no way to), which is
covered by unit tests and a database test that upserts a listing next to an application.

### Re-running

- GitHub → Actions → "Daily jobs" → Run workflow, job `housing-daily`. A day that already
  succeeded is skipped; to force a re-check delete that day's `job_runs` row (idempotency key
  `housing-daily:YYYY-MM-DD`) first.
- Locally (never against production):
  `SUPABASE_URL=… SUPABASE_SECRET_KEY=… NODE_USE_ENV_PROXY=1 node --experimental-strip-types scripts/jobs/run.ts job housing-daily`
  (`NODE_USE_ENV_PROXY=1` only in the sandbox).

## Housing news (research contract)

See `research/README.md`. `POST /api/ingest/research` validates with Zod (`server/research.ts`),
upserts `research_items` by URL, records a `housing-news` job run and alerts on officially
confirmed or Limerick items.

## Data

| Table | Who writes | Who reads |
|---|---|---|
| `housing_listings`, `housing_observations` | daily job (service role) | any adult in a household |
| `research_items` | ingest endpoint (service role) | any adult in a household |
| `housing_projects` | any adult in a household (column grants; `updated_by` stamped by trigger) | any adult in a household |
| `housing_applications` | the household only (RLS; `household_id`/`listing_id` can't be changed; no deletes) | the household only |

Saving an application or project writes an `audit_events` row (status only, never notes text).

## Code map

- `server/` (plain-Node, used by the job): `parser.ts`, `values.ts`, `snapshot.ts`, `changes.ts`,
  `matching.ts`, `upsert.ts`, `alerts.ts`, `geocode.ts`, `http.ts`, `store.ts`, `job.ts`,
  `research.ts`, `ingest-research.ts`; `testing/` holds the in-memory store and fixture fetcher.
- App: `queries.ts` (server-only reads), `actions.ts` (server actions), `display.ts`, `forms.ts`,
  `components/`.

## Known limits

- Provider names are only on ~2% of listing pages; elsewhere "Not stated" (we don't infer one from
  the apply link).
- Pages without a unit table only give bedroom counts, so a 3-bed there is "possible".
- Income limits and eligibility text in listing descriptions aren't parsed.
- If newstarterhomes.ie changes its markup, fixture tests and the sanity guard catch it; the parser
  needs updating (see `docs/integrations/newstarterhomes.md`).
- The Nearby tab is a placeholder until the Nearby module is merged. "Create task" from a deadline
  belongs to the Family module and isn't here.
