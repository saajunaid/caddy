# Personal Life Hub --- Complete Application Specification

**Document status:** Implementation blueprint\
**Version:** 1.0\
**Date:** 15 October 2026\
**Primary environment:** Local workstation during development\
**Initial hosting target:** Supabase + Vercel\
**Product scope:** Household and personal-life management\
**Separate product:** Seerah Learning (not part of this repository)

------------------------------------------------------------------------

## 1. Executive summary

Build **Personal Life Hub**, a mobile-friendly Progressive Web App (PWA)
for one household. It consolidates household records, recurring
monitoring, family planning, bills, tax evidence, travel discovery, and
decision support into one application.

The system must be designed to work reliably without depending on an AI
model for routine operations. Use deterministic code for calculations,
dates, rules, deduplication, scheduling, data validation, and alerts.
Use AI only as an optional enhancement for unstructured-document
extraction, summarization, research synthesis, and natural-language
assistance. Every AI-derived value must be reviewable and must not
silently overwrite confirmed data.

The product should be inexpensive to operate. Prefer free/open-source
libraries, local development, a small number of managed services,
provider adapters, caching, and scheduled batch work. Do not promise
zero ongoing cost: third-party flight/hotel data, OCR, AI, X access,
email/SMS, and production scheduling may have quotas or fees. The app
must expose those dependencies and degrade gracefully when a provider is
unavailable.

### Product boundaries

This repository contains **Personal Life Hub only**. Seerah Learning is
a separate future application with its own content model, source
management, learning progress, maps, and editorial workflow. Do not
include professional software-development tools, Caddis, coding-agent
workbenches, or fraud/assurance work.

### Core product principles

1.  **One application, specialist modules.** Modules share identity,
    household records, documents, scheduling, research, notifications,
    and audit history.
2.  **One household, minimal access control.** Initially use one shared
    household account, not an elaborate role/permission system. Protect
    credentials and allow later migration to separate adult accounts.
3.  **Local-first development, cloud-portable design.** Develop on a
    workstation with local services; deploy later without rewriting
    business logic.
4.  **PWA first.** Responsive, installable on phones, usable from
    desktop, with an offline shell and clear offline states.
5.  **Automation with evidence.** Scheduled jobs save source URLs,
    timestamps, run results, and changes. A failed check must not be
    reported as "no results."
6.  **Low AI dependency.** Critical workflows and reports must work
    without a model API.
7.  **Human approval for consequential actions.** Never automatically
    submit housing applications, make purchases, book travel, send
    important correspondence, or file tax claims.
8.  **Cross-module documents.** A utility bill is one document with
    linked purposes: utility comparison, contract evidence, household
    spending, and potential tax evidence. Do not duplicate the original
    file unnecessarily.
9.  **No invented facts.** Unknown values remain unknown. Estimates,
    assumptions, provider-reported facts, official facts, and AI
    interpretations must be distinguishable.
10. **Privacy by default.** Household financial, tax, travel, and family
    data are private. Do not expose private files through public URLs or
    client-side secrets.

------------------------------------------------------------------------

## 2. Recommended technology stack

### Recommended initial stack

  -----------------------------------------------------------------------
  Layer                   Choice                  Reason
  ----------------------- ----------------------- -----------------------
  Language                TypeScript, strict mode Shared types across UI,
                                                  server actions, APIs,
                                                  and tests

  Framework               Next.js App Router      Responsive web
                                                  application, server
                                                  routes, PWA support,
                                                  deployment portability

  UI                      React + Tailwind CSS +  Fast iteration,
                          accessible component    responsive design,
                          primitives              broad ecosystem

  Forms/validation        React Hook Form + Zod   Typed validation and
                                                  reliable data entry

  Database                PostgreSQL via Supabase Relational data, SQL,
                                                  indexes, constraints,
                                                  row-level security

  Authentication          Supabase Auth           Low-friction login;
                                                  initial shared
                                                  household account

  File storage            Supabase Storage,       Bills, receipts,
                          private bucket          statements,
                                                  correspondence and
                                                  travel documents

  Database migrations     Supabase CLI +          Repeatable local and
                          checked-in SQL          hosted environments
                          migrations              

  Background jobs,        Supabase scheduled      Jobs should not depend
  initial                 jobs/`pg_cron` where    on a browser tab being
                          suitable; Vercel Cron   open
                          for HTTP-triggered      
                          jobs; local scheduler   
                          during development      

  Long-running work       Database-backed job     Avoid duplicate or lost
                          queue with              runs
                          leases/retries; use a   
                          separate worker if      
                          execution exceeds       
                          platform limits         

  Testing                 Vitest, Testing         Unit, component and
                          Library, Playwright     end-to-end coverage

  Lint/format             ESLint + Prettier +     Consistent code quality
                          TypeScript checks       

  PWA                     Web app manifest +      Installability and
                          service worker (use a   offline shell
                          maintained              
                          Next.js-compatible PWA  
                          approach)               

  Document parsing        Native text extraction  Minimize paid AI/OCR
                          first; optional OCR     dependence
                          adapter (e.g. Tesseract 
                          locally)                

  Charts                  Lightweight chart       Keep bundle and
                          library only where      maintenance cost low
                          useful                  

  Hosting target          Vercel + Supabase       Simple deployment path;
                                                  can be replaced later

  Research                Pluggable research      Integrate existing
                          adapters with source    routines without
                          registry                coupling core logic to
                                                  one agent/provider
  -----------------------------------------------------------------------

Pin dependency versions and review maintenance/security status before
adoption. Do not add a library solely because it is fashionable.

### Why this stack

-   Next.js + TypeScript gives the coding agent a well-supported
    structure and keeps most code in one repository.
-   Supabase provides PostgreSQL, authentication, private object
    storage, and a practical path from local development to hosted use.
-   Vercel simplifies Next.js deployment. It is not the database and
    should not be assumed to provide unlimited background execution.
-   PostgreSQL stores structured household data and job state reliably.
-   The PWA is a web application that can be installed on phones; it
    does not require separate native iOS and Android code.

### Near-zero-cost strategy

1.  Develop locally first; do not create paid production services before
    the first usable module.
2.  Use Supabase local development via the Supabase CLI and Docker where
    practical.
3.  Use local document parsing and deterministic calculations before
    paying for OCR/AI.
4.  Cache research results and use incremental change detection.
5.  Run daily Cost Rental checks once each morning, not hourly.
6.  Run utility comparison only when a contract's expiry date triggers
    the two-week window or the user requests it manually.
7.  Run holiday discovery weekly and avoid repeating expensive searches
    for unchanged criteria.
8.  Use email/in-app notifications before SMS or paid messaging.
9.  Keep optional provider integrations disabled until credentials and
    costs are understood.
10. Maintain a usage/cost dashboard showing job count, external calls,
    tokens where applicable, storage and failures.

Free tiers and quotas change. Before deployment, check the current terms
and limits of the selected hosting, database, search, travel, and AI
providers. Never design the application around an assumption that a free
tier is permanent.

------------------------------------------------------------------------

## 3. Product modules

### 3.1 Home dashboard

A household dashboard showing:

-   New or changed housing opportunities.
-   Housing deadlines and user-maintained application statuses.
-   Utility contract expiry countdown and next comparison date.
-   New household documents awaiting classification/review.
-   Potential tax evidence not yet categorized.
-   Upcoming family events and tasks.
-   Saved holiday opportunities and weekly holiday-finder summary.
-   Failed background jobs or sources needing attention.
-   Latest research findings with evidence links.
-   A daily/weekly digest based on meaningful changes only.

Dashboard sections must be configurable. Show last-success timestamps
and stale-data warnings for monitored sources.

### 3.2 Housing & Cost Rental Watch

#### Requirements

-   Primary listing source: `https://newstarterhomes.ie/rent/`
-   Run once every morning in the `Europe/Dublin` time zone.
-   Capture **all** matching listings, following pagination, "load
    more", filters, and individual listing pages until all available
    entries are checked.
-   Match every 3-bedroom house and every 4-bedroom property regardless
    of property type.
-   Store every observed listing and changes over time; closed listings
    must not vanish from history.
-   Display newest listings first.
-   Include location, provider/landlord, bedrooms, property type, rent,
    units where confirmed, deadline/status, source URL, first-seen date,
    last-checked date, applied/not applied, and user-reported result.
-   The user manually updates application state and outcome. Scraping
    must never overwrite user application data.
-   Preserve exact wording of reported outcomes and distinguish listing
    status from application status.
-   Include future development pipeline, with Limerick priority. Clearly
    distinguish confirmed Cost Rental supply from unconfirmed
    possibilities.
-   Track nearby childcare/ECCE/creche, primary/secondary schools,
    FET/PLC, colleges, universities and technological universities where
    reliable information is available. Distances and journey times must
    be labelled as estimates; proximity is not proof of school
    admission.
-   Provide filters, comparison, map view where supported, export, saved
    properties and change history.
-   Keep rent, bedroom mix, units, application deadline and Cost Rental
    status unknown unless supported by evidence.

#### Future development pipeline

Track development/project name, area, local authority, provider, total
homes if confirmed, Cost Rental homes if confirmed, bedroom mix if
confirmed, stage, official expected dates, source and next monitoring
action.

