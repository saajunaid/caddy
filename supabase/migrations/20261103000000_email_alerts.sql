-- Email alerts (PLAN D29): each adult can turn email copies of urgent alerts off, and each
-- notification records when it was emailed so it is never emailed twice.

alter table public.profiles
  add column email_alerts boolean not null default true;

-- The existing "Adults edit their own profile" policy limits this to the signed-in adult's row.
grant update (email_alerts) on public.profiles to authenticated;

alter table public.notifications
  add column emailed_at timestamptz;

create index notifications_unemailed_idx
  on public.notifications (created_at)
  where emailed_at is null;
