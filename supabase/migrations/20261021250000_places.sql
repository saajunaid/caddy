-- Nearby places: childcare, schools, colleges, bus stops, mosques and halal food around a home.
-- Cached public data (OpenStreetMap, Google, official registers) is global and written only by
-- trusted server code. Places an adult adds, and pins/hides, are private to their household.

-- Places --------------------------------------------------------------------------------------
-- household_id is null for cached public data and set for places a household added itself.
create table public.places (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  source text not null check (source in ('osm', 'google', 'official', 'user')),
  -- The source's own id ("node/123" for OSM, the place id for Google). Null for user places.
  source_id text check (source_id is null or char_length(source_id) between 1 and 200),
  category text not null
    check (category in ('childcare', 'primary', 'secondary', 'school', 'higher', 'bus', 'mosque', 'halal')),
  name text not null check (char_length(name) between 1 and 200),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  address text check (address is null or char_length(address) <= 300),
  -- A small subset of source fields: opening hours, website, stop number, a user's note.
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_by uuid references auth.users (id) on delete set null,
  fetched_at timestamptz not null default now(),
  refresh_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only user-added places belong to a household, and they never pretend to come from a source.
  constraint places_user_rows_are_private check (
    (source = 'user' and household_id is not null and source_id is null)
    or (source <> 'user' and household_id is null and source_id is not null)
  ),
  -- Nulls are distinct, so user places (no source_id) never collide.
  constraint places_source_source_id_key unique (source, source_id)
);

create index places_location_idx on public.places (latitude, longitude);
create index places_household_idx on public.places (household_id);
create index places_category_idx on public.places (category);

create trigger places_set_updated_at
  before update on public.places
  for each row execute function public.set_updated_at();

-- Searches: which locations have been looked up, so we don't ask the same source twice -------
-- One row per source, rounded location (~100 m) and category-set version. Global, like the cache.
create table public.place_searches (
  id uuid primary key default gen_random_uuid(),
  anchor_key text not null check (char_length(anchor_key) between 1 and 200),
  latitude numeric(8, 3) not null check (latitude between -90 and 90),
  longitude numeric(8, 3) not null check (longitude between -180 and 180),
  categories_version text not null check (char_length(categories_version) between 1 and 40),
  source text not null check (source in ('osm', 'google', 'official')),
  status text not null check (status in ('ok', 'failed', 'skipped')),
  items_seen integer check (items_seen is null or items_seen >= 0),
  error text check (error is null or char_length(error) <= 500),
  searched_at timestamptz not null default now(),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, latitude, longitude, categories_version)
);

create index place_searches_searched_idx on public.place_searches (searched_at desc);

-- Household marks: pin favourites, hide wrong ones -------------------------------------------
create table public.household_place_marks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  mark text not null check (mark in ('pinned', 'hidden')),
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, place_id)
);

create index household_place_marks_place_idx on public.household_place_marks (place_id);

create trigger household_place_marks_set_updated_at
  before update on public.household_place_marks
  for each row execute function public.set_updated_at();

-- Row-level security ---------------------------------------------------------------------------
alter table public.places enable row level security;
alter table public.place_searches enable row level security;
alter table public.household_place_marks enable row level security;

create policy "Members read cached places and their household's own"
  on public.places for select to authenticated
  using (
    (household_id is null and (select public.current_household_id()) is not null)
    or household_id = (select public.current_household_id())
  );

create policy "Members add places for their household"
  on public.places for insert to authenticated
  with check (
    source = 'user'
    and household_id = (select public.current_household_id())
    and created_by = (select auth.uid())
  );

create policy "Members edit their household's places"
  on public.places for update to authenticated
  using (source = 'user' and household_id = (select public.current_household_id()))
  with check (source = 'user' and household_id = (select public.current_household_id()));

create policy "Members remove their household's places"
  on public.places for delete to authenticated
  using (source = 'user' and household_id = (select public.current_household_id()));

create policy "Members read place searches"
  on public.place_searches for select to authenticated
  using ((select public.current_household_id()) is not null);

create policy "Members read their marks"
  on public.household_place_marks for select to authenticated
  using (household_id = (select public.current_household_id()));

-- Marks can only point at places the household can see (the subquery runs under places' RLS).
create policy "Members mark visible places"
  on public.household_place_marks for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and exists (select 1 from public.places p where p.id = place_id)
  );

create policy "Members change their marks"
  on public.household_place_marks for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

create policy "Members remove their marks"
  on public.household_place_marks for delete to authenticated
  using (household_id = (select public.current_household_id()));

-- Privileges -------------------------------------------------------------------------------------
revoke all on public.places, public.place_searches, public.household_place_marks from anon;
revoke all on public.places, public.place_searches, public.household_place_marks from authenticated;

grant select, insert, delete on public.places to authenticated;
grant update (name, category, latitude, longitude, address, details) on public.places to authenticated;
grant select on public.place_searches to authenticated;
grant select, insert, delete on public.household_place_marks to authenticated;
grant update (mark, note) on public.household_place_marks to authenticated;

grant all on public.places, public.place_searches, public.household_place_marks to service_role;