Seed previous leads only as unverified research leads, not established
facts: - St Joseph's Hospital, Limerick --- previously noted as a
possible mixed-tenure development; Cost Rental allocation needs current
verification. - The Gasworks / Dock Road, Limerick --- previously noted
as a possible development; Cost Rental allocation needs current
verification.

Check current official updates from the LDA, Limerick City and County
Council, relevant AHBs/providers and project delivery partners. Never
represent a lead as confirmed without a primary source.

#### Application tracker

Store: - Listing/development link. - Applied flag and application
date. - User-reported result and exact result text. - Provider status
and application status as separate fields. - Queue/lottery status, when
explicitly provided. - Deadline and next action. - Supporting
correspondence/document links.

Never submit applications or enter private information into a housing
portal automatically.

#### Reporting

Daily report sections: 1. Run date/status and sources checked. 2. New
matches, changed listings, approaching deadlines and source failures. 3.
All current matching listings, newest first. 4. Changes since prior run.
5. Future pipeline, with Limerick priority. 6. Relevant news published
in the previous 30 days. 7. Application tracker and next actions. 8.
Evidence and uncertainty notes.

### 3.3 Utilities & Household Savings Analyzer

#### Requirements

-   Store utility providers, account/service type, contract start/end
    dates, tariff, rates, discounts, standing charges, meter type,
    time-of-use periods, bills and usage.
-   Support electricity, gas, dual fuel and later broadband/mobile/home
    insurance.
-   Exclude Bord Gáis from supplier recommendations.
-   Prioritize smart-meter time-of-use comparisons and compare dual-fuel
    against separate-supplier options.
-   Calculate first-year cost from bill-specific usage, not generic
    national averages.
-   Include standing charges, unit rates, peak/day/night periods, VAT,
    discounts, cashback, exit fees and discount duration where
    applicable.
-   Display all assumptions and compare like-for-like periods.
-   Store expected savings and later compare against realized bills.
-   Track renewal/contract expiry automatically.
-   **Do not run a monthly utility comparison.** Schedule a comparison
    for 14 calendar days before the stored contract end date. Create a
    reminder/job when the end date is saved or changed. Recalculate the
    trigger if the date changes. If the date is already past, flag it
    for user review rather than creating a flood of jobs.
-   Provide a manual "Compare now" action.
-   Alert about a price-change notice if detected, but do not
    automatically switch suppliers.
-   Permit the user to mark an offer as rejected, selected, or awaiting
    negotiation.

#### Cost calculation

Use deterministic, tested calculation code. Store tariff data and its
source/date. Do not ask an AI model to perform the authoritative
arithmetic.

For each tariff, calculate a transparent annualized estimate from the
user's usage profile and tariff periods. If usage data is incomplete,
label the estimate and show which inputs are missing. Compare first-year
and subsequent-year cost where introductory offers expire.

### 3.4 Bills, Expenses & Irish Tax Evidence

This is a cross-cutting document and expense workflow, not a separate
duplicate copy of the utility system.

#### Upload and ingestion

Support PDF, JPG, PNG, and common image formats; later support email
import. On upload: 1. Store the original file in a private bucket. 2.
Compute a checksum to detect duplicate uploads. 3. Record upload time
and source. 4. Extract embedded PDF text or image metadata locally where
possible. 5. Use local OCR if needed and configured. 6. Optionally use
an AI extraction provider only if enabled. 7. Save extracted fields as
**proposed**, with confidence and source-page/bounding evidence where
available. 8. Ask the user to confirm uncertain values. 9. Classify the
document and link it to relevant modules.

Extract where available: - Supplier/merchant. - Invoice/receipt date and
service period. - Invoice/receipt number. - Total, net, VAT and
currency. - Payment due date and payment status. - Line
items/categories. - Contract or account reference (mask in normal UI
where appropriate). - Address/service location. - Document type and
confidence. - Potential tax relevance (never a definitive eligibility
decision).

#### Cross-module reuse

A single electricity bill can be linked to: - Utility tariff/usage
analysis. - Household expense reporting. - Contract and supplier
history. - A tax-year evidence collection for working from home, if
relevant.

Keep one original file and multiple typed links/annotations. Do not
duplicate the document for each use case.

#### Irish tax evidence

-   Start with Ireland; design tax rules with a jurisdiction and
    tax-year key so more jurisdictions can be added later.
-   Provide tax-year folders, expense categories, evidence checklist,
    totals, export and a report of missing/uncertain information.
-   Support a "potential work-from-home relief evidence" category and
    configurable categories for other claims only after official
    eligibility/rules are checked.
-   Preserve dates, amounts, supplier and original evidence.
-   Distinguish expense paid, expense potentially relevant, amount
    potentially claimable, and amount actually claimed.
-   Do not assume the entire utility bill is tax-deductible. Apply only
    explicit, versioned rules supported by current Revenue guidance, and
    show the official source and applicable tax year.
-   The system is an evidence organizer and estimator, not a tax adviser
    or automated tax-filing service.
-   Do not submit a claim or Revenue return. Require the user to review
    the evidence and calculations.
-   Include CSV and PDF/printable year-end evidence summaries.
-   Store rule version, source URL, effective dates and calculation
    breakdown with every estimate.

### 3.5 Family Organizer

-   Shared family calendar, tasks, reminders and recurring chores.
-   Events and tasks linked to family members, trips, school activities
    or applications.
-   Grocery/household supply lists.
-   Due dates and recurring reminders.
-   Conflict detection and weekly view.
-   Minimal access model: household members initially share the
    household workspace. Do not build complex per-field permissions in
    version 1.
-   Future option: individual adult logins and child profiles without
    accounts.

### 3.6 Education Planner

-   Track school research, admission policies, open days, applications,
    preference order, deadlines and fallback options.
-   Track correspondence, forms and meetings.
-   Compare schools using subjects, pathways, distance/transport and
    source-backed admission facts.
-   Track childcare/ECCE/creche and future education needs.
-   Keep official admission policy sources and checked dates.
-   Do not infer acceptance probability without a defensible model; do
    not present proximity as proof of eligibility.

### 3.7 Family Travel & Holiday Finder

#### Purpose

Discover affordable family trips automatically, then produce a complete,
comparable itinerary rather than a bare list of flights or hotels.

#### Search profile

Allow the user to configure per search: - Number of adults. - Number of
children and ages at travel. - Departure airports: Dublin by default,
with Shannon and Cork also selectable. - Flexible date range, trip
length, school-holiday windows and date flexibility. -
Destinations/regions: Europe, Asia, North Africa, warm-weather
destinations, or user-selected countries/cities. - Total family budget
and optional component budgets. - Meal plan: self-catering, room only,
breakfast, half-board, full-board, all-inclusive. - Room configuration:
family room, apartment, connecting rooms, or multiple rooms. - Baggage
requirements, seats if priced, transfers, public transport or car
rental. - Car class, child seats, driver/age constraints and rental
insurance assumptions. - Hotel rating/quality floor, cancellation
preferences, pay-later preference, beach/city/nature preferences and
accessibility needs. - Travel documents/visa considerations to review.

Store reusable family defaults, but require the user to confirm child
ages for each travel period because ages change.

#### Background discovery

-   Run a discovery job once per week by default.
-   Perform additional checks only when a supported deal signal exists,
    the user changes search criteria, or a trip window is approaching.
-   Avoid redundant provider calls using query fingerprints, caching and
    rate limits.
-   Keep a record of the exact dates, occupancy, baggage, board basis
    and assumptions used in each result.
-   Support "Search now" and saved trip briefs.
-   Notify only for results that meet configurable thresholds, such as
    total cost, travel duration, suitable family occupancy, or a
    material price drop.
-   If reliable live data cannot be accessed, show the provider's last
    checked timestamp and label the result stale or unavailable.

#### Complete itinerary requirements

For each candidate, combine where available: 1. Outbound and return
flights, airports, dates, flight times, stops, duration, baggage,
seat/child-related charges and fare restrictions. 2. Accommodation, room
type, exact occupancy, number of rooms, meal/board basis, taxes/fees,
cancellation terms and payment terms. 3. Transfers or public transport,
with estimated cost and travel time. 4. Optional car rental, insurance
assumptions, fuel/charging, tolls, parking and child seats. 5. Other
required costs that are known and relevant. 6. Total cost for the whole
family and per-person breakdown. 7. Booking links for each component,
with provider, checked timestamp and caveats. 8. Trade-offs: cheaper but
longer flights, less flexible cancellation, farther accommodation,
different board basis, baggage exclusions, etc. 9. Destination context
and current travel advisories/entry requirements, linked to official
sources.

Do not fabricate an itinerary by combining incompatible dates, room
occupancy, fare conditions, or unavailable offers. Clearly mark
components that are estimates or have not been verified.

#### Travel provider strategy

There is no guarantee that a reliable, unrestricted, free API provides
live flight fares, hotel inventory, meal plans, baggage-inclusive
pricing, and car rentals together. Build separate provider adapters for
flight search, accommodation, transfers/car rental, currency conversion
and destination information. Prefer official or licensed APIs,
affiliate/deep links, or user-approved provider searches. Check terms
before scraping. Do not bypass bot protection or access controls.

