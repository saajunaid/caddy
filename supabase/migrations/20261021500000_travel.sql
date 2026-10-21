-- Travel planner (R5): trip briefs, travellers with ages at travel, options the family finds
-- (candidates) made of priced components, and ECB reference rates for dated currency conversion.
-- Caddy never searches live prices and never books: every price here is entered by a person.

-- ECB reference rates ---------------------------------------------------------------------------
-- Global public data (no household): units of `currency` per 1 EUR on `rate_date`, as the ECB
-- publishes them. Written only by the fx-ecb job (service role); readable by household members.
create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  rate_date date not null,
  base char(3) not null default 'EUR' check (base = 'EUR'),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$' and currency <> 'EUR'),
  rate numeric(18, 8) not null check (rate > 0),
  source text not null default 'ECB' check (source in ('ECB')),
  fetched_at timestamptz not null default now(),
  unique (rate_date, currency),
  -- Lets components reference a rate together with its currency, so a component can never
  -- point at another currency's rate.
  unique (id, currency)
);

create index fx_rates_currency_date_idx on public.fx_rates (currency, rate_date desc);

-- Trips -------------------------------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- Travel window: the earliest departure and the latest return the family can do.
  date_from date not null,
  date_to date not null,
  nights_min integer check (nights_min between 1 and 365),
  nights_max integer check (nights_max between 1 and 365),
  departure_airports text[] not null default '{DUB}'
    check (cardinality(departure_airports) between 1 and 8),
  destination_ideas text check (char_length(destination_ideas) <= 500),
  budget_cents integer check (budget_cents >= 0),
  board_basis text not null default 'any' check (
    board_basis in ('room_only', 'self_catering', 'breakfast', 'half_board', 'full_board', 'all_inclusive', 'any')
  ),
  room_needs text check (char_length(room_needs) <= 500),
  max_stops integer check (max_stops between 0 and 5),
  max_flight_minutes integer check (max_flight_minutes between 30 and 2880),
  require_free_cancellation boolean not null default false,
  status text not null default 'planning' check (status in ('planning', 'booked', 'archived')),
  notes text check (char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_to >= date_from),
  check (nights_min is null or nights_max is null or nights_max >= nights_min),
  -- Children reference (id, household_id) so their household always matches the trip's.
  unique (id, household_id)
);

create index trips_household_idx on public.trips (household_id, date_from);

create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- Travellers: who is going, with ages at travel confirmed per trip (ages change) -----------------
create table public.trip_travellers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid references public.household_members (id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  is_child boolean not null default false,
  age_at_travel integer check (age_at_travel between 0 and 120),
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (trip_id, household_id) references public.trips (id, household_id) on delete cascade,
  -- A child's age can only be confirmed once it is known.
  check (not (confirmed and is_child and age_at_travel is null))
);

create index trip_travellers_trip_idx on public.trip_travellers (trip_id);
create index trip_travellers_household_idx on public.trip_travellers (household_id);

create trigger trip_travellers_set_updated_at
  before update on public.trip_travellers
  for each row execute function public.set_updated_at();

