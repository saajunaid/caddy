-- Family & education (R4): tasks, events, lists, schools, school applications and private
-- calendar-feed tokens. Every table is scoped to a household and protected by row-level security.
-- People (adults and children) live in household_members; rows here only point at them.

-- Composite keys so a row can only point at people/lists/schools in its own household.
create unique index if not exists household_members_household_id_id_key
  on public.household_members (household_id, id);

-- Tasks -----------------------------------------------------------------------------------
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 4000),
  due_on date,
  due_time time,
  assignee_member_id uuid,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  recurrence_interval integer not null default 1 check (recurrence_interval between 1 and 365),
  -- First due date of a repeating series, so "31st of each month" survives short months.
  recurrence_anchor_on date,
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  completed_by uuid references auth.users (id) on delete set null,
  related_entity_type text check (related_entity_type is null or char_length(related_entity_type) between 1 and 60),
  related_entity_id text check (related_entity_id is null or char_length(related_entity_id) between 1 and 200),
  related_url text check (related_url is null or related_url ~ '^https?://'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_time is null or due_on is not null),
  check (recurrence = 'none' or due_on is not null),
  check ((status = 'done') = (completed_at is not null)),
  foreign key (household_id, assignee_member_id)
    references public.household_members (household_id, id) on delete set null (assignee_member_id)
);

create index tasks_household_open_idx on public.tasks (household_id, status, due_on);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

-- Events ----------------------------------------------------------------------------------
-- Timed events use starts_at/ends_at (UTC instants). All-day events use start_date/end_date;
-- their starts_at is midnight Dublin time on start_date so range queries work for both.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  start_date date,
  end_date date,
  location text check (location is null or char_length(location) <= 300),
  notes text check (notes is null or char_length(notes) <= 4000),
  member_ids uuid[] not null default '{}',
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'yearly')),
  related_entity_type text check (related_entity_type is null or char_length(related_entity_type) between 1 and 60),
  related_entity_id text check (related_entity_id is null or char_length(related_entity_id) between 1 and 200),
  related_url text check (related_url is null or related_url ~ '^https?://'),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (all_day = (start_date is not null)),
  check (end_date is null or (all_day and end_date >= start_date)),
  check (ends_at is null or ends_at >= starts_at),
  check (cardinality(member_ids) <= 20)
);

create index events_household_starts_idx on public.events (household_id, starts_at);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- member_ids can't carry a foreign key, so check it: everyone listed must be in the event's household.
create function public.events_check_member_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.member_ids) as m(id)
    where not exists (
      select 1 from public.household_members hm
      where hm.id = m.id and hm.household_id = new.household_id
    )
  ) then
    raise exception 'events.member_ids must reference members of the same household';
  end if;
  return new;
end;
$$;

revoke all on function public.events_check_member_ids() from public, anon, authenticated;

create trigger events_check_member_ids
  before insert or update of member_ids, household_id on public.events
  for each row execute function public.events_check_member_ids();

-- Lists -----------------------------------------------------------------------------------
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  kind text not null default 'other' check (kind in ('shopping', 'household', 'packing', 'other')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id)
);

create index lists_household_idx on public.lists (household_id, position);

create trigger lists_set_updated_at
  before update on public.lists
  for each row execute function public.set_updated_at();

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null,
  household_id uuid not null references public.households (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  checked boolean not null default false,
  checked_at timestamptz,
  position integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (checked = (checked_at is not null)),
  foreign key (household_id, list_id) references public.lists (household_id, id) on delete cascade
);

create index list_items_list_idx on public.list_items (list_id, checked, position);
create index list_items_household_idx on public.list_items (household_id);

create trigger list_items_set_updated_at
  before update on public.list_items
  for each row execute function public.set_updated_at();