If a provider has no supported API, the app may provide a clearly
labelled manual/deep-link workflow instead of pretending it has live
data. A user must approve all bookings and payments.

#### Ranking

Rank by **estimated total family trip cost** first, subject to hard
constraints: - valid dates and family occupancy; - acceptable flight
duration/stop count; - selected meal plan; - budget ceiling, if set; -
minimum accommodation and cancellation requirements.

Show score components and allow the user to change weights. Do not hide
a substantially cheaper option just because its hotel rating is lower;
explain the trade-off.

### 3.8 Research & Opportunities

Shared interface for research jobs used by Housing, Utilities, Travel,
Education and other modules. It must not replace specialist module
logic.

-   Research question, date window, target geography/topic, sources and
    expected output.
-   Research run history, query fingerprint and source status.
-   Source evidence, publication date, retrieval date, excerpts, claim
    type and verification state.
-   Duplicate detection and links to existing entities.
-   "Lead", "reported", "officially confirmed", "contradicted" and
    "needs verification" states.
-   Save a finding into a module only after rule-based matching or user
    confirmation.
-   Manual research and scheduled research use the same result schema.

### 3.9 Documents & Correspondence

-   Searchable private document store.
-   OCR/text extraction, document classification and metadata.
-   Link documents to bills, applications, contracts, trips, schools and
    tax years.
-   Track correspondence, contact date, subject, response, next action
    and deadlines.
-   Draft follow-ups using stored context, but require user review
    before sending.
-   Export selected documents and metadata.
-   Support retention/deletion controls.

### 3.10 Household Finance

-   Categorize expenses and recurring payments.
-   Monthly/annual household summaries and savings goals.
-   Compare expected vs actual utility savings.
-   Identify duplicates and unusual amounts for review, not as
    definitive fraud claims.
-   Link receipts and bills to tax evidence and supplier records.
-   Bank integration is not required for MVP; allow CSV import later.
-   Do not store banking credentials.

### 3.11 Personal preferences and decision memory

Store household defaults and explicit exclusions: - Country/tax
jurisdiction. - Currency and timezone. - Departure airports. - Family
composition and travel preferences. - Housing filters. - Utility
supplier exclusions and tariff priorities. - Alert thresholds and
notification preferences. - Decisions, alternatives, rationale, evidence
and review date.

Preferences must be editable and inspectable. AI must not silently
change them.

------------------------------------------------------------------------

## 4. Shared application architecture

Use a **modular monolith** initially. Keep clear module boundaries in
folders and services, but do not split into microservices before there
is a demonstrated need.

``` text
Browser / installed PWA
        |
        v
Next.js application
  |-- UI and module pages
  |-- authenticated server actions / route handlers
  |-- domain services (pure, testable TypeScript)
  |-- provider adapters
  |-- job enqueue/status APIs
        |
        +------ Supabase Auth
        +------ PostgreSQL
        +------ private Supabase Storage
        +------ scheduled job trigger / worker
                    |
                    +-- Cost Rental source adapter
                    +-- Utility tariff/source adapters
                    +-- last30day skill adapter
                    +-- X/xAI adapter (if configured)
                    +-- flight provider adapters
                    +-- hotel provider adapters
                    +-- car/transfer adapters
                    +-- OCR/AI adapters (optional)
```

### Important execution distinction

A PWA service worker is not a reliable scheduler for daily background
jobs. Browsers may suspend or terminate it. All essential scheduled jobs
must run on a server, managed scheduler, or an always-on local worker.

During development, run jobs explicitly or through a local scheduler. In
production, use Vercel Cron or Supabase scheduling to invoke a protected
job endpoint, or a durable worker if a task exceeds serverless execution
limits. Use database-backed job records and idempotency so retries are
safe.

For local hosting reachable from the internet, use a secure tunnel/VPN
such as a private mesh VPN where possible. Do not expose the development
server or database directly to the public internet. A tunnel does not
replace authentication.

------------------------------------------------------------------------

## 5. Reusable research adapter and `last30day` skill

### 5.1 Requirement

The existing housing workflow requires a real inspection of the
installed skill named `last30days`, `last30day`, or its documented
equivalent. Do not assume the skill name, path, command syntax,
dependencies or supported providers. The coding agent must inspect the
actual workstation and document what it finds.

### 5.2 Skill discovery checklist

During initial setup, the coding agent must:

1.  Search the supported local agent/skill directories for `last30days`
    / `last30day` and documented equivalents.
2.  Read the complete skill instructions and any referenced supporting
    files.
3.  Identify required runtimes, packages, environment variables, API
    keys, CLI tools, and invocation syntax.
4.  Determine whether it supports xAI/X (Twitter), general web research,
    date filtering, and structured output.
5.  Check license/terms and whether use is compatible with scheduled
    non-interactive execution.
6.  Create a local integration note at
    `docs/integrations/last30day-skill-audit.md` recording the
    discovered path, version/commit if available, dependencies, command
    examples, required secrets by variable name (never values),
    limitations, and test results.
7.  Do not copy credentials into the repository or logs.
8.  If unavailable or incompatible with scheduled execution, report this
    clearly and use a native research fallback. Never claim a source was
    checked if it was not.

The exact skill installation may differ between AGY, Claude Code, and
other agents. The application must not depend on a particular coding
agent being present in production.

### 5.3 Adapter contract

Define a provider-neutral interface such as:

``` ts
export type ResearchRequest = {
  topic: string;
  geography?: string[];
  publishedAfter: string; // ISO date
  publishedBefore?: string; // ISO date
  preferredSources?: string[];
  requiredSourceTypes?: Array<"official" | "news" | "social" | "provider">;
  maxResults?: number;
};

export type ResearchEvidence = {
  title: string;
  url: string;
  sourceName: string;
  sourceType: "official" | "news" | "social" | "provider" | "unknown";
  publishedAt?: string;
  retrievedAt: string;
  excerpt?: string;
  claims?: string[];
  verification:
    | "officially-confirmed"
    | "corroborated"
    | "reported"
    | "unverified"
    | "contradicted";
  confidence?: number;
};

export type ResearchResult = {
  request: ResearchRequest;
  provider: string;
  startedAt: string;
  completedAt: string;
  status: "success" | "partial" | "failed";
  evidence: ResearchEvidence[];
  warnings: string[];
};
```

The interface is illustrative; the implementation agent must validate it
against actual provider responses and use runtime schema validation
(e.g. Zod). Keep the skill invocation behind an adapter; do not call
shell commands directly from UI code.

### 5.4 Research execution order

1.  Build the request with explicit publication date bounds.
2.  Invoke the installed skill adapter if it passes the local audit and
    is available in the execution environment.
3.  Run official-source checks and provider-specific queries required by
    the module.
4.  Run the configured xAI/X research adapter where credentials and
    access permit.
5.  Normalize, deduplicate and persist evidence.
6.  Cross-check important claims against primary sources.
7.  Mark unsupported claims as unverified.
8.  Return partial results with warnings if some sources fail.
9.  Save the run log even if it fails.
10. Notify only on meaningful, verified or explicitly labelled leads.

### 5.5 Housing use of the last-30-day workflow

The daily housing report must include a separate rolling 30-day news
section: - new Cost Rental schemes and application launches; - future
Limerick developments; - AHB, LDA and local-authority housing
delivery; - planning decisions, construction, completion, allocations
and lottery outcomes; - confirmed bedroom mix, rents, application dates
and eligibility changes; - Irish Cost Rental policy or application
procedure changes.

For each item store headline, publication date, summary,
location/provider, Cost Rental confirmation state, sources and
verification note. Deduplicate multiple articles about the same
announcement. Social posts can be leads but must not substitute for
official confirmation.

### 5.6 Other modules

Use last-30-day research selectively: - Utilities: current offers,
tariff changes and relevant regulatory updates. - Education: admissions
and policy updates. - Travel: entry rules, advisories, disruption and
deal signals. - General research: user-selected topic and time window.

Do not run this skill for simple calendar operations, calculations,
document metadata extraction or other tasks where recent research adds
no value.

------------------------------------------------------------------------

## 6. Background jobs and scheduling

All jobs must be stored in a database-backed job ledger. Jobs need a
unique idempotency key, status, attempt count, lock/lease, timestamps,
last error, and a safe retry policy. Prevent overlapping runs for the
same job and date window.

### Required schedules

  -----------------------------------------------------------------------
  Job                     Schedule / trigger      Behaviour
  ----------------------- ----------------------- -----------------------
  Cost Rental Watch       Daily morning,          Check all source pages
                          `Europe/Dublin`         and all matches;
                                                  compare against prior
                                                  observations; write
                                                  report

  Cost Rental news        Included in daily       Rolling 30-day
                          housing run or separate research; persist
                          bounded subtask         source evidence and
                                                  source failures

  Utility contract        When contract           Enqueue comparison; no
  reminder                saved/changed, schedule monthly comparison
                          for 14 days before      
                          expiry                  

  Utility comparator      14 days before contract Recalculate actual
                          end; also manual        first-year costs using
                          "Compare now"           latest bill/usage and
                                                  current eligible
                                                  tariffs

  Utility price-change    Optional, low-frequency Detect a verified
  monitor                 and source-dependent    supplier notice; do not
                                                  switch automatically

  Holiday discovery       Weekly                  Search saved travel
                                                  profiles within
                                                  configured windows;
                                                  notify only qualifying
                                                  deals

  Holiday deal recheck    Triggered by supported  Refresh only relevant
                          price-drop signal or    candidates;
                          approaching travel      provider-dependent
                          window                  

  Document processing     On upload               Extract, classify,
                                                  deduplicate and request
                                                  confirmation of
                                                  uncertain fields

  Tax-year review         Configurable reminder   Prepare evidence
                          before/at Irish         summary and
                          tax-year filing/review  missing-document
                          period                  checklist; do not file

  Calendar reminders      Due-date-driven         Notify based on
                                                  user-configured lead
                                                  times

  Health/maintenance      Daily/weekly as         Report stale jobs,
  checks                  appropriate             expired credentials and
                                                  source failures
  -----------------------------------------------------------------------