-- Candidates: one option the family found (destination + dates) --------------------------------
create table public.trip_candidates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  destination text not null check (char_length(destination) between 1 and 120),
  -- Optional IATA airport code and ISO country, used for search and travel-advice links.
  destination_airport char(3) check (destination_airport ~ '^[A-Z]{3}$'),
  destination_country char(2) check (destination_country ~ '^[A-Z]{2}$'),
  outbound_date date not null,
  return_date date not null,
  nights integer generated always as (return_date - outbound_date) stored,
  departure_airport text not null default 'DUB' check (char_length(departure_airport) between 1 and 40),
  notes text check (char_length(notes) <= 4000),
  trade_offs text check (char_length(trade_offs) <= 2000),
  status text not null default 'option' check (status in ('option', 'shortlisted', 'rejected', 'booked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (return_date > outbound_date),
  foreign key (trip_id, household_id) references public.trips (id, household_id) on delete cascade,
  unique (id, household_id)
);

create index trip_candidates_trip_idx on public.trip_candidates (trip_id);
create index trip_candidates_household_idx on public.trip_candidates (household_id);

create trigger trip_candidates_set_updated_at
  before update on public.trip_candidates
  for each row execute function public.set_updated_at();

-- Components: each priced part of a candidate, exactly as the family found it --------------------
create table public.trip_components (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (
    kind in ('flight', 'accommodation', 'transfer', 'car_hire', 'insurance', 'meals', 'activities', 'other')
  ),
  provider text check (char_length(provider) between 1 and 120),
  description text check (char_length(description) <= 500),
  -- Integer minor units of `currency` (cents for EUR, whole yen for JPY). Never a float.
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- The ECB rate used to convert to EUR: the latest on or before the checked date.
  fx_rate_id uuid,
  is_estimate boolean not null default false,
  includes text check (char_length(includes) <= 500),
  excludes text check (char_length(excludes) <= 500),
  booking_url text check (booking_url is null or (booking_url ~ '^https://[^\s]+$' and char_length(booking_url) <= 2000)),
  cancellation_terms text check (char_length(cancellation_terms) <= 500),
  -- Accommodation: free cancellation (null = not recorded) and board basis as booked.
  free_cancellation boolean,
  board_basis text check (
    board_basis in ('room_only', 'self_catering', 'breakfast', 'half_board', 'full_board', 'all_inclusive')
  ),
  -- Flights: most stops and longest one-way journey time across the legs (null = not recorded).
  stops integer check (stops between 0 and 5),
  duration_minutes integer check (duration_minutes between 1 and 2880),
  checked_at timestamptz not null default now(),
  source text not null default 'user' check (source in ('user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (candidate_id, household_id)
    references public.trip_candidates (id, household_id) on delete cascade,
  foreign key (fx_rate_id, currency)
    references public.fx_rates (id, currency) on delete set null (fx_rate_id),
  -- A real price names who quoted it; only estimates may leave the provider out.
  check (is_estimate or provider is not null),
  check (currency <> 'EUR' or fx_rate_id is null)
);

create index trip_components_candidate_idx on public.trip_components (candidate_id);
create index trip_components_household_idx on public.trip_components (household_id);

create trigger trip_components_set_updated_at
  before update on public.trip_components
  for each row execute function public.set_updated_at();

-- Row-level security -------------------------------------------------------------------------------
alter table public.fx_rates enable row level security;
alter table public.trips enable row level security;
alter table public.trip_travellers enable row level security;
alter table public.trip_candidates enable row level security;
alter table public.trip_components enable row level security;

create policy "Members read exchange rates"
  on public.fx_rates for select to authenticated
  using ((select public.current_household_id()) is not null);

create policy "Members read their trips"
  on public.trips for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add trips"
  on public.trips for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit their trips"
  on public.trips for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members delete their trips"
  on public.trips for delete to authenticated
  using (household_id = (select public.current_household_id()));

-- Travellers may link a household member, but only one from the same household.
create policy "Members read their travellers"
  on public.trip_travellers for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add travellers"
  on public.trip_travellers for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and (
      member_id is null
      or exists (
        select 1 from public.household_members m
        where m.id = member_id and m.household_id = trip_travellers.household_id
      )
    )
  );
create policy "Members edit travellers"
  on public.trip_travellers for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (
    household_id = (select public.current_household_id())
    and (
      member_id is null
      or exists (
        select 1 from public.household_members m
        where m.id = member_id and m.household_id = trip_travellers.household_id
      )
    )
  );
create policy "Members remove travellers"
  on public.trip_travellers for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read their trip options"
  on public.trip_candidates for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add trip options"
  on public.trip_candidates for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit trip options"
  on public.trip_candidates for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members delete trip options"
  on public.trip_candidates for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read their trip prices"
  on public.trip_components for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add trip prices"
  on public.trip_components for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit trip prices"
  on public.trip_components for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members delete trip prices"
  on public.trip_components for delete to authenticated
  using (household_id = (select public.current_household_id()));

-- Privileges ------------------------------------------------------------------------------------------
revoke all on public.fx_rates, public.trips, public.trip_travellers, public.trip_candidates, public.trip_components from anon;
revoke all on public.fx_rates, public.trips, public.trip_travellers, public.trip_candidates, public.trip_components from authenticated;

grant select on public.fx_rates to authenticated;
grant select, insert, update, delete on public.trips, public.trip_travellers, public.trip_candidates, public.trip_components to authenticated;

grant all on public.fx_rates, public.trips, public.trip_travellers, public.trip_candidates, public.trip_components to service_role;
