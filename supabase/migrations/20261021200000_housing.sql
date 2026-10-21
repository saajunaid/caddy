-- Housing (Cost Rental Watch): listings, their history, the household's applications,
-- the future pipeline and housing news.
--
-- Listings, observations, projects and research items are public facts shared by every
-- household (no household_id). Signed-in adults who belong to a household can read them;
-- only background jobs (service role) write listings, observations and research items.
-- Applications are user-owned, per household, and are never written by jobs.

-- Listings --------------------------------------------------------------------------------
create table public.housing_listings (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'newstarterhomes' check (source in ('newstarterhomes')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  url text not null check (url like 'https://%'),
  title text not null check (char_length(title) between 1 and 300),
  provider text,
  address_text text,
  locality text,
  county text,
  -- As shown by the source, with "closing_soon" derived from the closing date (≤ 7 days).
  -- "coming_soon" is the source's own "Coming Soon" state (applications not open yet).
  status text not null default 'unknown'
    check (status in ('open', 'closing_soon', 'coming_soon', 'closed', 'unknown')),
  status_text text,
  closing_date date,
  closing_text text,
  rent_from_cents integer check (rent_from_cents is null or rent_from_cents >= 0),
  total_homes integer check (total_homes is null or total_homes >= 0),
  bedrooms_text text,
  apply_url text check (apply_url is null or apply_url like 'http%'),
  listed_on date,
  -- [{label, bedrooms, property_type, rent_cents, homes}] exactly as parsed; unknowns are null.
  unit_types jsonb not null default '[]'::jsonb check (jsonb_typeof(unit_types) = 'array'),
  matches text not null default 'none' check (matches in ('match', 'possible', 'none')),
  min_matching_rent_cents integer
    check (min_matching_rent_cents is null or min_matching_rent_cents >= 0),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  -- 'provider' = the map pin on the listing page; 'osm' = Nominatim lookup of the address.
  geocode_source text check (geocode_source is null or geocode_source in ('provider', 'osm')),
  geocode_query text,
  geocoded_at timestamptz,
  content_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Consecutive complete daily runs in which the listing was missing from the source.
  missed_runs integer not null default 0 check (missed_runs >= 0),
  missing_note text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index housing_listings_status_idx on public.housing_listings (status);
create index housing_listings_first_seen_idx on public.housing_listings (first_seen_at desc);
create index housing_listings_county_idx on public.housing_listings (county);

create trigger housing_listings_set_updated_at
  before update on public.housing_listings
  for each row execute function public.set_updated_at();

-- Observations: one row per first sighting and per change of the listing's content ----------
create table public.housing_observations (
  id uuid primary key default gen_random_uuid(),
  -- restrict: listings and their history are never deleted.
  listing_id uuid not null references public.housing_listings (id) on delete restrict,
  observed_at timestamptz not null default now(),
  content_hash text not null,
  snapshot jsonb not null,
  change_summary text[] not null default '{}',
  job_run_id uuid references public.job_runs (id) on delete set null
);

create index housing_observations_listing_idx
  on public.housing_observations (listing_id, observed_at desc);

-- Applications: the household's own tracking. User-owned; jobs never write here. -----------
create table public.housing_applications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  listing_id uuid not null references public.housing_listings (id) on delete restrict,
  status text not null default 'not_applied'
    check (status in ('not_applied', 'applied', 'lottery_entered', 'offered', 'accepted',
                      'declined', 'unsuccessful', 'withdrawn')),
  applied_on date,
  provider_reference text check (provider_reference is null or char_length(provider_reference) <= 120),
  -- Exact wording from the provider's email or letter.
  outcome_text text check (outcome_text is null or char_length(outcome_text) <= 4000),
  next_action text check (next_action is null or char_length(next_action) <= 300),
  next_action_due date,
  notes text check (notes is null or char_length(notes) <= 4000),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, listing_id)
);

create index housing_applications_listing_idx on public.housing_applications (listing_id);

-- Stamp who changed the row and when. auth.uid() is null for trusted server code.
create function public.housing_stamp_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger housing_applications_stamp
  before insert or update on public.housing_applications
  for each row execute function public.housing_stamp_user();

-- Pipeline: future developments, e.g. Limerick. Public facts any household adult can edit. --
create table public.housing_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  locality text,
  county text,
  provider text,
  stage text,
  total_homes integer check (total_homes is null or total_homes >= 0),
  cost_rental_homes integer check (cost_rental_homes is null or cost_rental_homes >= 0),
  bedroom_mix text,
  cost_rental_confirmed text not null default 'unconfirmed'
    check (cost_rental_confirmed in ('yes', 'no', 'unconfirmed')),
  expected_date_text text,
  source_url text check (source_url is null or source_url like 'http%'),
  notes text check (notes is null or char_length(notes) <= 4000),
  verification text not null default 'lead'
    check (verification in ('lead', 'reported', 'officially_confirmed', 'contradicted',
                            'needs_verification')),
  last_checked_on date,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index housing_projects_county_idx on public.housing_projects (county);