### Job status

`queued`, `running`, `succeeded`, `partial`, `retrying`, `failed`,
`cancelled`.

A failed source must be visible as a failure. "Zero listings found" is
valid only if the source was successfully checked. Store per-source
status in each run.

### Utility expiry logic

-   Store `contract_end_date` as a date in the contract's relevant local
    timezone.
-   Set `comparison_due_at = contract_end_date - 14 days`.
-   Reschedule if the date changes.
-   If contract expiry is unknown, ask the user to enter it or mark it
    unknown; do not infer a date from a bill unless it explicitly states
    it.
-   If the comparison job was missed, run once at next opportunity and
    explain it was late.
-   Do not schedule monthly comparisons.
-   Support contracts with different end dates independently.

### Low-cost schedule strategy

Batch compatible research tasks, cache unchanged queries, use bounded
retries with exponential backoff and jitter, and cap calls per provider
per run. Avoid polling a provider every few minutes if it does not
support change notifications.

------------------------------------------------------------------------

## 7. Database schema

Use UUID primary keys, `timestamptz` for event timestamps, ISO currency
codes, explicit timezones, foreign keys and check constraints. Add
`created_at`/`updated_at` to mutable tables. Store source/evidence
metadata for claims that may change.

The schema below is a logical model, not a complete migration. The
implementation agent must create ordered SQL migrations, indexes,
constraints, RLS policies and tests.

### 7.1 Core household

-   `households`: `id`, `name`, `timezone` (default `Europe/Dublin`),
    `country_code` (`IE`), `default_currency` (`EUR`), `created_at`.
-   `household_members`: `id`, `household_id`, `display_name`,
    `relationship_label`, `date_of_birth` (optional), `is_active`,
    `created_at`.
-   `household_preferences`: `id`, `household_id`, `key`, `value_json`,
    `updated_at`.
-   `user_profiles`: `id` linked to Supabase Auth, `household_id`,
    `display_name`.
-   `tasks`: `id`, `household_id`, `title`, `description`, `due_at`,
    `status`, `priority`, `module_key`, `related_entity_type`,
    `related_entity_id`, `created_by`, `completed_at`.
-   `calendar_events`: `id`, `household_id`, `title`, `starts_at`,
    `ends_at`, `timezone`, `location`, `notes`, `related_entity_type`,
    `related_entity_id`.
-   `notifications`: `id`, `household_id`, `type`, `title`, `body`,
    `severity`, `source_run_id`, `dedupe_key`, `created_at`, `read_at`,
    `action_url`.
-   `decisions`: `id`, `household_id`, `title`, `decision_date`,
    `options_json`, `chosen_option`, `rationale`, `review_at`, `status`.
-   `audit_events`: `id`, `household_id`, `actor_id`, `action`,
    `entity_type`, `entity_id`, `metadata_json`, `created_at`. Never log
    secrets or full sensitive document text.

### 7.2 Source registry and research

-   `sources`: `id`, `name`, `base_url`, `source_type`, `module_key`,
    `is_enabled`, `terms_url`, `notes`.
-   `research_runs`: `id`, `household_id`, `module_key`, `provider`,
    `query_fingerprint`, `request_json`, `started_at`, `completed_at`,
    `status`, `warning_count`, `error_summary`.
-   `source_checks`: `id`, `research_run_id`, `source_id`, `checked_at`,
    `status`, `http_status`, `items_seen`, `error_code`,
    `error_message`.
-   `source_evidence`: `id`, `research_run_id`, `source_id`, `url`,
    `title`, `published_at`, `retrieved_at`, `excerpt`, `claim_type`,
    `verification_status`, `confidence`, `content_hash`.
-   `scheduled_jobs`: `id`, `household_id`, `job_type`, `module_key`,
    `scheduled_for`, `status`, `idempotency_key`, `attempt_count`,
    `locked_until`, `started_at`, `completed_at`, `last_error`,
    `payload_json`.
-   `job_run_events`: `id`, `scheduled_job_id`, `event_type`, `message`,
    `metadata_json`, `created_at`.

### 7.3 Documents and expenses

-   `documents`: `id`, `household_id`, `storage_path`,
    `original_filename`, `mime_type`, `file_size`, `sha256`,
    `document_type`, `document_date`, `supplier_name`, `currency`,
    `total_amount`, `vat_amount`, `invoice_number`,
    `service_period_start`, `service_period_end`, `extraction_status`,
    `review_status`, `created_at`.
-   `document_extractions`: `id`, `document_id`, `extractor`,
    `schema_version`, `extracted_json`, `confidence_json`,
    `raw_text_storage_path` (optional), `created_at`.
-   `document_links`: `id`, `document_id`, `related_entity_type`,
    `related_entity_id`, `purpose`, `created_at`.
-   `expenses`: `id`, `household_id`, `document_id`, `merchant`,
    `expense_date`, `category`, `amount`, `currency`, `payment_status`,
    `is_recurring`, `notes`, `review_status`.
-   `expense_line_items`: `id`, `expense_id`, `description`, `quantity`,
    `unit_amount`, `tax_amount`, `total_amount`, `category`.
-   `tax_years`: `id`, `household_id`, `jurisdiction_code`,
    `year_label`, `start_date`, `end_date`, `status`.
-   `tax_categories`: `id`, `jurisdiction_code`, `code`, `label`,
    `description`, `is_active`.
-   `tax_evidence_items`: `id`, `tax_year_id`, `expense_id`,
    `document_id`, `category_id`, `potentially_relevant_amount`,
    `eligible_amount_estimate`, `claimed_amount`, `eligibility_status`,
    `calculation_json`, `rule_version`, `source_url`, `review_status`,
    `notes`.
-   `tax_rules`: `id`, `jurisdiction_code`, `tax_year_label`,
    `rule_code`, `version`, `effective_from`, `effective_to`,
    `rule_json`, `official_source_url`, `reviewed_at`, `status`.

Tax rules must be explicit, versioned and reviewable; do not bury tax
logic in prompts.

### 7.4 Housing

-   `housing_listings`: `id`, `household_id`, `source_id`,
    `external_id`, `canonical_url`, `title`, `provider`, `address_text`,
    `locality`, `county`, `bedrooms`, `property_type`, `rent_amount`,
    `rent_frequency`, `units_count`, `application_deadline`,
    `listing_status`, `first_seen_at`, `last_seen_at`,
    `last_checked_at`, `closed_at`, `current_snapshot_json`.
-   `housing_observations`: `id`, `listing_id`, `observed_at`,
    `snapshot_json`, `content_hash`, `change_summary`.
-   `housing_applications`: `id`, `household_id`, `listing_id`,
    `applied_status`, `application_date`, `provider_status`,
    `outcome_code`, `result_details`, `queue_status`, `next_action`,
    `notes`, `updated_by`.
-   `housing_projects`: `id`, `household_id`, `name`, `locality`,
    `county`, `provider`, `stage`, `total_homes`, `cost_rental_homes`,
    `bedroom_mix_json`, `cost_rental_confirmation`, `expected_date`,
    `source_evidence_id`, `next_check_at`, `notes`.
-   `nearby_amenities`: `id`, `listing_id`, `name`, `category`,
    `address`, `latitude`, `longitude`, `distance_km`,
    `travel_time_minutes`, `source_url`, `checked_at`,
    `verification_status`.
-   `housing_news_items`: `id`, `household_id`, `title`, `published_at`,
    `summary`, `locality`, `provider`, `cost_rental_confirmation`,
    `verification_status`, `dedupe_key`, `created_at`.
-   `housing_news_sources`: `id`, `news_item_id`, `source_evidence_id`.

Never let a scraper overwrite user-managed application status/outcome
fields.

### 7.5 Utilities

-   `utility_contracts`: `id`, `household_id`, `utility_type`,
    `supplier`, `account_label`, `contract_start_date`,
    `contract_end_date`, `renewal_date`, `meter_type`, `tariff_name`,
    `discount_json`, `status`, `last_bill_id`, `notes`.
-   `utility_bills`: `id`, `household_id`, `contract_id`, `document_id`,
    `period_start`, `period_end`, `total_amount`, `currency`,
    `standing_charge`, `vat_amount`, `usage_json`, `rates_json`,
    `extraction_status`, `review_status`.
-   `tariff_offers`: `id`, `supplier`, `utility_type`, `tariff_name`,
    `meter_type`, `rates_json`, `standing_charge`, `discount_json`,
    `fees_json`, `valid_from`, `valid_to`, `source_url`, `checked_at`,
    `eligibility_notes`.
