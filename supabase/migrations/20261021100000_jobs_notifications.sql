-- Background job ledger, in-app notifications and web push subscriptions.
-- Jobs run in GitHub Actions with the secret key; signed-in users can read results for their household.

-- Job runs ---------------------------------------------------------------------------
-- household_id is null for system-wide jobs (for example the daily housing check).
create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households (id) on delete cascade,
  job_type text not null check (char_length(job_type) between 1 and 80),
  idempotency_key text not null unique,
  trigger text not null default 'schedule' check (trigger in ('schedule', 'manual', 'event')),
  status text not null default 'running'
    check (status in ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'cancelled')),
  attempt integer not null default 1 check (attempt >= 1),
  summary text,
  error text,
  stats jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index job_runs_type_started_idx on public.job_runs (job_type, started_at desc);
create index job_runs_household_idx on public.job_runs (household_id);

-- One row per source a job checked, so "zero results" and "source failed" are never confused.
create table public.job_source_checks (
  id uuid primary key default gen_random_uuid(),
  job_run_id uuid not null references public.job_runs (id) on delete cascade,
  source text not null,
  url text,
  status text not null check (status in ('ok', 'failed', 'skipped')),
  http_status integer,
  items_seen integer,
  error text,
  checked_at timestamptz not null default now()
);

create index job_source_checks_run_idx on public.job_source_checks (job_run_id);

-- Notifications ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 60),
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null check (char_length(title) between 1 and 160),
  body text,
  action_url text check (action_url is null or action_url like '/%'),
  dedupe_key text not null,
  job_run_id uuid references public.job_runs (id) on delete set null,
  push boolean not null default true,
  pushed_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (household_id, dedupe_key)
);

create index notifications_household_created_idx on public.notifications (household_id, created_at desc);
create index notifications_unpushed_idx on public.notifications (created_at) where push and pushed_at is null;

-- Web push subscriptions: one per device per adult ------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz
);

create index push_subscriptions_household_idx on public.push_subscriptions (household_id);

-- Row-level security ---------------------------------------------------------------------------
alter table public.job_runs enable row level security;
alter table public.job_source_checks enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "Members read their household's and system job runs"
  on public.job_runs for select to authenticated
  using (
    (household_id is null and (select public.current_household_id()) is not null)
    or household_id = (select public.current_household_id())
  );

create policy "Members read source checks of visible runs"
  on public.job_source_checks for select to authenticated
  using (exists (select 1 from public.job_runs r where r.id = job_run_id));

create policy "Members read their notifications"
  on public.notifications for select to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members mark notifications read"
  on public.notifications for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

create policy "Adults see their own devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Adults register their own devices"
  on public.push_subscriptions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and household_id = (select public.current_household_id())
  );

create policy "Adults remove their own devices"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Privileges -------------------------------------------------------------------------------------
revoke all on public.job_runs, public.job_source_checks, public.notifications, public.push_subscriptions from anon;
revoke all on public.job_runs, public.job_source_checks, public.notifications, public.push_subscriptions from authenticated;

grant select on public.job_runs, public.job_source_checks to authenticated;
grant select, update (read_at) on public.notifications to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

grant all on public.job_runs, public.job_source_checks, public.notifications, public.push_subscriptions to service_role;
