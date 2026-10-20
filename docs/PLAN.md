# Caddy — Product & Delivery Plan

**Status:** Agreed plan, v1.0 (20 Oct 2026)
**Source spec:** [`SPEC.md`](../SPEC.md) — the original "Personal Life Hub" blueprint. Where this plan and the spec disagree, **this plan wins** (see [§3 Deviations](#3-deviations-from-specmd)).
**Hosting:** Vercel (app) + Supabase (database, auth, files) + GitHub Actions (scheduled jobs and workers)
**Built with:** Claude Code cloud sessions, one PR per task

---

## 1. What Caddy is

A private PWA for one household (two adults) that you open every morning. It answers:

1. **Is there a new Cost Rental home we should apply for, and what's around it?**
2. **Which bills need reviewing, and what's our Work From Home tax evidence for this year?**
3. **Which utility contract is about to end, and is switching worth it?**
4. **What's on for the family this week?**
5. **What would that holiday actually cost all-in?**

Caddy is an organiser and early-warning system. It never applies, books, switches or files anything for you.

---

## 2. Decisions log (from the planning session)

| # | Topic | Decision | Why |
|---|-------|----------|-----|
| D1 | Name | **Caddy** | Matches repo; short home-screen label. |
| D2 | Scope | All modules eventually: Housing, Bills/Tax, Utilities, Family (incl. education), Travel | User choice. Controlled by strict release gates (§9). |
| D3 | Release order | **Housing → Bills/Tax → Utilities → Family → Travel** | Housing deadlines are time-critical, so it pays off first. Bills/Tax builds the document pipeline that Utilities reuses. |
| D4 | Users | **Two adults, separate logins**, one shared household | Same effort as a shared password; gives an audit trail. |
| D5 | Login method | **Email one-time code (OTP)**, not magic links | In iOS installed PWAs, magic links open in Safari, not the PWA, so you'd end up logged in to the wrong place. Codes work everywhere. |
| D6 | Travel | **Manual trip planner + deep links.** No live price search. | Amadeus self-service APIs shut down 17 Jul 2026; there's no free combined flight+hotel+board API. |
| D7 | Family organiser | **Full in-app organiser** (tasks, events, chores, lists, weekly view, education planner) + **iCal feed** out to Apple/Google + **"Share to WhatsApp"** buttons | Household currently uses a mix of Apple, Google and WhatsApp. One-way iCal avoids the Google OAuth trap (Testing-mode refresh tokens expire every 7 days). |
| D8 | Alerts | **In-app (primary) + Web Push + email digest** | Daily PWA use. iPhone push needs the app installed to Home Screen (iOS 16.4+). |
| D9 | Housing source | `https://newstarterhomes.ie/rent/` + each `/rent/<slug>/` page | Confirmed real via search index. You'll add the domain to the Claude Code environment's allowed list. |
| D10 | Neighbourhood | ECCE/childcare, primary, secondary, universities/colleges, bus stops, **halal restaurants, mosques** per listing | User requirement. |
| D11 | Halal data | **OpenStreetMap + your own curation**, plus an **optional Google Places adapter** (off until a key is added) | OSM halal tagging is patchy. Places fills the gaps but needs a billing card. |
| D12 | AI at runtime | **None.** Open-source PDF text extraction + OCR + per-supplier parsers | User choice. Also removes a cost and privacy dependency. |
| D13 | Housing news ("last 30 days") | **Agent-agnostic research contract.** Runs as a daily Claude Code Routine now; swappable to Gemini later | The app owns the prompt + JSON schema + ingest endpoint. Agents are interchangeable runners. |
| D14 | Job runner | **GitHub Actions cron** | Free minutes, long timeouts, can run Python/OCR and a headless browser, visible logs. Vercel Hobby cron is once a day with ±59 min jitter. |
| D15 | Visual direction | **Calm & clean, dense where it pays**, **Dracula (dark) / Alucard (light)** | Neon accents work as signals on a calm base. Desktop gets tables where scanning matters. |
| D16 | Devices | **Phone and desktop equally** | Bottom nav on phone, sidebar on desktop. Every screen is designed at both widths. |
| D17 | Design process | **Clickable HTML prototype first**, then code. Prototype: `docs/design/prototype.html` | Cheap to change; you test it on your phone before any app code. |
| D18 | Timeline | **2-day sprint** using parallel Claude Code cloud sessions (§9) | User requirement. 2-week usage gates become post-launch reviews. |
| D19 | Build cost | **All build work in Claude Code cloud sessions**; no separate API key; no runtime AI | User requirement. |

---

## 3. Deviations from SPEC.md

| SPEC says | Caddy does | Reason |
|-----------|-----------|--------|
| One shared household account | Two personal logins, one household | D4 |
| Optional AI extraction/summaries | No AI in the app. OCR + rules only. | D12 |
| `last30day` skill invoked by the app | App exposes a research contract; an external agent (Claude Code Routine / Gemini) fills it | D13. A coding-agent skill can't run inside Vercel. |
| Live flight/hotel/car provider adapters, weekly automated discovery | Manual candidates + deep links + total-cost engine; weekly *reminder* for saved trip windows | D6 |
| Supabase local via Docker as the main dev loop | Hosted **staging** Supabase project for dev/previews. Local Supabase only in CI. | Cloud dev containers can't reliably pull all Supabase images. CI runners can. |
| Vercel Cron / pg_cron | GitHub Actions cron | D14 |
| Utility tariff source adapters | **Manual offer entry** (you paste rates from bonkers.ie / switcher.ie) + deterministic calculator | No public Irish tariff API. Scraping comparison sites breaches their terms. |
| ~60 tables up front | Tables added per release (§6) | Avoid building plumbing nobody uses yet. |
| Research hub, decisions, finance modules | Deferred to after R5 | Not on the critical path for daily use. |

Everything else in SPEC.md still holds. In particular: no invented facts, failure ≠ zero results, users' application data is never overwritten, money in exact decimals, private files only, versioned tax rules with sources, and human approval for anything consequential.

---

## 4. Tech stack

Pin exact versions at scaffold time (latest stable that's at least 2 weeks old).

| Layer | Choice | Notes |
|-------|--------|-------|
| Language | TypeScript (strict) for app; Python 3.12 for the document worker | |
| Framework | Next.js (App Router), React | Server Components + Server Actions for mutations; route handlers for job/ingest endpoints. |
| UI | Tailwind CSS v4 + shadcn/ui (Radix primitives) + lucide icons | Themed via CSS variables (§8.3). |
| Forms | React Hook Form + Zod | Zod schemas shared between client, server and job payloads. |
| DB | Supabase Postgres | SQL migrations in `supabase/migrations`, generated TS types. RLS on every table. |
| DB client | `@supabase/ssr` + `supabase-js` | Service-role key only in GitHub Actions secrets and server-only code. |
| Auth | Supabase Auth, email OTP code | Invite-only: sign-ups disabled; second adult invited from Settings. |
| Files | Supabase Storage, private bucket, short-lived signed URLs | SHA-256 dedupe. |
| PWA | Serwist (`@serwist/next`) | Caches the app shell only. No private data in Cache Storage. |
| Push | Web Push (VAPID) via `web-push` | Subscriptions stored per device. |
| Email | Resend (free tier) | Digest only when something changed. Check current free-tier limits at setup. |
| Maps | MapLibre GL JS + OpenFreeMap tiles | Free, no API key. |
| Geocoding | Nominatim (OSM) from the worker, cached, 1 req/s, proper User-Agent | Runs once per new listing. |
| Amenities | Overpass API (OSM): schools, kindergartens/childcare, universities/colleges, bus stops, mosques (`amenity=place_of_worship` + `religion=muslim`), halal (`diet:halal`, `cuisine=*halal*`) | Plus official lists where available: Dept of Education school lists (data.gov.ie), Tusla early-years register, TFI/NTA GTFS stops. Verify formats in R1. |
| Optional | Google Places adapter for halal restaurants | Off by default. Respect Places caching terms (store place IDs; refresh other fields within allowed window). |
| Distances | Straight-line + walking estimate (labelled "estimate") | Proper routing (openrouteservice) is a later add-on. |
| Scraping | Node + `undici` + `cheerio`; Playwright only if a page needs JS | Polite: 1 request/sec, identifies itself, respects robots.txt. |
| Document worker | Python: `pypdf`/`pdfplumber` (text layer) → Tesseract or Docling OCR (images/scans) → per-supplier parsers → proposed fields | Avoid AGPL libraries (e.g. PyMuPDF) to keep licensing simple. |
| Currency (travel) | ECB daily reference rates | Free, official, dated. |
| Tests | Vitest, Testing Library, Playwright (e2e), pytest (worker), pgTAP / SQL tests for RLS | |
| Quality | ESLint, Prettier, `tsc --noEmit`, Ruff for Python | |
| CI | GitHub Actions | Lint, typecheck, unit, build, migration + RLS tests on `supabase start`, worker tests. |
| Hosting | Vercel Hobby (personal, non-commercial use) + Supabase Free ×2 (staging, prod) | Baseline **€0/month**. Optional: domain (~€15/yr), Google Places (likely within free allowance). |

### Known platform gotchas (designed around)

- **Supabase Free pauses after 7 days idle.** The daily housing job keeps prod awake. Staging may pause; that's fine.
- **Supabase Free has no backups we can rely on.** A nightly `pg_dump` and a storage manifest go to an encrypted GitHub Actions artifact (90-day retention), with a monthly restore test (§7.6).
- **GitHub cron runs in UTC and can be delayed.** Jobs compute the Europe/Dublin date themselves and use it as the idempotency key, so a delayed or doubled run is harmless.
- **iOS PWA:** push only after Add to Home Screen; OTP login (D5); test installs on both iOS Safari and Android Chrome.

---

## 5. Architecture

```text
 Phone / desktop (installed PWA)
        │  HTTPS
        ▼
 ┌──────────────────────── Vercel ─────────────────────────┐
 │ Next.js app                                              │
 │  • UI (RSC)          • Server Actions (mutations)        │
 │  • /api/ingest/*     (bearer-token, for jobs & agents)   │
 │  • /api/ical/<token> (private calendar feed)             │
 │  • src/server/domain (pure TS: money, dates, matching,   │
 │    tax rules, cost engines — no I/O, fully unit-tested)  │
 └───────────────┬──────────────────────────────────────────┘
                 │ supabase-js (user session, RLS)
                 ▼
 ┌──────────────────────── Supabase ───────────────────────┐
 │ Postgres (+RLS)   Auth (email OTP)   Storage (private)  │
 └───────────────▲──────────────────────────────────────────┘
                 │ service role (secrets in GitHub only)
 ┌───────────────┴──────── GitHub Actions ─────────────────┐
 │ housing-daily     06:15 UTC  crawl → diff → notify      │
 │ amenities         after housing-daily, new listings only│
 │ documents         on upload (repository_dispatch) + 6h  │
 │                   sweep; Python OCR + parsers           │
 │ reminders-daily   contract T-14, deadlines, digests,    │
 │                   web push, email                       │
 │ backup-nightly    pg_dump + storage manifest, encrypted │
 │ ci                PR checks                             │
 └──────────────────────────────────────────────────────────┘

 ┌──────── Research agents (swappable) ────────┐
 │ Claude Code Routine (daily)  ── or ──  Gemini│
 │ reads research/prompts/*.md, outputs JSON    │
 │ matching research/schema/*.json, POSTs to    │
 │ /api/ingest/research                          │
 └──────────────────────────────────────────────┘
```

**Rules of the architecture**

1. **Modular monolith.** One Next.js app, with modules under `src/modules/<name>`. Domain logic lives in `src/server/domain` and has no I/O.
2. **Jobs share code with the app.** Job scripts in `scripts/jobs/*.ts` import the same domain services. The Python worker is the only other codebase, and it only proposes document fields.
3. **Job ledger.** Every run writes a `job_runs` row: idempotency key, status (`queued|running|succeeded|partial|failed`), per-source checks, counts, error. The UI shows "Last checked 07:14 · OK" or "Failed: source unreachable" on every monitored item.
4. **Provenance on every fact.** Values carry a `source_kind` from: `official | provider | osm | google | estimate | user | ocr-proposed`. The UI renders it as a small tag.
5. **User-owned fields are never written by jobs.** These include application status, outcomes, notes and confirmed document fields. This is enforced in code and covered by tests.

### 5.1 Research contract (agent-agnostic, D13)

```text
research/
  prompts/housing-news.md        # task: last-30-day Irish Cost Rental news, Limerick priority
  schema/research-result.json    # JSON Schema (generated from the Zod ResearchResult in SPEC §5.3)
  README.md                      # how to run with Claude Code Routine / Gemini CLI / by hand
```

- Endpoint: `POST /api/ingest/research`, `Authorization: Bearer $RESEARCH_INGEST_TOKEN`. It validates with Zod, dedupes by URL and content hash, and stores items as `reported` or `unverified`. Nothing becomes "confirmed" without an official-source URL.
- **Claude Code Routine:** a daily routine that starts a fresh cloud session in this repo, runs the prompt, validates the output against the schema, and POSTs it. The cloud environment needs the app domain and news/official domains allowed.
- **Gemini swap:** the same prompt and schema run via Gemini CLI, e.g. in a GitHub Action. Verify the auth model at swap time: CI usage typically needs a Gemini API key rather than a consumer subscription login.
- If no run arrives for 36h, the Housing page shows "News: no update since …". Silence is never shown as "no news".

---

## 6. Data model (added per release)

All tables: UUID PK, `household_id` (indexed, RLS-scoped), `created_at`/`updated_at`, money as `numeric(12,2)` + `currency char(3)`, timestamps `timestamptz` (UTC), dates as `date` where only a date is meant.

**R0 – Core:** `households`, `household_members` (people incl. kids, no login), `user_profiles` (auth users → household), `notifications`, `push_subscriptions`, `audit_events`, `job_runs`, `job_source_checks`, `household_preferences`.

**R1 – Housing:** `housing_listings`, `housing_observations` (snapshot + hash + change summary), `housing_applications` (user-owned), `housing_projects` (pipeline, `cost_rental_confirmed: yes|no|unconfirmed`), `places` (geocoded listings + amenities, provenance), `listing_places` (listing ↔ place, category, distance_m, walk_min_estimate), `curated_places` (your halal/other additions), `research_items`, `research_sources`.

**R2 – Bills & tax:** `documents` (storage path, sha256, mime, status), `document_extractions` (extractor, version, proposed JSON, confidence), `document_links` (document ↔ any entity + purpose), `expenses`, `tax_years`, `tax_rules` (jurisdiction, year, version, rule JSON, Revenue URL, reviewed_at), `tax_evidence_items`, `wfh_days` (per person per month).

**R3 – Utilities:** `utility_contracts` (end date, `comparison_due_on` generated = end − 14 days), `utility_bills` (→ document), `usage_profiles` (derived from bills), `tariff_offers` (manually entered, source URL, checked date), `utility_comparisons`, `utility_comparison_options`.

**R4 – Family:** `tasks` (recurrence rule, assignee, related entity), `events`, `lists` + `list_items`, `schools` (education planner, reuses `places`), `school_applications`, `ical_tokens`.

**R5 – Travel:** `travel_profiles`, `trips` (dates, travellers with ages-at-travel), `trip_candidates`, `trip_components` (flight/hotel/transfer/car/other, `is_estimate`, booking URL, checked_at), `fx_rates`.

---

## 7. Module designs

### 7.1 Housing (R1)

**Matching:** a listing matches if `(bedrooms = 3 AND property_type = house)` OR `bedrooms = 4` (any type). Listings often have mixed unit types, so matching runs **per unit type**, and the listing matches if any unit type does. If the type is unknown it shows as "possible match – check", never as a silent drop.

**Daily run (`housing-daily`):**
1. Fetch `/rent/` and follow pagination or "load more" until exhausted. Record pages fetched.
2. Fetch every listing page, not just new ones, so status and deadline changes are caught.
3. Parse to a normalised snapshot. Unknown fields stay `null`; nothing is inferred.
4. Hash the snapshot and compare it with the last observation. Write an observation with a change summary when it differs.
5. Status rules: open / closing soon (≤7 days) / closed / unknown. Closed listings are kept forever.
6. Sanity guard: if the index page returns 200 but **zero** listings parse, mark the run `failed (parser)`, not "0 results".
7. Enqueue amenity lookup for new listings. Create notifications for new matches, changed matches and deadlines ≤7 days.

**Listing detail tabs:** Overview (rents by unit type, deadline, provider, source link) · **Nearby** (map + grouped list) · History (observations timeline) · Application (your status, dates, exact outcome text, next action, linked documents).

**Nearby panel:** groups for Childcare/ECCE, Primary, Secondary, Further/Higher ed, Bus stops, Mosques, Halal food. Each item shows its distance, a walk estimate and a provenance tag (OSM / Official / Google / You). It carries the label "Distances are estimates; proximity ≠ school admission." You can add places, pin favourites and hide wrong ones. Search radii are configurable (default 2 km for most, 500 m for bus stops, 10 km for universities).

**Pipeline (Limerick priority):** manual project entries with stage and a Cost Rental confirmation state. St Joseph's Hospital and The Gasworks / Dock Road are seeded as **unverified leads**. Research items can be linked to projects.

### 7.2 Bills & tax (R2)

**Flow:** Upload (camera, file or share sheet) → private storage → SHA-256 duplicate check → `documents` row `processing` → GitHub `repository_dispatch` → Python worker:
1. Extract the text layer (`pdfplumber`). If there's no text, run OCR (Tesseract; try Docling if layouts are poor).
2. Detect the supplier (keywords, IBAN/VAT numbers).
3. Run that supplier's parser, if one exists, to get total, VAT, period, invoice no., account ref (masked), and for energy bills kWh by period, unit rates and standing charge.
4. Generic fallback: amounts, dates and invoice numbers by regex, all with low confidence.
5. Write `document_extractions` as **proposed** with per-field confidence and the matched snippet.

**Review screen:** the original on one side and proposed fields on the other. Confirm or edit each field, then link the document to an expense, a utility contract or a tax year. The original file is stored once and linked many times.

**Supplier parsers:** written for the suppliers you actually use (tell us which in R2). Each needs 2–3 **redacted** sample bills as fixtures. Real bills never go in the repo.

**WFH relief (Ireland):** rule stored in `tax_rules` with Revenue source URL and version:
`relief_base = (bills_total × wfh_days ÷ days_in_year) − employer_allowance; claimable = relief_base × 30%` for 2022+. Inputs are electricity, heating and broadband, apportioned when shared. Output shows each figure step by step. Statuses are kept separate: paid / potentially relevant / estimated claimable / actually claimed. Exports are CSV plus a printable year summary. Caddy never files anything.

### 7.3 Utilities (R3)

- Contracts store an end date. `comparison_due_on = end_date − 14 days` is computed in Europe/Dublin calendar days, and updates when the end date changes. The `reminders-daily` job fires **once** on or after that date, and notes when it ran late. **No monthly comparisons.** Past end dates are flagged for review rather than triggering a flood of jobs.
- **Compare:** your usage profile comes from confirmed bills (day/night/peak kWh, gas kWh). You enter 1–5 offers from bonkers.ie or switcher.ie: rates, standing charge, discount and its duration, cashback, exit fee. A deterministic calculator gives first-year and following-year cost with all assumptions shown. Bord Gáis is excluded from recommendations, and dual fuel is compared against separate suppliers.
- Mark an offer rejected, selected or negotiating. Expected savings are checked against later bills.

### 7.4 Family & education (R4)

- Tasks (assignee, due, recurrence, linked entity), events, chores, shopping and household lists, plus a **week view** with conflict detection.
- "Create task" from any housing deadline, contract, trip or school record.
- A **private iCal feed** (secret URL, revocable) of events and deadlines that you subscribe to in Apple or Google Calendar. Google refreshes these slowly, so the feed isn't real-time.
- **Share to WhatsApp** (`wa.me`/share-sheet link) on any task, list or event. A WhatsApp bot is out of scope: Meta's Business API isn't built for personal family groups.
- **Education planner:** schools you're tracking, with admission policy links and checked dates, open days, application deadlines, preference order and fallbacks. It reuses `places` from Housing.

### 7.5 Travel planner (R5)

- Trip brief: adults, children with **ages at travel** (confirmed per trip), departure airports (DUB default; SNN, ORK), date window, nights, budget, board basis and room needs.
- Deep-link generators open Skyscanner, Google Flights, Booking and similar sites prefilled. You paste back what you find as **components**, each with price, provider, checked time and inclusions/exclusions.
- The total-cost engine converts currencies with dated ECB rates, shows a per-person breakdown and what's included or excluded, and ranks by total cost with your hard constraints and adjustable weights. Trade-offs are explained, never hidden.
- Weekly job: a **reminder** for saved trips whose window is approaching or whose prices were checked >7 days ago. Results are never presented as live data.

### 7.6 Operations (all releases)

- `backup-nightly`: `pg_dump` + storage object list → encrypted with `age` → GitHub artifact (90 days). A **monthly restore test** into staging runs as a scheduled workflow.
- Settings → Data: export everything (JSON + CSV + original files zip) and delete account/household.
- Settings → Jobs: last run per job, failures and source status.

---

## 8. UI design

### 8.1 Direction: "Calm & clean, dense where it pays"

- **Calm base:** generous spacing, one card style, few borders, short labels. The Today screen should be readable in 10 seconds.
- **Colour means something:** accents are used only for status, never for decoration (§8.3).
- **Dense where it pays:** at ≥1024 px, Housing listings, expenses and tax evidence switch from cards to sortable tables with filters.
- **Provenance is visible but quiet:** small tags like `Official`, `OSM`, `Estimate`, `You`, `Proposed`.
- **Freshness everywhere:** "Checked 07:14 · OK" or "Failed 07:14 · retry".

### 8.2 Navigation

| Phone (bottom nav) | Desktop (left sidebar) |
|---|---|
| **Today** · **Housing** · **Money** (Bills, Tax, Utilities) · **Family** · **More** (Travel, Inbox, Settings) | Today, Housing, Bills, Tax, Utilities, Family, Education, Travel, Inbox, Settings, Jobs |

Global search arrives in R2 (once there's enough data to search).

### 8.3 Theme tokens (Dracula / Alucard)

| Token | Dark (Dracula) | Light (Alucard) | Use |
|---|---|---|---|
| `--bg` | `#282A36` | `#FFFBEB` | Page |
| `--surface` | `#2E303E`* | `#FFFFFF`* | Cards |
| `--line` | `#44475A` | `#E3DCC2`* | Borders, dividers |
| `--fg` | `#F8F8F2` | `#1F1F1F` | Text |
| `--muted` | `#9AA5CE`* | `#6C664B` | Secondary text |
| `--purple` | `#BD93F9` | `#644AC9` | Primary action, focus |
| `--green` | `#50FA7B` | `#14710A` | New / open / success |
| `--orange` | `#FFB86C` | `#A34D14` | Closing soon / due |
| `--red` | `#FF5555` | `#CB3A2A` | Failed / overdue / closed |
| `--cyan` | `#8BE9FD` | `#036A96` | Links / info |
| `--yellow` | `#F1FA8C` | `#846E15` | Needs review / estimate |
| `--pink` | `#FF79C6` | `#A3144D` | Your own picks (saved, curated) |

\* Derived values, to be tuned in the prototype. Dracula's stock comment colour `#6272A4` is only ~3:1 on `#282A36`, which **fails WCAG AA for body text**, so `--muted` is a lighter derived tone. Every text/background pair is contrast-checked in the prototype. Theme options: System (default) / Light / Dark.

**Type:** Instrument Sans for UI; JetBrains Mono (a nod to Dracula's editor roots) for money, dates and reference numbers, always with tabular numerals.

### 8.4 Screens to prototype (design phase)

1. **Today:** new matches, closing soon, bills to review, contract countdown, this week's family items, job health strip.
2. **Housing list:** cards on phone, table on desktop, with filters (county, beds, status, applied).
3. **Listing detail:** Overview / **Nearby** (map + grouped amenities) / History / Application.
4. **Bill review:** original + proposed fields + link targets.
5. **Tax year:** WFH calculation breakdown, evidence checklist, export.
6. **Utility contract:** countdown, usage profile, offer comparison table.
7. **Family week:** week view, tasks, lists, share to WhatsApp.
8. **Trip compare:** candidates side by side with total cost and inclusions.
9. **Inbox + Settings** (theme, alerts, push, members, jobs, data export).

Every screen comes in phone and desktop versions, light and dark, with **empty, loading, failed and offline** states for the first three screens.

### 8.5 Design phase process

1. I build a single clickable HTML prototype (fake but realistic Irish data) and publish it as a private link you can open on your phone.
2. You click through and leave comments; we do 2–3 iterations.
3. Approved prototype → `docs/design/` (screens + tokens) → becomes the visual spec for R0.3 onward.

---

## 9. Delivery plan: 2-day sprint

**Target:** every module working and deployed within 2 days, built entirely in Claude Code cloud sessions.
The original 42-PR, 3–4 month plan is replaced by **~14 larger PRs**. Modules are built in **parallel cloud sessions** once the foundation is merged.

### What "done in 2 days" means

| In the 2 days | After the 2 days (can't be compressed) |
|---|---|
| All 5 modules usable, deployed to Vercel + Supabase prod | 7 consecutive unattended morning runs of the housing check |
| Core logic unit-tested (matching, change detection, money, T-14 dates, WFH calc, trip totals) | Supplier parsers tuned on your real (redacted) bills |
| RLS tests, CI green, backups running | iPhone/Android install + push tested by you on your phones |
| Scheduled jobs live in GitHub Actions | The 2-week real-use check per module (now a post-launch review, not a gate before building) |

**Your time is the bottleneck, not coding.** You'll need about 30 minutes of account setup before Day 1 (§9.1), then roughly 15-minute review/merge windows every 2–3 hours.

### 9.1 Prerequisites (you, before Day 1 build starts)

1. **GitHub:** set `main` as the default branch (repo → Settings → General → Default branch).
2. **Supabase:** create an account and **two projects**: `caddy-staging` and `caddy-prod` (region: West EU / Ireland). Create a **personal access token** (Account → Access Tokens).
3. **Vercel:** sign in with GitHub and import `saajunaid/caddy` (framework: Next.js). Don't add env vars yet; the scaffold PR lists them.
4. **Cloud environment:** add the extra domains and variables listed in §10.
5. **Optional, Day 2:** Resend account + API key (email digest); Google Cloud key for Places (halal coverage).

### 9.2 Day 1: foundation + Housing

| Block | PR | Contents (plan task IDs) | Runs |
|---|---|---|---|
| A | **PR-1 Foundation** | Next.js scaffold, Tailwind + Dracula/Alucard tokens from the prototype, app shell (sidebar/bottom nav), PWA (Serwist, manifest, icons, offline banner), lint/typecheck/test/CI, SessionStart hook (0.3, 0.4) | This session |
| A | **PR-2 Data + auth** | Supabase migrations (core tables), RLS + RLS tests, email OTP login, invite second adult, audit events, generated types (0.5, 0.6) | This session |
| A | **PR-3 Jobs + alerts + deploy** | `job_runs` ledger, job runner, GitHub Actions templates, ingest endpoint auth, in-app inbox, Web Push, Vercel prod deploy, nightly encrypted backup (0.7, 0.8, 0.9) | This session |
| B | **PR-4 Housing engine** | newstarterhomes.ie fixtures, parser, matching, observations/change detection, `housing-daily` workflow, sanity guard, notifications (1.1–1.4) | Parallel session 1 |
| B | **PR-5 Housing UI** | List (cards/table), filters, detail tabs, history, application tracker, create-task-from-deadline (1.5) | Parallel session 2 |
| B | **PR-6 Neighbourhood** | Geocoding, Overpass + official school/ECCE lists, `places`, Nearby tab with MapLibre map, curation, optional Google Places adapter (1.6, 1.7) | Parallel session 3 |
| B | **PR-7 Pipeline + news** | Limerick pipeline projects, research contract (prompt + schema + ingest), news panel, Claude Code Routine set up (1.8, 1.9) | Parallel session 4 |

**Day 1 exit:** both adults log in on their phones, the housing check has run once from GitHub Actions against the live site, and listings with neighbourhoods show in the app.

### 9.3 Day 2: the other four modules + hardening

| Block | PR | Contents | Runs |
|---|---|---|---|
| C | **PR-8 Documents + tax** | Upload (camera/PDF), private storage, dedupe, Python worker (text layer → OCR → parsers), review queue, expenses, document links, tax years, WFH rule + calc, CSV/printable export (R2) | Parallel session 1 |
| C | **PR-9 Utilities** | Contracts, bill→usage profile, T-14 scheduling (DST tests, no monthly runs), offer entry, cost calculator, Bord Gáis exclusion, savings tracking (R3) | Parallel session 2 |
| C | **PR-10 Family + education** | Members, tasks + recurrence, events, week view + clashes, lists, iCal feed, Share to WhatsApp, education planner (R4) | Parallel session 3 |
| C | **PR-11 Travel** | Trip briefs, travellers/ages, components, deep links, ECB FX, total-cost engine + ranking, weekly reminder (R5) | Parallel session 4 |
| D | **PR-12 Today + search + email** | Today screen wired to real data, global search, Resend email digest | This session, after C merges |
| D | **PR-13 Hardening** | Security review (RLS, secrets in bundle, signed URLs), export/delete, restore test, Settings → Jobs | This session |
| D | **PR-14 Docs** | README setup, runbooks, `docs/integrations/*` | This session |

**Day 2 exit:** every module usable on prod, CI green, a backup restored into staging, and a checklist handed to you for phone testing and the first week of monitoring.

### 9.4 Keeping parallel sessions from colliding

- PR-1 to PR-3 create every shared file first: nav registry, theme, DB client, types, job runner, notification API. Module sessions only **add** files in `src/modules/<module>`, `src/app/(app)/<module>`, `scripts/jobs/<module>*`, `.github/workflows/<module>*`.
- Each module gets its own migration file with a module-specific timestamp block, so migrations never conflict.
- Shared-file edits a module needs (e.g. one nav entry) are kept to one-line additions; conflicts are resolved by the merging session.
- Merge order inside a block doesn't matter. Each PR must be green on its own.

---

## 10. How we use Claude Code cloud sessions

1. **All development runs as Claude Code cloud sessions** on your account: this session, plus the parallel sessions it starts for Blocks B and C. Nothing in the build uses a separate Anthropic API key, and the app itself makes **no AI calls at runtime** (D12). The daily housing-news routine is also a Claude Code session.
2. **One draft PR per row** in §9. CI runs on every PR, and Vercel posts a preview URL. You check it on your phone, then merge.
3. **`CLAUDE.md`** carries the non-negotiables so parallel sessions all follow the same rules.
4. **SessionStart hook** (PR-1) installs pnpm and Python deps automatically in every new session.
5. **Cloud environment settings** (environment menu → Edit → Network access → Custom → Allowed domains, keep "Also include default list of common package managers" ticked):
   ```text
   newstarterhomes.ie
   *.newstarterhomes.ie
   overpass-api.de
   *.overpass-api.de
   overpass.kumi.systems
   nominatim.openstreetmap.org
   *.supabase.co
   api.supabase.com
   *.vercel.app
   data.gov.ie
   www.ecb.europa.eu
   tiles.openfreemap.org
   ```
   **Environment variables** (staging only; prod secrets live only in Vercel and GitHub):
   ```text
   SUPABASE_ACCESS_TOKEN=<personal access token>
   SUPABASE_STAGING_PROJECT_REF=<staging project ref>
   NEXT_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging anon/publishable key>
   ```
   Anyone using this environment can read its variables. It's your personal environment, so that's only you, but never put **prod** keys here.
6. **Parallel sessions** follow §9.4. This session coordinates: it starts them, reviews their PRs and merges in order.

---

## 11. Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Scope sprawl: all 5 modules built, none used daily | **High** (the classic failure for "life OS" apps, and higher with a 2-day build) | Today screen surfaces only what needs action; weekly 10-minute review for the first month; cut or simplify any module unused after 2 weeks. |
| 2-day build quality | Medium | Core logic unit-tested; CI must be green per PR; known gaps listed in each PR; hardening PR-13 before real bills are uploaded. |
| Overpass API resets connections from the dev sandbox | Medium | Use a mirror (`overpass.kumi.systems`) in dev; production lookups run in GitHub Actions with caching. |
| newstarterhomes.ie changes markup | Medium | Fixture tests, parser sanity guard (200 + zero parsed = failure), failure alert. |
| Site terms/robots disallow automated access | Unknown | Checked in 1.1 before building the crawler; fallback is a daily "check manually" reminder + quick-add form. |
| Halal/childcare data incomplete in OSM | High | Provenance tags, curation, optional Google Places, official lists for schools/ECCE. |
| OCR poor on phone photos | Medium | Supplier parsers on digital PDFs first; everything goes through review; nothing auto-confirmed. |
| Supabase Free: pausing, no backups | Medium | Daily job keeps prod alive; own encrypted backups + monthly restore test. |
| iOS PWA quirks (push, login, storage eviction) | Medium | OTP login, push only after install, no reliance on local storage for data. |
| Research agent output wrong or invented | Medium | Schema validation; nothing "confirmed" without an official URL; runs logged; agent swappable. |
| Tax rule changes / misreading Revenue guidance | Low–Med | Versioned rules with source URL and review date; Caddy shows evidence and estimates, never advice. |
| Free tiers change | Medium | Usage page; portable code (plain Postgres + Next.js); no vendor-only features in the domain layer. |

---

## 12. Open items (answer when we reach them)

- **R1.1:** Does the site allow automated access (robots/terms)? Is listing content in the HTML or loaded by JavaScript?
- **R1.6:** Which areas or counties should be the default focus besides Limerick? Default search radii OK?
- **R2.4:** Which electricity, gas and broadband suppliers do you use? Please provide 2–3 redacted bills each.
- **R2.6:** Which adults claim WFH relief? Does an employer pay the €3.20/day allowance?
- **R4:** Kids' names/ages for member profiles. Which schools to track?
- **Optional:** custom domain? Google Places key for halal coverage?