-   `utility_comparisons`: `id`, `household_id`, `contract_id`,
    `trigger_type`, `triggered_at`, `usage_basis_json`, `results_json`,
    `best_option_summary`, `status`, `completed_at`.
-   `utility_comparison_options`: `id`, `comparison_id`, `supplier`,
    `tariff_name`, `estimated_first_year_cost`,
    `estimated_following_year_cost`, `estimated_savings`,
    `assumptions_json`, `source_url`, `rank`.
-   `utility_price_notices`: `id`, `contract_id`, `source_evidence_id`,
    `effective_date`, `summary`, `review_status`.

Use exact decimals/numeric columns for money; avoid floating-point
arithmetic for financial totals.

### 7.6 Travel

-   `travel_profiles`: `id`, `household_id`, `name`, `default_adults`,
    `default_children_json`, `departure_airports_json`,
    `destination_preferences_json`, `meal_preferences_json`,
    `budget_amount`, `currency`, `updated_at`.
-   `trip_searches`: `id`, `household_id`, `travel_profile_id`,
    `date_from`, `date_to`, `nights_min`, `nights_max`, `adults`,
    `children_json`, `departure_airports_json`,
    `destination_regions_json`, `budget_amount`, `currency`,
    `meal_plan_preferences_json`, `room_preferences_json`,
    `baggage_requirements_json`, `car_rental_preferences_json`,
    `cancellation_preferences_json`, `status`, `query_fingerprint`.
-   `trip_candidates`: `id`, `trip_search_id`, `destination`,
    `departure_airport`, `return_airport`, `outbound_date`,
    `return_date`, `flight_cost`, `accommodation_cost`, `meal_cost`,
    `transfer_cost`, `car_rental_cost`, `other_cost`, `total_cost`,
    `currency`, `board_basis`, `room_configuration`, `score_json`,
    `last_checked_at`, `status`.
-   `trip_candidate_components`: `id`, `trip_candidate_id`,
    `component_type`, `provider`, `title`, `price`, `currency`,
    `details_json`, `booking_url`, `checked_at`, `is_estimate`,
    `terms_summary`.
-   `trip_watch_rules`: `id`, `household_id`, `trip_search_id`,
    `max_total_cost`, `max_flight_duration_minutes`, `max_stops`,
    `minimum_board_basis`, `require_free_cancellation`,
    `notification_threshold_json`, `is_enabled`.
-   `trip_bookings`: `id`, `household_id`, `trip_candidate_id`,
    `component_type`, `provider`, `confirmation_reference` (optional,
    protected), `booking_url`, `amount_paid`, `currency`,
    `cancellation_deadline`, `document_id`, `status`, `notes`.

A candidate's total cost must show what is included and excluded. Never
sum prices in different currencies without a dated exchange-rate record.

### 7.7 Module metadata

-   `module_settings`: `id`, `household_id`, `module_key`,
    `settings_json`, `updated_at`.
-   `integration_settings`: `id`, `household_id`, `provider_key`,
    `is_enabled`, `configuration_json` containing non-secret settings
    only, `last_tested_at`, `status`.
-   Secrets belong in environment variables or a secrets manager, never
    in `integration_settings`.

### 7.8 Indexes and constraints

At minimum: - Index all foreign keys and `household_id`. - Unique
`(source_id, external_id)` where external IDs exist. - Unique normalized
`canonical_url` per source where feasible. - Unique `idempotency_key`
for jobs. - Index job status/scheduled time, contract end dates,
application deadlines, document dates, tax year and trip search
windows. - Use check constraints for positive amounts, valid statuses
and date ranges. - Add full-text search only after defining a
privacy-conscious indexing strategy. - Store timestamps in UTC; display
in the household timezone. - Use migrations rather than editing
production schema manually.

------------------------------------------------------------------------

## 8. API and domain-service design

Keep UI components thin. Route handlers should authenticate, validate
input, call domain services, and return typed responses. Business rules
should live in `src/server/domain` or equivalent modules and be
unit-testable without Supabase or AI.

Example endpoint families (the implementation may choose server actions
for simple mutations, but scheduled jobs need protected server
endpoints):

### Core

-   `GET /api/health` --- non-sensitive health status.
-   `GET /api/dashboard` --- household dashboard summary.
-   `GET/POST /api/tasks`
-   `GET/POST /api/events`
-   `GET /api/notifications`
-   `POST /api/notifications/:id/read`

### Documents and tax

-   `POST /api/documents/upload-url` or authenticated server-side
    upload.
-   `POST /api/documents/:id/process`
-   `POST /api/documents/:id/confirm-extraction`
-   `GET /api/documents`
-   `POST /api/expenses`
-   `GET /api/tax-years/:id/summary`
-   `POST /api/tax-years/:id/export`

### Housing

-   `GET /api/housing/listings`
-   `GET /api/housing/listings/:id`
-   `POST /api/housing/listings/:id/application-status`
-   `GET /api/housing/projects`
-   `POST /api/jobs/cost-rental/run` --- protected, idempotent trigger.
-   `GET /api/housing/reports/:id`

### Utilities

-   `GET/POST /api/utilities/contracts`
-   `POST /api/utilities/contracts/:id/compare`
-   `GET /api/utilities/comparisons/:id`
-   `POST /api/jobs/utilities/compare-due` --- protected scheduled
    dispatcher.
-   `POST /api/utilities/bills/:id/confirm`

### Travel

-   `GET/POST /api/travel/searches`
-   `POST /api/travel/searches/:id/run`
-   `GET /api/travel/searches/:id/results`
-   `POST /api/travel/candidates/:id/save`
-   `POST /api/travel/candidates/:id/refresh`
-   `POST /api/jobs/travel/weekly-discovery` --- protected scheduled
    dispatcher.

### Research and operations

-   `POST /api/research/run`
-   `GET /api/research/runs/:id`
-   `POST /api/jobs/dispatch` --- internal-only, signed/secret-protected
    and allow-listed.
-   `GET /api/jobs/status`

Use Zod or equivalent validation for every incoming payload. Add
pagination, rate limits and consistent error codes. Never expose
provider API keys or the Supabase service-role key to the browser.

------------------------------------------------------------------------

## 9. PWA requirements

-   Responsive layouts for phone, tablet and desktop.
-   Installable web app manifest with name, icons, theme color, start
    URL and standalone display.
-   HTTPS in production.
-   Service worker caches only the static application shell and safe
    static assets by default.
-   Do not cache sensitive API responses, tax documents or private
    household data in Cache Storage by default.
-   Provide an offline banner and clear handling for unsaved edits.
-   Avoid offline mutations until an explicit, tested sync strategy is
    implemented.
-   Support mobile-friendly file upload, camera/photo selection, PDF
    viewing and large touch targets.
-   Use accessible labels, keyboard navigation, focus states and
    sufficient contrast.
-   Version the service worker and provide a safe update flow.
-   Test installation and updates on Android Chrome and iOS Safari;
    platform PWA behaviours differ.
-   Do not rely on browser background sync for scheduled monitoring.
-   Add a lightweight in-app notification inbox. Push notifications can
    be a later opt-in enhancement.

------------------------------------------------------------------------

## 10. Authentication, security and privacy

### Initial household access

Use Supabase Auth with one shared household account as requested. Keep
permissions simple. Do not add complex role matrices to the MVP. Because
shared credentials reduce accountability, record important changes and
provide a path to separate adult accounts later. Never hard-code
credentials in the app or source repository.

### Supabase security

-   Enable Row Level Security (RLS) on every household table exposed
    through the Supabase API.
-   Every household-owned row must be scoped to the authenticated
    household.
-   Store original documents in a private bucket; issue short-lived
    signed URLs only after authorization.
-   Never expose the service-role key to the client.
-   Use server-side secrets for scheduled job endpoints and third-party
    credentials.
-   Restrict CORS/origins as appropriate, validate all inputs and
    protect against CSRF where relevant.
-   Apply file size/type limits; scan files where feasible; do not
    execute uploaded content.
-   Sanitize rendered HTML and untrusted research snippets.
-   Treat website content and social posts as untrusted input, not
    instructions.
-   Redact secrets, account numbers and sensitive document text from
    logs.
-   Use backups and test restoring them.
-   Provide export and deletion controls.
-   Document retention rules and avoid collecting unnecessary
    identity/health information.
-   If AI APIs are enabled, send only the minimum necessary content and
    disclose the provider/data flow in settings.

### Shared-account risks

A shared login means all household users using that credential have
similar access. It cannot reliably distinguish which adult made a
change. This is acceptable for an initial low-complexity version, but
the design must not imply per-person privacy under a shared account. Do
not place sensitive child/health records in a feature claiming
fine-grained access control until separate accounts are implemented.

------------------------------------------------------------------------

## 11. AI-minimized automation

### Use deterministic code for

-   Money calculations and currency conversion using stored rates.
-   Contract expiry and date scheduling.
-   Filtering bedroom/property criteria.
-   Duplicate detection and content hashes.
-   Job retries and idempotency.
-   Cost ranking and threshold checks.
-   Tax-year boundaries and versioned rule calculations.
-   Change detection and notifications.
-   Data validation and report totals.