-- Schools and applications (education planner) -------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  level text not null check (level in ('ecce', 'primary', 'secondary', 'further', 'higher')),
  address text check (address is null or char_length(address) <= 300),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  website text check (website is null or website ~ '^https?://'),
  admissions_policy_url text check (admissions_policy_url is null or admissions_policy_url ~ '^https?://'),
  policy_checked_on date,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, id),
  check ((latitude is null) = (longitude is null))
);

create index schools_household_idx on public.schools (household_id, level);

create trigger schools_set_updated_at
  before update on public.schools
  for each row execute function public.set_updated_at();

create table public.school_applications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  school_id uuid not null,
  child_member_id uuid not null,
  intake_year integer not null check (intake_year between 2000 and 2100),
  status text not null default 'researching'
    check (status in ('researching', 'applied', 'offered', 'accepted', 'declined', 'waitlisted', 'unsuccessful')),
  preference_rank integer check (preference_rank is null or preference_rank between 1 and 50),
  application_deadline date,
  open_day date,
  decision_date date,
  notes text check (notes is null or char_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, child_member_id, intake_year),
  foreign key (household_id, school_id) references public.schools (household_id, id) on delete cascade,
  foreign key (household_id, child_member_id)
    references public.household_members (household_id, id) on delete cascade
);

create index school_applications_household_idx on public.school_applications (household_id);

create trigger school_applications_set_updated_at
  before update on public.school_applications
  for each row execute function public.set_updated_at();

-- Private calendar feed tokens ---------------------------------------------------------------
-- Only a SHA-256 hash is stored; the token itself is shown once when created.
-- Signed-in users can never read token_hash (column privileges below), even for their own household.
create table public.ical_tokens (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label text not null default 'Calendar feed' check (char_length(label) between 1 and 60),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index ical_tokens_household_idx on public.ical_tokens (household_id);

-- Row-level security --------------------------------------------------------------------------
alter table public.tasks enable row level security;
alter table public.events enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.schools enable row level security;
alter table public.school_applications enable row level security;
alter table public.ical_tokens enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'events', 'lists', 'list_items', 'schools', 'school_applications']
  loop
    execute format(
      'create policy "Members read %1$s" on public.%1$I for select to authenticated
         using (household_id = (select public.current_household_id()))', t);
    execute format(
      'create policy "Members add %1$s" on public.%1$I for insert to authenticated
         with check (household_id = (select public.current_household_id()))', t);
    execute format(
      'create policy "Members edit %1$s" on public.%1$I for update to authenticated
         using (household_id = (select public.current_household_id()))
         with check (household_id = (select public.current_household_id()))', t);
    execute format(
      'create policy "Members remove %1$s" on public.%1$I for delete to authenticated
         using (household_id = (select public.current_household_id()))', t);
  end loop;
end;
$$;

create policy "Members see their calendar feeds"
  on public.ical_tokens for select to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Adults create calendar feeds for their household"
  on public.ical_tokens for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and created_by = (select auth.uid())
  );

create policy "Members revoke their calendar feeds"
  on public.ical_tokens for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

-- Privileges -------------------------------------------------------------------------------------
revoke all on public.tasks, public.events, public.lists, public.list_items, public.schools,
  public.school_applications, public.ical_tokens from anon;
revoke all on public.tasks, public.events, public.lists, public.list_items, public.schools,
  public.school_applications, public.ical_tokens from authenticated;

grant select, insert, update, delete on public.tasks, public.events, public.lists, public.list_items,
  public.schools, public.school_applications to authenticated;

-- token_hash is write-only for signed-in users; only the feed endpoint (service role) reads it.
grant select (id, household_id, label, created_by, created_at, last_used_at, revoked_at)
  on public.ical_tokens to authenticated;
grant insert (household_id, token_hash, label, created_by) on public.ical_tokens to authenticated;
grant update (label, revoked_at) on public.ical_tokens to authenticated;

grant all on public.tasks, public.events, public.lists, public.list_items, public.schools,
  public.school_applications, public.ical_tokens to service_role;
