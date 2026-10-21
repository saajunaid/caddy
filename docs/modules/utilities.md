# Utilities module

Utility contracts, a reminder exactly 14 days before each one ends, and a transparent cost
comparison of offers using the household's own usage (PLAN §7.3, SPEC §3.3 and §6).

Caddy never switches supplier, contacts a supplier or acts on a decision. It tells you when to
look and does the sums.

## Where things live

| What | Path |
| --- | --- |
| Migration | `supabase/migrations/20261021350000_utilities.sql` |
| DB tests (RLS, `comparison_due_on`) | `tests/db/utilities.test.ts` |
| Pure logic (Node-runnable, unit-tested) | `src/modules/money/utilities/server/*.ts` |
| Daily job `utilities-due` | `src/modules/money/utilities/server/job.ts`, registered in `src/server/jobs/registry.ts` |
| Data loading (RLS client) and server actions | `src/modules/money/utilities/{data,actions}.ts` |
| Components | `src/modules/money/utilities/components/` |
| Pages | `src/app/(app)/money/utilities/` (`/`, `/new`, `/[id]`) |

Tables: `utility_contracts`, `utility_usage`, `tariff_offers`, `utility_comparisons`,
`utility_preferences`. There's no `household_preferences` table yet, so supplier exclusions live
in `utility_preferences` (one row per household, default `{"Bord Gáis Energy"}`; no row means the
default applies).

## The 14-day rule

- `comparison_due_on` is a generated column: `contract_end - 14`. It's calendar-date arithmetic,
  so daylight saving can't shift it, and it updates whenever the end date changes.
  `comparisonDueOn()` in `server/due.ts` does the same in TypeScript.
- "Today" is always the Europe/Dublin calendar date (`dublinDate`).
- `dueState(end, today)` returns one of:
  - `unknown_end`: no end date. The household is asked for it once (no push).
  - `not_due`: before the due date, with days until due and until the end.
  - `due`: today is the due date.
  - `late`: after the due date, up to and including the end date. If the alert hasn't been sent
    yet (the job missed the day, or the contract was added late), it's sent once and says how
    late it is.
  - `ended`: past the end date. Flagged for review once per end date, never repeatedly.
- Dedupe keys (one notification each, ever):
  - `utilities:due:<contract_id>:<end_date>`
  - `utilities:ended:<contract_id>:<end_date>`
  - `utilities:unknown-end:<contract_id>`

  The end date is part of the key, so renewing a contract (a new end date) re-arms the reminder.
- Never monthly. A test walks a full year and finds exactly one due day.
- Only `active` contracts are checked. `switching` and `ended` contracts get no alerts.

### Job `utilities-due`

Group `daily`, idempotency key `utilities-due:<Dublin date>`. For every active contract it
computes the due state and creates the alert above. For contracts in their window (`due` or
`late`) that have offers, it also stores one `utility_comparisons` snapshot (trigger `due`,
deduped per contract and end date). It records each source it reads in `job_source_checks`; a
failed read fails the run rather than reporting zero contracts. The summary reads like
"5 contracts checked · 2 comparisons due · 1 ended, needs review · 1 without an end date".

The job only ever writes `notifications` and `utility_comparisons`. It never touches contracts,
usage, offers, decisions or preferences; `job.test.ts` checks this.

## Usage profile

Built from the contract's own bill periods (`server/usage.ts`). National averages are never used:
no usage means no comparison.

- Bill periods are inclusive, as printed on Irish bills ("1 Sep – 30 Sep" = 30 days).
- Each band (day, night, peak, 24-hour, gas) is annualised over the days *that band* was
  recorded: `kWh × 365 ÷ days`, kept as an exact fraction.
- Coverage is reported as "Based on 312 days of bills, Sept 2025–Jul 2026, scaled up to a full
  year". Seasonal differences aren't adjusted, and the table says so.
- Fewer than 60 days of bills → "Estimate (limited data)".
- Bands the meter should record (from the meter type) but no bill has are flagged; costs would be
  understated.
- Overlapping periods (beyond a shared meter-read day) are refused on entry and flagged if present.