### Use AI optionally for

-   Extracting unusual document layouts.
-   Summarizing research results.
-   Classifying ambiguous documents.
-   Drafting correspondence.
-   Natural-language questions over household data.
-   Synthesizing travel trade-offs from verified provider results.

### Reliability rules

-   Every model call has a timeout, retry policy and cost limit.
-   Save the model/provider/version and extraction prompt/schema version
    where appropriate.
-   Model outputs must pass schema validation.
-   Low-confidence values go to a review queue.
-   AI never directly changes confirmed values, tax eligibility,
    application outcomes or booking status.
-   If no model API is configured, core workflows still work.
-   Avoid model calls for repeated, identical source data; cache by
    content hash.
-   Provide a clear "AI unavailable" state rather than blocking the app.

------------------------------------------------------------------------

## 12. Research source policy

Use source types and verification states consistently.

### Source priority

1.  Official government, Revenue, local authority, housing body,
    supplier or travel advisory source.
2.  Official provider product/booking data.
3.  Reputable news sources.
4.  Social media and community discussion as discovery leads.
5.  Search snippets only as pointers; open and verify the underlying
    page when possible.

### Required evidence fields

For any consequential recommendation, save: - source title and URL; -
publication date, if known; - retrieval/check date; - relevant short
excerpt or structured facts; - source type; - verification state; -
related entity; - whether the item is current, stale, disputed or
unverified.

For Cost Rental, preserve a separate "Cost Rental confirmed?" state:
`Yes`, `No`, or `Unconfirmed`. Do not infer tenure from the fact that a
housing development exists.

### Legal/operational constraints

Use supported APIs or permitted access methods. Respect provider terms,
robots directives and rate limits. Do not bypass authentication,
CAPTCHAs, bot protections or access controls. If a source cannot be
accessed reliably, report it as unavailable and offer a link/manual
fallback.

------------------------------------------------------------------------

## 13. Local development workflow

### Prerequisites

-   Git.
-   A current supported Node.js LTS release.
-   A package manager (recommend `pnpm`, unless the coding agent's
    environment requires npm).
-   Docker Desktop or equivalent if using Supabase local services.
-   Supabase CLI.
-   Optional: Python only for a separately isolated OCR or parsing
    worker if needed.

### Setup sequence

1.  Create the repository and initialize Next.js with TypeScript, App
    Router, linting and Tailwind.
2.  Enable strict TypeScript; establish formatting and lint rules.
3.  Install Supabase CLI and initialize local Supabase.
4.  Create migrations for household core tables first.
5.  Create `.env.example` with names and descriptions, never real
    secrets.
6.  Start local Supabase services and run migrations.
7.  Seed development-only sample data that contains no real household
    information.
8.  Build authentication and RLS tests before uploading real bills.
9.  Implement the dashboard shell and PWA manifest.
10. Implement one complete vertical slice: document upload → extraction
    → review → expense record → module linkage.
11. Implement Cost Rental Watch and its run log.
12. Implement utility contract tracking and the 14-day trigger.
13. Add research adapters and audit the installed `last30day` skill.
14. Add the holiday provider adapters and weekly discovery after
    confirming accessible data sources.
15. Add CI checks, tests, backup/export procedures and deployment
    documentation.

### Local commands (adapt to generated scripts)

``` bash
pnpm install
pnpm dev

# In another terminal, when using Supabase local:
supabase start
supabase db reset

pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Document the exact command order in `README.md`. Do not assume every
command exists until the repository scripts have been created.

### Local background jobs

Provide explicit CLI commands for development, for example: -
`pnpm jobs:cost-rental` - `pnpm jobs:utilities:due` -
`pnpm jobs:travel:weekly` - `pnpm jobs:research:test`

These should call the same domain services used in production. A local
scheduler may invoke them, but the app must not require the developer's
browser to remain open.

------------------------------------------------------------------------

## 14. Deployment strategy

### Phase A: workstation

-   Next.js runs locally.
-   Supabase local stack stores data.
-   Local files use local Supabase Storage.
-   Research providers are disabled until configured.
-   Background jobs are manually triggered or scheduled locally.
-   Use synthetic data during early development.

### Phase B: private cloud test

-   Create a Supabase project.
-   Apply checked-in migrations.
-   Configure private storage and RLS.
-   Deploy Next.js to Vercel.
-   Configure environment variables through the hosting dashboard.
-   Add a protected cron endpoint or Supabase scheduler.
-   Verify jobs, storage, backups, error alerts and mobile installation.
-   Use a separate staging environment before importing real family
    documents.

### Phase C: production

-   Enable only necessary provider integrations.
-   Configure job schedules and provider budgets.
-   Test failed-job recovery and idempotency.
-   Test database restore and document export.
-   Monitor external provider failures and free-tier usage.
-   Set alerts for storage, database, compute or API limits.
-   Document how to migrate to another host.

### Hosting trade-offs

-   **Vercel + Supabase:** simplest recommended route for a Next.js app,
    but scheduled execution and provider API usage may have
    plan-specific limits.
-   **Supabase-only backend with another frontend host:** possible, but
    Next.js server-side functionality still needs a runtime somewhere.
-   **GitHub Pages:** suitable for static content, not sufficient alone
    for secure server-side API keys, authenticated server routes or
    dependable background jobs.
-   **Home server plus secure tunnel/VPN:** can keep hosting costs low,
    but uptime, power, backups, networking and security become your
    responsibility.
-   **Other cloud host:** acceptable if it supports the required Node.js
    runtime, environment secrets, database connectivity, private file
    handling and scheduled/worker execution.

The domain logic and database migrations should remain portable. Keep
platform-specific cron configuration in deployment files, not scattered
throughout business code.

------------------------------------------------------------------------

## 15. Environment variables

Create `.env.example` with placeholders only:

``` dotenv
# App
NEXT_PUBLIC_APP_NAME="Personal Life Hub"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_TIMEZONE="Europe/Dublin"
APP_DEFAULT_CURRENCY="EUR"
APP_DEFAULT_COUNTRY="IE"
NODE_ENV="development"

# Supabase client values (local development)
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="replace-with-local-anon-key"
SUPABASE_SERVICE_ROLE_KEY="server-only-placeholder"

# Storage
DOCUMENTS_BUCKET="household-documents"
MAX_UPLOAD_MB="20"

# Scheduled jobs: server-only secrets
JOB_TRIGGER_SECRET="replace-with-long-random-secret"
JOB_MAX_ATTEMPTS="3"

# Research skill / adapters
LAST30DAY_ENABLED="false"
LAST30DAY_COMMAND=""
XAI_API_KEY=""
XAI_ENABLED="false"
WEB_RESEARCH_PROVIDER=""
WEB_RESEARCH_API_KEY=""

# Optional AI and OCR
AI_PROVIDER="disabled"
AI_API_KEY=""
AI_MODEL=""
LOCAL_OCR_ENABLED="true"
TESSERACT_PATH=""

# Optional travel providers; enable only after checking current API access/terms
FLIGHT_PROVIDER=""
FLIGHT_API_KEY=""
HOTEL_PROVIDER=""
HOTEL_API_KEY=""
CAR_RENTAL_PROVIDER=""
CAR_RENTAL_API_KEY=""
CURRENCY_RATE_PROVIDER=""
CURRENCY_RATE_API_KEY=""

# Notifications
EMAIL_PROVIDER=""
EMAIL_API_KEY=""
NOTIFICATION_FROM_EMAIL=""