create trigger housing_projects_stamp
  before insert or update on public.housing_projects
  for each row execute function public.housing_stamp_user();

-- Seeded as unverified leads only. Neither is confirmed as Cost Rental.
insert into public.housing_projects
  (name, locality, county, cost_rental_confirmed, verification, notes)
values
  ('St Joseph''s Hospital site, Limerick', 'Limerick City', 'Limerick', 'unconfirmed', 'lead',
   'Unverified lead. Needs current verification from the LDA or Limerick City and County Council before it is treated as a Cost Rental scheme.'),
  ('The Gasworks / Dock Road, Limerick', 'Limerick City', 'Limerick', 'unconfirmed', 'lead',
   'Unverified lead. Needs current verification from the LDA or Limerick City and County Council before it is treated as a Cost Rental scheme.');

-- Research items: housing news delivered by a research agent through /api/ingest/research ---
create table public.research_items (
  id uuid primary key default gen_random_uuid(),
  topic text not null default 'housing' check (topic in ('housing')),
  title text not null check (char_length(title) between 1 and 300),
  url text not null unique check (url like 'http%'),
  source_name text not null check (char_length(source_name) between 1 and 200),
  source_type text not null default 'unknown'
    check (source_type in ('official', 'news', 'social', 'provider', 'unknown')),
  published_on date,
  retrieved_at timestamptz not null default now(),
  summary text check (summary is null or char_length(summary) <= 2000),
  locality text,
  provider text,
  cost_rental_confirmed text not null default 'unconfirmed'
    check (cost_rental_confirmed in ('yes', 'no', 'unconfirmed')),
  verification text not null default 'unverified'
    check (verification in ('officially_confirmed', 'corroborated', 'reported', 'unverified',
                            'contradicted')),
  agent text not null check (char_length(agent) between 1 and 120),
  content_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index research_items_published_idx on public.research_items (published_on desc nulls last);

create trigger research_items_set_updated_at
  before update on public.research_items
  for each row execute function public.set_updated_at();

-- Row-level security -----------------------------------------------------------------------
alter table public.housing_listings enable row level security;
alter table public.housing_observations enable row level security;
alter table public.housing_applications enable row level security;
alter table public.housing_projects enable row level security;
alter table public.research_items enable row level security;

create policy "Household adults read listings"
  on public.housing_listings for select to authenticated
  using ((select public.current_household_id()) is not null);

create policy "Household adults read listing history"
  on public.housing_observations for select to authenticated
  using ((select public.current_household_id()) is not null);

create policy "Members read their applications"
  on public.housing_applications for select to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members add their applications"
  on public.housing_applications for insert to authenticated
  with check (household_id = (select public.current_household_id()));

create policy "Members update their applications"
  on public.housing_applications for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

create policy "Household adults read projects"
  on public.housing_projects for select to authenticated
  using ((select public.current_household_id()) is not null);

create policy "Household adults add projects"
  on public.housing_projects for insert to authenticated
  with check ((select public.current_household_id()) is not null);

create policy "Household adults edit projects"
  on public.housing_projects for update to authenticated
  using ((select public.current_household_id()) is not null)
  with check ((select public.current_household_id()) is not null);

create policy "Household adults read housing news"
  on public.research_items for select to authenticated
  using ((select public.current_household_id()) is not null);

-- Privileges -------------------------------------------------------------------------------
revoke all on public.housing_listings, public.housing_observations, public.housing_applications,
  public.housing_projects, public.research_items from anon;
revoke all on public.housing_listings, public.housing_observations, public.housing_applications,
  public.housing_projects, public.research_items from authenticated;

grant select on public.housing_listings, public.housing_observations, public.research_items
  to authenticated;
grant select on public.housing_projects to authenticated;
grant insert (name, locality, county, provider, stage, total_homes, cost_rental_homes,
              bedroom_mix, cost_rental_confirmed, expected_date_text, source_url, notes,
              verification, last_checked_on)
  on public.housing_projects to authenticated;
grant update (name, locality, county, provider, stage, total_homes, cost_rental_homes,
              bedroom_mix, cost_rental_confirmed, expected_date_text, source_url, notes,
              verification, last_checked_on)
  on public.housing_projects to authenticated;
grant select on public.housing_applications to authenticated;
grant insert (household_id, listing_id, status, applied_on, provider_reference, outcome_text,
              next_action, next_action_due, notes)
  on public.housing_applications to authenticated;
grant update (status, applied_on, provider_reference, outcome_text, next_action,
              next_action_due, notes)
  on public.housing_applications to authenticated;

grant all on public.housing_listings, public.housing_observations, public.housing_applications,
  public.housing_projects, public.research_items to service_role;
