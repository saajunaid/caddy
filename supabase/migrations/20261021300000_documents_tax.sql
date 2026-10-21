-- Bills, documents and Irish tax evidence (R2).
-- Originals live once in the private "household-documents" storage bucket; rows here hold metadata,
-- proposed fields from the deterministic parsers, links to what each document is used for,
-- household expenses, tax years, versioned tax rules and remote working (WFH) evidence.
-- Money is integer cents (bigint): exact, never floating point. Extracted document text is never stored.

-- Household members need (id, household_id) as a key so child tables can prove a member belongs
-- to the same household (a plain FK on id would let a row point at another household's member).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'household_members_id_household_id_key'
  ) then
    alter table public.household_members
      add constraint household_members_id_household_id_key unique (id, household_id);
  end if;
end;
$$;

-- Documents ----------------------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp')
  ),
  size_bytes integer not null check (size_bytes between 1 and 20971520),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  document_type text check (
    document_type in ('electricity_bill', 'gas_bill', 'dual_fuel_bill', 'broadband_bill', 'receipt', 'other')
  ),
  supplier text check (char_length(supplier) between 1 and 120),
  document_date date,
  period_start date,
  period_end date,
  due_date date,
  total_cents bigint check (total_cents between -100000000000 and 100000000000),
  vat_cents bigint check (vat_cents between -100000000000 and 100000000000),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  -- Other reviewed fields (masked account/meter numbers, units, rates, standing charge, invoice no.).
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  -- Field keys the user has confirmed. Their values are user-owned: nothing automated may overwrite them.
  confirmed_fields text[] not null default '{}',
  review_status text not null default 'processing'
    check (review_status in ('processing', 'needs_review', 'confirmed')),
  uploaded_by uuid references auth.users (id) on delete set null,
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, sha256),
  unique (id, household_id),
  -- Objects live at <household_id>/<document_id>/<safe file name>.
  check (storage_path like household_id::text || '/' || id::text || '/%'),
  check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  check (period_start is null or period_end is null or period_end >= period_start)
);

create index documents_household_created_idx on public.documents (household_id, created_at desc);
create index documents_review_idx on public.documents (household_id, review_status);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- What the parsers proposed for a document. One row per reading; the newest is shown for review.
create table public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  document_id uuid not null,
  extractor text not null check (char_length(extractor) between 1 and 80),
  extractor_version text not null check (char_length(extractor_version) between 1 and 40),
  text_source text not null check (text_source in ('text-layer', 'ocr', 'none')),
  text_chars integer not null default 0 check (text_chars >= 0),
  proposed jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed) = 'object'),
  confidence jsonb not null default '{}'::jsonb check (jsonb_typeof(confidence) = 'object'),
  snippets jsonb not null default '{}'::jsonb check (jsonb_typeof(snippets) = 'object'),
  candidates jsonb not null default '{}'::jsonb check (jsonb_typeof(candidates) = 'object'),
  warnings text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (document_id, household_id)
    references public.documents (id, household_id) on delete cascade
);

create index document_extractions_document_idx on public.document_extractions (document_id, created_at desc);
create index document_extractions_household_idx on public.document_extractions (household_id);