# Observability (optional)
ERROR_TRACKING_DSN=""
```

The implementation agent must replace placeholder names with the exact
configuration required by the selected libraries/providers. Do not
commit `.env`, API keys, service-role keys, downloaded private
documents, or real household data. Prefix a variable with `NEXT_PUBLIC_`
only if it is safe to expose in the browser.

For production, configure secrets in the hosting provider's secret
manager. Do not print secrets in logs or audit records.

------------------------------------------------------------------------

## 16. Full repository directory structure

Use a single repository for Personal Life Hub. Keep Seerah Learning in a
separate repository or separately deployed project.

``` text
personal-life-hub/
├── README.md
├── SPEC.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── prettier.config.mjs
├── postcss.config.mjs
├── playwright.config.ts
├── vitest.config.ts
├── .gitignore
├── .env.example
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── migration-check.yml
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   ├── screenshots/
│   └── offline.html
├── docs/
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── data-model.md
│   │   ├── security-model.md
│   │   ├── background-jobs.md
│   │   └── hosting-and-migration.md
│   ├── decisions/
│   │   └── ADR-0001-modular-monolith.md
│   ├── integrations/
│   │   ├── last30day-skill-audit.md
│   │   ├── research-providers.md
│   │   ├── travel-providers.md
│   │   └── provider-costs.md
│   ├── operations/
│   │   ├── backup-restore.md
│   │   ├── job-failures.md
│   │   └── incident-response.md
│   └── user-guide/
├── src/
│   ├── app/
│   │   ├── (public)/
│   │   │   └── login/
│   │   ├── (app)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── housing/
│   │   │   ├── utilities/
│   │   │   ├── documents/
│   │   │   ├── expenses/
│   │   │   ├── tax/
│   │   │   ├── family/
│   │   │   ├── education/
│   │   │   ├── travel/
│   │   │   ├── research/
│   │   │   ├── finance/
│   │   │   ├── decisions/
│   │   │   ├── notifications/
│   │   │   └── settings/
│   │   ├── api/
│   │   │   ├── health/
│   │   │   ├── dashboard/
│   │   │   ├── documents/
│   │   │   ├── expenses/
│   │   │   ├── tax/
│   │   │   ├── housing/
│   │   │   ├── utilities/
│   │   │   ├── travel/
│   │   │   ├── research/
│   │   │   └── jobs/
│   │   ├── manifest.ts
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── charts/
│   │   ├── maps/
│   │   ├── documents/
│   │   ├── notifications/
│   │   └── pwa/
│   ├── modules/
│   │   ├── dashboard/
│   │   ├── housing/
│   │   │   ├── components/
│   │   │   ├── schemas.ts
│   │   │   ├── queries.ts
│   │   │   ├── actions.ts
│   │   │   └── service.ts
│   │   ├── utilities/
│   │   ├── documents/
│   │   ├── expenses/
│   │   ├── tax/
│   │   ├── family/
│   │   ├── education/
│   │   ├── travel/
│   │   ├── research/
│   │   ├── finance/
│   │   ├── decisions/
│   │   └── notifications/
│   ├── server/
│   │   ├── auth/
│   │   ├── db/
│   │   ├── domain/
│   │   │   ├── money/
│   │   │   ├── dates/
│   │   │   ├── evidence/
│   │   │   ├── ranking/
│   │   │   └── deduplication/
│   │   ├── jobs/
│   │   │   ├── registry.ts
│   │   │   ├── dispatcher.ts
│   │   │   ├── runner.ts
│   │   │   ├── retry.ts
│   │   │   └── handlers/
│   │   ├── research/
│   │   │   ├── types.ts
│   │   │   ├── orchestrator.ts
│   │   │   ├── normalizer.ts
│   │   │   ├── deduplicator.ts
│   │   │   └── adapters/
│   │   │       ├── last30day/
│   │   │       ├── web/
│   │   │       ├── xai-x/
│   │   │       └── official-source/
│   │   ├── documents/
│   │   │   ├── storage.ts
│   │   │   ├── extraction.ts
│   │   │   ├── pdf-text.ts
│   │   │   ├── ocr.ts
│   │   │   └── classification.ts
│   │   ├── providers/
│   │   │   ├── utilities/
│   │   │   ├── flights/
│   │   │   ├── accommodation/
│   │   │   ├── car-rental/
│   │   │   ├── currency/
│   │   │   └── notifications/
│   │   ├── tax/
│   │   │   ├── rules/
│   │   │   ├── calculations/
│   │   │   └── evidence-report.ts
│   │   ├── reports/
│   │   ├── observability/
│   │   └── secrets/
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── browser.ts
│   │   │   ├── server.ts
│   │   │   └── middleware.ts
│   │   ├── env.ts
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── dates.ts
│   │   └── utils.ts
│   ├── hooks/
│   ├── styles/
│   └── types/
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   ├── seed.sql
│   ├── functions/
│   │   └── job-dispatch/
│   └── tests/
├── scripts/
│   ├── audit-last30day-skill.ts
│   ├── run-cost-rental.ts
│   ├── run-utility-comparisons-due.ts
│   ├── run-weekly-travel-discovery.ts
│   ├── seed-demo-data.ts
│   ├── export-household-data.ts
│   └── check-provider-config.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   ├── e2e/
│   ├── fixtures/
│   └── security/
└── deployment/
    ├── vercel/
    │   └── cron-notes.md
    ├── local/
    │   ├── scheduler-examples/
    │   └── docker-notes.md
    └── scripts/