## Cost model

`server/cost.ts` and `server/compare.ts`. Exact rational arithmetic with bigint; each output
(year 1, year 2, saving) is rounded once, half away from zero, to whole cents.

For each offer:

1. **Units** = Σ annual kWh × unit rate (c/kWh, before VAT), for every band the household uses.
   If the offer has no rate for a band the household uses, it's **not comparable**. Caddy
   doesn't guess.
2. **Discount**: `discount % × min(months, 12) ÷ 12` of the unit cost (pro-rated by month over
   year 1), plus the standing charge if the offer says so. For broadband, mobile and insurance,
   the discount applies to the price.
3. **Standing charge** per year, before VAT (for non-energy contracts: the annual price).
4. **VAT** at the offer's rate (default 9% for energy, 23% for broadband/mobile, 0% for
   insurance; the household can change it).
5. **Cashback** comes off year 1 only.
6. **Exit fee** (for leaving the current contract early) is added to year 1 only if the assumed
   switch date is before the contract end. By default the switch date is the end date, so there's
   no exit fee. Staying on the renewal price never costs an exit fee.

Year 2 = (units + standing charge) × (1 + VAT): no discount, cashback or exit fee.

"vs renewal" is the year-1 saving against the offer marked as the current supplier's renewal
price. Ranking is by year-1 cost. Suppliers on the exclusion list are shown as "Excluded by your
preference" and never ranked or recommended. If the current supplier is excluded, its renewal
price still shows as the baseline. The **PSO levy** is left out because it's identical across
suppliers; the table says so.

**Dual fuel vs separate**: when the household has an electricity and a gas contract (or a dual
fuel contract), Caddy finds the cheapest comparable electricity offer and gas offer (separate
pair) and the cheapest dual fuel offer, priced on the combined usage, and shows the year-1
difference. Exclusions apply on both sides; no exit fees are assumed.

Every figure comes with its assumptions as sentences, and a per-offer breakdown ("How year 1 is
worked out").

## Entering offers

1. Open the contract and use the bonkers.ie or switcher.ie link to find two to five offers.
   Caddy only links to these sites; it never scrapes them (their terms forbid it).
2. Add each offer: unit rates in **cents per kWh before VAT** (e.g. 34.20), the standing charge
   in **€ a year before VAT** (multiply a daily charge by 365), discount % and how many months it
   lasts, cashback, the exit fee for leaving your current contract early, VAT %, the page you
   copied it from and the date you checked it.
3. Tick "current supplier's renewal price" on the renewal offer from your supplier's letter.
   It's the baseline for savings.
4. Mark offers Selected, Negotiating or Rejected. That's a note for you; nothing happens
   automatically.
5. "Save this comparison" stores a snapshot, so expected savings can be checked against later
   bills. The 14-day reminder saves one automatically when offers exist.

Rates below 1 c/kWh are refused as probably being in euros. Offers checked more than 30 days ago
are flagged "check again". Account labels with seven or more digits are refused, in both the form
and the database, so full account numbers, MPRNs and GPRNs are never stored.

## Limits and follow-ups

- Usage is entered by hand for now. `utility_usage.source = 'bill'` and `document_id` are ready
  for the Bills module to fill from confirmed bills (no foreign key, as documents belong to
  another module).
- Discounts longer than 12 months, tiered rates, free-electricity hours, EV tariffs,
  microgeneration export and price changes during the year aren't modelled. Year 2 assumes
  today's prices.
- Seasonal shape isn't adjusted when scaling less than a year of bills.
- Realised savings against later bills aren't compared yet (snapshots are stored for it).
- Pages render inside the Money layout (tabs) owned by the Documents module. They use `h2`
  headings and expect that layout to provide the page's `h1`.
- Deviation from PLAN §6: `usage_profiles` and `utility_comparison_options` aren't separate tables.
  The profile is computed on the fly from `utility_usage`, and options are stored in
  `utility_comparisons.results` (jsonb). `utility_bills` is replaced by `utility_usage`, which
  links to a document by id.