-- Expenses -------------------------------------------------------------------------------------------
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  document_id uuid unique,
  merchant text not null check (char_length(merchant) between 1 and 120),
  expense_date date not null,
  category text not null check (
    category in (
      'utilities_electricity', 'utilities_gas', 'broadband', 'groceries', 'childcare',
      'education', 'transport', 'housing', 'health', 'other'
    )
  ),
  amount_cents bigint not null check (amount_cents between -100000000000 and 100000000000),
  currency char(3) not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  payment_status text not null default 'unknown' check (payment_status in ('paid', 'unpaid', 'unknown')),
  is_recurring boolean not null default false,
  notes text check (char_length(notes) <= 2000),
  review_status text not null default 'confirmed' check (review_status in ('needs_review', 'confirmed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id),
  foreign key (document_id, household_id)
    references public.documents (id, household_id) on delete set null (document_id)
);

create index expenses_household_date_idx on public.expenses (household_id, expense_date desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- Document links: one stored original, many uses -------------------------------------------------------
create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  document_id uuid not null,
  entity_type text not null check (entity_type ~ '^[a-z][a-z_]{1,39}$'),
  entity_id text not null check (char_length(entity_id) between 1 and 100),
  purpose text not null check (purpose in ('household_spending', 'tax_evidence', 'utility_usage', 'other')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, entity_type, entity_id),
  foreign key (document_id, household_id)
    references public.documents (id, household_id) on delete cascade
);

create index document_links_household_idx on public.document_links (household_id);
create index document_links_entity_idx on public.document_links (entity_type, entity_id);

-- Tax years, rules and evidence --------------------------------------------------------------------------
create table public.tax_years (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  jurisdiction text not null default 'IE' check (jurisdiction in ('IE')),
  year integer not null check (year between 2000 and 2100),
  status text not null default 'collecting' check (status in ('collecting', 'ready', 'claimed')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, jurisdiction, year),
  unique (id, household_id)
);

create trigger tax_years_set_updated_at
  before update on public.tax_years
  for each row execute function public.set_updated_at();

-- Global, versioned rules with their official source. Members can read; only migrations write.
create table public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null check (jurisdiction in ('IE')),
  rule_code text not null check (rule_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  version integer not null check (version >= 1),
  tax_year_from integer not null check (tax_year_from between 2000 and 2100),
  tax_year_to integer check (tax_year_to between 2000 and 2100),
  rule_json jsonb not null check (jsonb_typeof(rule_json) = 'object'),
  official_source_url text not null check (official_source_url like 'https://%'),
  reviewed_on date not null,
  status text not null default 'active' check (status in ('draft', 'active', 'superseded')),
  created_at timestamptz not null default now(),
  unique (jurisdiction, rule_code, version),
  check (tax_year_to is null or tax_year_to >= tax_year_from)
);

create table public.tax_evidence_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  tax_year_id uuid not null,
  document_id uuid,
  expense_id uuid,
  member_id uuid not null,
  category text not null check (
    category in (
      'remote_working_electricity', 'remote_working_heating', 'remote_working_broadband',
      'employer_remote_working_allowance', 'medical', 'other'
    )
  ),
  -- Amount counted for this tax year (the bill total by default).
  paid_cents bigint not null check (paid_cents between 0 and 100000000000),
  -- This member's share of a bill shared between adults.
  share_percent numeric(5, 2) not null default 100 check (share_percent > 0 and share_percent <= 100),
  notes text check (char_length(notes) <= 2000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tax_year_id, member_id, category, document_id),
  foreign key (tax_year_id, household_id)
    references public.tax_years (id, household_id) on delete cascade,
  foreign key (document_id, household_id)
    references public.documents (id, household_id) on delete cascade,
  foreign key (expense_id, household_id)
    references public.expenses (id, household_id) on delete set null (expense_id),
  foreign key (member_id, household_id)
    references public.household_members (id, household_id) on delete cascade
);

create index tax_evidence_items_household_idx on public.tax_evidence_items (household_id);
create index tax_evidence_items_year_idx on public.tax_evidence_items (tax_year_id);
create index tax_evidence_items_document_idx on public.tax_evidence_items (document_id);

create trigger tax_evidence_items_set_updated_at
  before update on public.tax_evidence_items
  for each row execute function public.set_updated_at();

-- Days worked from home, per member per month.
create table public.wfh_days (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  member_id uuid not null,
  tax_year integer not null check (tax_year between 2000 and 2100),
  month smallint not null check (month between 1 and 12),
  days smallint not null check (
    days >= 0
    and days <= extract(day from (make_date(tax_year, month, 1) + interval '1 month' - interval '1 day'))
  ),
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, tax_year, month),
  foreign key (member_id, household_id)
    references public.household_members (id, household_id) on delete cascade
);

create index wfh_days_household_year_idx on public.wfh_days (household_id, tax_year);

create trigger wfh_days_set_updated_at
  before update on public.wfh_days
  for each row execute function public.set_updated_at();

-- Seed: Irish remote working relief, 2022 onwards ------------------------------------------------------------
insert into public.tax_rules
  (jurisdiction, rule_code, version, tax_year_from, tax_year_to, rule_json, official_source_url, reviewed_on, status)
values (
  'IE',
  'IE_REMOTE_WORKING_RELIEF',
  1,
  2022,
  null,
  jsonb_build_object(
    'title', 'Remote working relief',
    'formula', '((A × B ÷ C) − D) × 30%',
    'rate_percent', 30,
    'variables', jsonb_build_object(
      'A', 'Allowable bills: vouched electricity, heating and broadband costs for the year (the claimant''s share if the bills are shared)',
      'B', 'Number of remote working days in the year',
      'C', 'Number of days in the year (365, or 366 in a leap year)',
      'D', 'Remote working allowance paid by the employer for the year'
    ),
    'categories', jsonb_build_array(
      'remote_working_electricity', 'remote_working_heating', 'remote_working_broadband'
    ),
    'allowance_category', 'employer_remote_working_allowance',
    'notes', jsonb_build_array(
      'Relief is given at the claimant''s highest rate of income tax.',
      'Bills shared between people are apportioned by each person''s share of the cost.',
      'Verify every figure in Revenue myAccount before claiming. Caddy organises evidence and estimates; it never files a claim.'
    )
  ),
  'https://www.revenue.ie/en/jobs-and-pensions/eworking/calculate-allowable-remote-working-costs.aspx',
  date '2026-10-21',
  'active'
);

