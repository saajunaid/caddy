-- Core household model: households, logged-in adults (profiles), people (members), audit log.
-- Every table is scoped to a household and protected by row-level security.
-- New rows are created by trusted server code (service role); signed-in users read and edit their own household.

-- Keep updated_at current on every update.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Households -----------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  timezone text not null default 'Europe/Dublin',
  country_code char(2) not null default 'IE' check (country_code ~ '^[A-Z]{2}$'),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

-- Profiles: one row per adult who can sign in ------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_household_id_idx on public.profiles (household_id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Household members: everyone in the household, including children without logins ----
create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  relationship text not null default 'adult' check (relationship in ('adult', 'child', 'other')),
  date_of_birth date,
  user_id uuid unique references auth.users (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index household_members_household_id_idx on public.household_members (household_id);

create trigger household_members_set_updated_at
  before update on public.household_members
  for each row execute function public.set_updated_at();

-- Audit log: append-only record of important changes. Never store secrets or document text. --
create table public.audit_events (
  id bigint generated always as identity primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_household_created_idx on public.audit_events (household_id, created_at desc);

-- The signed-in user's household --------------------------------------------------
-- security definer so policies can call it without recursing through profiles' own policy.
create function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.profiles where user_id = auth.uid();
$$;

revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated, service_role;

-- Row-level security ---------------------------------------------------------------
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_members enable row level security;
alter table public.audit_events enable row level security;

create policy "Members read their household"
  on public.households for select to authenticated
  using (id = (select public.current_household_id()));

create policy "Members rename their household"
  on public.households for update to authenticated
  using (id = (select public.current_household_id()))
  with check (id = (select public.current_household_id()));

create policy "Members see the adults in their household"
  on public.profiles for select to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Adults edit their own profile"
  on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and household_id = (select public.current_household_id())
  );

create policy "Members read household members"
  on public.household_members for select to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members add household members"
  on public.household_members for insert to authenticated
  with check (household_id = (select public.current_household_id()));

create policy "Members edit household members"
  on public.household_members for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

create policy "Members remove household members"
  on public.household_members for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read their audit log"
  on public.audit_events for select to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members record their own actions"
  on public.audit_events for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and actor_id = (select auth.uid())
  );

-- Privileges: nothing for anonymous visitors; only what the policies allow for signed-in users. --
revoke all on public.households, public.profiles, public.household_members, public.audit_events from anon;
revoke all on public.households, public.profiles, public.household_members, public.audit_events from authenticated;

grant select, update (name, timezone) on public.households to authenticated;
grant select, update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
grant select, insert on public.audit_events to authenticated;

grant all on public.households, public.profiles, public.household_members, public.audit_events to service_role;