```

Do not create empty folders without purpose; the tree is the intended
target architecture and should be populated incrementally.

------------------------------------------------------------------------

## 17. User experience requirements

### Navigation

Mobile bottom navigation or compact navigation drawer: - Home -
Housing - Utilities - Documents - Travel - More

Desktop can use a left sidebar with all modules. Do not put every
feature on the first screen.

### Shared UI patterns

-   Global search for documents, listings, contracts, trips and
    decisions.
-   Consistent filters, sort, status labels and source links.
-   "Last checked" timestamps and source failure warnings.
-   Review queue for uncertain extraction or research claims.
-   One-click "Compare now" or "Run again" where appropriate.
-   Clear separation of confirmed data, estimates, AI suggestions and
    user-entered notes.
-   Exportable tables and reports.
-   Empty states explaining how to configure a module.
-   Accessible responsive tables/cards for mobile.

### Notification principles

-   Notify for new matching Cost Rental listings, meaningful changes and
    deadlines.
-   Run utility comparison 14 days before contract end; don't send
    monthly comparison alerts.
-   Notify weekly about qualifying holiday options, not every search
    result.
-   Alert on failed monitoring runs if the failure means the app cannot
    reliably report results.
-   Deduplicate alerts by event and threshold.
-   Let the user mute non-critical alerts.

------------------------------------------------------------------------

## 18. Testing strategy

### Unit tests

-   Utility tariff arithmetic, discounts, VAT, standing charges,
    time-of-use periods and annualization.
-   Contract-expiry calculation (exactly 14 days before expiry, timezone
    and daylight-saving boundaries).
-   Housing match rules (3-bedroom houses; all 4-bedroom property
    types).
-   Housing listing deduplication and field-change detection.
-   Application status preservation when listings close.
-   Tax-year boundaries and versioned rule application.
-   Travel total-cost calculations, currency conversion timestamps,
    child ages and room occupancy.
-   Query fingerprints and notification deduplication.
-   Research date-window filtering and verification state transitions.

### Integration tests

-   Supabase migrations and RLS.
-   Private file upload/download authorization.
-   Document processing pipeline and user confirmation.
-   Scheduled job idempotency, retries, locks and failure recovery.
-   Research adapter contract and partial-source failure handling.
-   Utility comparison scheduling and rescheduling when expiry changes.
-   Travel adapter response normalization and unavailable provider
    behaviour.

### End-to-end tests

-   Login and household dashboard.
-   Upload a bill, review extracted data, link it to a contract and tax
    year.
-   Add a utility contract and verify the comparison is scheduled 14
    days before expiry, not monthly.
-   Run Cost Rental Watch against fixture pages and display every match.
-   Update an application outcome and verify a subsequent scrape does
    not overwrite it.
-   Create a family travel search, run fixture provider responses,
    compare total costs and save a candidate.
-   Verify mobile navigation, PWA installation metadata and
    offline-shell messaging.
-   Verify that unauthorized users cannot access household records or
    files.

### Reliability tests

-   Source returns zero items successfully vs source fails: results must
    differ.
-   Provider rate limits, timeouts, malformed data and missing API keys.
-   Duplicate job triggers.
-   Restart worker while a job is running.
-   Stale travel data.
-   Invalid/low-confidence document extraction.
-   Database backup and restore.
-   No secrets in browser bundles or logs.

------------------------------------------------------------------------

## 19. Acceptance criteria

### General platform

-   [ ] Runs locally with documented setup commands.
-   [ ] Strict TypeScript, lint, tests and production build pass.
-   [ ] PWA is responsive and installable on supported mobile browsers.
-   [ ] Supabase RLS protects every household-owned table and private
    file.
-   [ ] No provider secret is exposed to the browser.
-   [ ] Core features work when AI is disabled.
-   [ ] Every scheduled job has a run log, failure state, idempotency
    key and retry strategy.
-   [ ] Exports and backups are documented and tested.

### Cost Rental Watch

-   [ ] Runs once each morning in `Europe/Dublin`.
-   [ ] Checks all available listing pages and individual candidate
    pages.
-   [ ] Includes every 3-bedroom house and every 4-bedroom property
    type.
-   [ ] Does not stop at the first match.
-   [ ] Newest matching listings appear first.
-   [ ] Stores source URLs, last-checked times and listing changes.
-   [ ] Keeps closed listings in history.
-   [ ] Preserves manually reported application outcomes.
-   [ ] Tracks future pipeline, prioritizing Limerick, with confirmation
    states.
-   [ ] Includes nearby education/childcare context where reliable.
-   [ ] Includes a last-30-day news digest with official-source
    verification and X research status.
-   [ ] Shows missing skill/provider/source access honestly.

### Utilities and expenses

-   [ ] Bill uploads produce reviewable extracted fields.
-   [ ] One bill can link to utility comparison, household expense and
    tax evidence without duplicating the original.
-   [ ] Supplier comparison excludes Bord Gáis.
-   [ ] Compares smart-meter time-of-use, dual-fuel and
    separate-supplier options where data permits.
-   [ ] First-year cost calculations are deterministic and tested.
-   [ ] Contract expiry schedules comparison exactly 14 days before
    expiry.
-   [ ] No monthly utility comparison is scheduled.
-   [ ] Manual comparison remains available.
-   [ ] Tax evidence is organized by Irish tax year and source-backed
    rule version.
-   [ ] No claim is filed automatically.

### Travel

-   [ ] Search supports configurable adults, child counts/ages,
    Dublin/Shannon/Cork departures, dates and destination regions.
-   [ ] Meal/board basis and room configuration are part of the search.
-   [ ] Weekly discovery is scheduled independently of the browser.
-   [ ] Results show total family cost and included/excluded components.
-   [ ] Flights, baggage, accommodation, meal plan, transfers/car rental
    and relevant fees are represented when supported.
-   [ ] Every component has provider/source and last-checked time.
-   [ ] Unsupported/live-unavailable data is labelled rather than
    invented.
-   [ ] Booking links work and all purchases require user approval.
-   [ ] Research calls are cached, rate-limited and cost-aware.

### Research adapter

-   [ ] Installed `last30day(s)` skill is inspected before integration.
-   [ ] Audit report documents path, dependencies, invocation,
    credentials by name and limitations.
-   [ ] The skill is invoked only through a controlled adapter.
-   [ ] X/xAI research is enabled only when access and credentials are
    configured.
-   [ ] The native fallback is tested.
-   [ ] No report claims to have checked a source that was not queried.

------------------------------------------------------------------------

## 20. Implementation phases and exit gates

### Phase 0 --- Repository and integration audit

Deliverables: - Confirm Node/package manager versions and local
development environment. - Inspect existing Cost Rental Watch
specification and installed `last30day(s)` skill. - Record provider
options and likely costs for research and travel. - Confirm deployment
plan and local Supabase setup.

Exit gate: `docs/integrations/last30day-skill-audit.md` completed or
explicitly records that the skill is unavailable.

### Phase 1 --- Foundation

Deliverables: - Next.js PWA shell. - Supabase local configuration and
migrations. - Shared household model, authentication and RLS. - Logging,
errors, job ledger and dashboard skeleton. - CI and tests.

Exit gate: clean local setup, build and security tests pass.

### Phase 2 --- Documents and expenses

Deliverables: - Private upload, duplicate detection, text extraction and
review queue. - Shared document links and expense records. - Initial
Irish tax-year evidence workflow. - Export.

Exit gate: one utility bill can be uploaded once, reviewed, linked to a
utility contract and tax evidence, and exported.

### Phase 3 --- Cost Rental Watch

Deliverables: - Full listing crawler/adapter with pagination. -
Persistent observations and application tracker. - Future pipeline and
local amenities. - Last-30-day research integration and report. - Daily
scheduler.

Exit gate: fixture-based test proves all matching entries are collected,
source failures are visible, and user application outcomes are
preserved.

### Phase 4 --- Utility Analyzer

Deliverables: - Contract/bill models and tariff comparison engine. -
First-year cost calculations. - 14-day expiry scheduling and manual
comparison. - Supplier exclusions and offer evidence.

Exit gate: deterministic tests pass; a contract does not trigger monthly
comparisons.

### Phase 5 --- Holiday Finder

Deliverables: - Search-profile form and weekly scheduler. - Provider
adapters, normalized candidate schema and total-cost engine. -
Meal-plan, room and baggage comparisons. - Booking links, saved
candidates and alert thresholds.

Exit gate: tests demonstrate that only comparable/compatible components
are combined and unsupported data is clearly labelled. If live provider
coverage is limited, release with supported partial coverage and manual
links rather than faking completeness.

### Phase 6 --- Family and education

Deliverables: - Calendar, tasks, reminders, school research and
admissions tracking. - Cross-module links and document associations.

Exit gate: tasks and deadlines can be created from housing, utility,
travel and school records.

### Phase 7 --- Cloud deployment and hardening

Deliverables: - Vercel + Supabase deployment. - Secrets, scheduled
triggers, monitoring, backups, restore test and mobile PWA
verification. - Provider cost controls and documentation.

Exit gate: scheduled jobs run with browser closed, failures are visible,
private files remain private, and restore/export is tested.

### Phase 8 --- Optional enhancements

-   Individual adult accounts.
-   Push notifications.
-   Bank CSV import or authorized financial integrations.
-   More travel providers.
-   Additional tax jurisdictions.
-   Email import.
-   Enhanced local-first/offline sync only if needed.

Do not begin these before the core acceptance criteria pass.

------------------------------------------------------------------------

## 21. Cost and provider decision register

Create `docs/integrations/provider-costs.md` and maintain this table:

  --------------------------------------------------------------------------
  Capability                 Initial approach        Cost rule
  -------------------------- ----------------------- -----------------------
  Database/auth/storage      Local Supabase, then    Check current quotas
                             Supabase hosted         and storage/egress
                                                     limits

  Next.js hosting            Local, then Vercel or   Check scheduled
                             alternative             function/runtime limits

  Cost Rental listings       Official/public source  Respect source terms
                             adapter where permitted and rate limits

  last30day skill            Inspect existing local  Reuse only if
                             installation            dependencies and
                                                     scheduled invocation
                                                     work

  X/xAI                      Optional adapter        Requires supported
                                                     access/credentials; do
                                                     not assume free access

  General web research       Provider adapter        Choose after verifying
                                                     pricing and quotas

  Bill OCR                   PDF text extraction,    Paid OCR only if needed
                             then local OCR          

  AI                         Disabled by default or  Per-feature opt-in,
  extraction/summarization   budget-capped           timeout and spend limit

  Flights                    Licensed/official       No guarantee of
                             provider adapter or     comprehensive free live
                             booking search links    fares

  Hotels                     Licensed provider       Verify meal plan,
                             adapter or booking      occupancy and
                             search links            cancellation data

  Car rental/transfers       Provider adapter or     Clearly label
                             manual/deep links       unavailable components

  Email notifications        In-app first; optional  Avoid paid SMS by
                             email provider          default

  Currency conversion        Cached rates from a     Store source and rate
                             chosen provider         timestamp
  --------------------------------------------------------------------------

The product should remain useful if one or more optional providers are
disabled. Provider adapters must have a consistent "not configured",
"quota exceeded", "temporarily unavailable" and "stale result" status.

------------------------------------------------------------------------

## 22. Definition of done

A module is not complete merely because its UI renders. It is complete
when: - data is validated and persisted; - source evidence is retained
where relevant; - loading, empty, offline and failure states exist; -
permission boundaries are tested; - calculations have unit tests; -
background jobs are idempotent and observable; - mobile layouts work; -
export/backup implications are considered; - documentation and
acceptance criteria are updated.

The application is production-ready only when the security,
scheduled-job, data-recovery and provider-failure tests pass.

------------------------------------------------------------------------

## 23. Coding-agent implementation prompt

Use this prompt with AGY or Claude Code from the repository root:

> You are implementing **Personal Life Hub**, a private household and
> personal-life PWA. Read `SPEC.md` completely before making changes.
> Also inspect any existing project files before choosing implementation
> details.
>
> **Work incrementally. Do not attempt to implement the entire
> specification in one pass.**
>
> 1.  Audit the local environment, current repository, package manager,
>     Supabase CLI, Docker availability, and installed `last30day` /
>     `last30days` skill. Read the skill instructions and dependencies.
>     Do not assume paths or command syntax. Record the result in
>     `docs/integrations/last30day-skill-audit.md`.
> 2.  Create a short implementation plan with dependencies, risks,
>     provider costs and test gates.
> 3.  Build Phase 1 only: Next.js App Router + strict TypeScript +
>     responsive PWA shell + local Supabase + migrations + minimal
>     household login + RLS + job ledger + CI.
> 4.  Keep business logic separate from UI and provider adapters. Use
>     Zod/runtime validation. Do not expose server secrets.
> 5.  Use deterministic calculations and rules wherever possible. AI is
>     optional and must never be a critical dependency.
> 6.  Create `.env.example` with placeholders only. Never write secrets
>     to files, source control or logs.
> 7.  Write and run unit, integration and security tests. Run lint,
>     typecheck, tests and production build before declaring the phase
>     complete.
> 8.  Update `README.md` with exact local setup and troubleshooting
>     commands.
> 9.  Stop at the phase exit gate and summarize files changed, tests
>     run, known limitations, provider costs and next steps. Do not
>     silently move to the next phase.
>
> After Phase 1 passes, implement one phase at a time in the order in
> `SPEC.md`. Preserve the Cost Rental rules, the 14-day utility
> contract-expiry trigger, shared document/tax evidence, weekly travel
> discovery, explicit source verification, and mandatory human approval
> for bookings and tax submissions. Never claim live provider data
> exists unless the adapter actually returned it.

------------------------------------------------------------------------

## 24. First development session checklist

-   [ ] Create the repository.
-   [ ] Save this specification as `SPEC.md`.
-   [ ] Audit the `last30day(s)` skill and its dependencies.
-   [ ] Check Node.js, package manager, Docker and Supabase CLI.
-   [ ] Scaffold Next.js with strict TypeScript.
-   [ ] Start local Supabase.
-   [ ] Add initial migrations and RLS tests.
-   [ ] Build the PWA shell and login.
-   [ ] Add CI checks.
-   [ ] Do not import real bills or sensitive documents until RLS and
    private storage tests pass.

**Final recommendation:** Use **Next.js + TypeScript + Supabase +
Vercel** as the default stack, with local Supabase during development, a
modular-monolith architecture, database-backed jobs, and provider
adapters. The greatest cost-control measure is to keep core rules
deterministic, research calls scheduled and cached, and AI/travel data
integrations optional until their real availability and costs have been
verified.