-- Row-level security ----------------------------------------------------------------------------------------
alter table public.documents enable row level security;
alter table public.document_extractions enable row level security;
alter table public.document_links enable row level security;
alter table public.expenses enable row level security;
alter table public.tax_years enable row level security;
alter table public.tax_rules enable row level security;
alter table public.tax_evidence_items enable row level security;
alter table public.wfh_days enable row level security;

create policy "Members read their documents"
  on public.documents for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add documents"
  on public.documents for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and (uploaded_by is null or uploaded_by = (select auth.uid()))
  );
create policy "Members review documents"
  on public.documents for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members delete documents"
  on public.documents for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read extractions"
  on public.document_extractions for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add extractions"
  on public.document_extractions for insert to authenticated
  with check (household_id = (select public.current_household_id()));

create policy "Members read document links"
  on public.document_links for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add document links"
  on public.document_links for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members remove document links"
  on public.document_links for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read expenses"
  on public.expenses for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add expenses"
  on public.expenses for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit expenses"
  on public.expenses for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members delete expenses"
  on public.expenses for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read tax years"
  on public.tax_years for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add tax years"
  on public.tax_years for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit tax years"
  on public.tax_years for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

create policy "Household members read tax rules"
  on public.tax_rules for select to authenticated
  using ((select public.current_household_id()) is not null);

create policy "Members read tax evidence"
  on public.tax_evidence_items for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add tax evidence"
  on public.tax_evidence_items for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit tax evidence"
  on public.tax_evidence_items for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members remove tax evidence"
  on public.tax_evidence_items for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read WFH days"
  on public.wfh_days for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add WFH days"
  on public.wfh_days for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit WFH days"
  on public.wfh_days for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members remove WFH days"
  on public.wfh_days for delete to authenticated
  using (household_id = (select public.current_household_id()));

-- Privileges -------------------------------------------------------------------------------------------------
revoke all on public.documents, public.document_extractions, public.document_links, public.expenses,
  public.tax_years, public.tax_rules, public.tax_evidence_items, public.wfh_days from anon;
revoke all on public.documents, public.document_extractions, public.document_links, public.expenses,
  public.tax_years, public.tax_rules, public.tax_evidence_items, public.wfh_days from authenticated;

grant select, insert, delete on public.documents to authenticated;
-- The file itself (path, hash, size, type) never changes after upload; only reviewed fields do.
grant update (
  document_type, supplier, document_date, period_start, period_end, due_date, total_cents, vat_cents,
  currency, details, confirmed_fields, review_status, confirmed_by, confirmed_at
) on public.documents to authenticated;
grant select, insert on public.document_extractions to authenticated;
grant select, insert, delete on public.document_links to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update on public.tax_years to authenticated;
grant select on public.tax_rules to authenticated;
grant select, insert, update, delete on public.tax_evidence_items to authenticated;
grant select, insert, update, delete on public.wfh_days to authenticated;

grant all on public.documents, public.document_extractions, public.document_links, public.expenses,
  public.tax_years, public.tax_rules, public.tax_evidence_items, public.wfh_days to service_role;

-- Storage: private bucket for originals ----------------------------------------------------------------------
-- Guarded so the migration also applies to the plain-Postgres test database, which has no storage schema.
-- BEGIN storage
do $storage$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'household-documents',
      'household-documents',
      false,
      20971520,
      array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
    )
    on conflict (id) do update set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute $p$drop policy if exists "Members upload household documents" on storage.objects$p$;
    execute $p$drop policy if exists "Members read household documents" on storage.objects$p$;
    execute $p$drop policy if exists "Members delete household documents" on storage.objects$p$;

    execute $p$
      create policy "Members upload household documents"
        on storage.objects for insert to authenticated
        with check (
          bucket_id = 'household-documents'
          and (storage.foldername(name))[1] = (select public.current_household_id())::text
        )
    $p$;
    execute $p$
      create policy "Members read household documents"
        on storage.objects for select to authenticated
        using (
          bucket_id = 'household-documents'
          and (storage.foldername(name))[1] = (select public.current_household_id())::text
        )
    $p$;
    execute $p$
      create policy "Members delete household documents"
        on storage.objects for delete to authenticated
        using (
          bucket_id = 'household-documents'
          and (storage.foldername(name))[1] = (select public.current_household_id())::text
        )
    $p$;
  end if;
end;
$storage$;
-- END storage
