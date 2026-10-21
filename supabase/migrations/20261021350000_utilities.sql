-- Utilities (R3): contracts with a 14-day comparison reminder, usage per bill period,
-- offers the household copies from comparison sites, comparison snapshots and supplier exclusions.
-- Tariff numbers only ever come from the household (provenance "user"); nothing is scraped.

-- Contracts --------------------------------------------------------------------------------
create table public.utility_contracts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  utility_type text not null
    check (utility_type in ('electricity', 'gas', 'dual_fuel', 'broadband', 'mobile', 'home_insurance')),
  supplier text not null check (char_length(supplier) between 1 and 80),
  tariff_name text check (char_length(tariff_name) <= 120),
  -- Free text such as "•••• 4821". Never a full account number or MPRN/GPRN.
  account_label text check (char_length(account_label) <= 60 and account_label !~ '[0-9]{7,}'),
  meter_type text not null default 'unknown'
    check (meter_type in ('smart_tou', 'smart_24h', 'day_night', 'standard', 'unknown')),
  contract_start date,
  -- Null means the end date is unknown; the app prompts for it.
  contract_end date,
  -- The 14-day rule: calendar dates, so daylight saving can't shift it. Follows contract_end.
  comparison_due_on date generated always as (contract_end - 14) stored,
  status text not null default 'active' check (status in ('active', 'ended', 'switching')),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets child tables prove their contract belongs to the same household.
  unique (household_id, id),
  check (contract_start is null or contract_end is null or contract_end > contract_start)
);

create index utility_contracts_household_idx on public.utility_contracts (household_id);
create index utility_contracts_due_idx on public.utility_contracts (comparison_due_on) where status = 'active';

create trigger utility_contracts_set_updated_at
  before update on public.utility_contracts
  for each row execute function public.set_updated_at();

-- Usage per bill period ----------------------------------------------------------------------
-- kWh per band as printed on the bill. Null = not on this bill (not zero).
create table public.utility_usage (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  contract_id uuid not null,
  period_start date not null,
  period_end date not null,
  day_kwh numeric(10, 3) check (day_kwh >= 0),
  night_kwh numeric(10, 3) check (night_kwh >= 0),
  peak_kwh numeric(10, 3) check (peak_kwh >= 0),
  standard_kwh numeric(10, 3) check (standard_kwh >= 0),
  gas_kwh numeric(10, 3) check (gas_kwh >= 0),
  total_cents integer check (total_cents >= 0),
  source text not null default 'manual' check (source in ('manual', 'bill')),
  -- Confirmed bill from the Documents module. No foreign key: documents live in another module.
  document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, contract_id)
    references public.utility_contracts (household_id, id) on delete cascade,
  check (period_end > period_start),
  check (num_nonnulls(day_kwh, night_kwh, peak_kwh, standard_kwh, gas_kwh) >= 1)
);

create index utility_usage_contract_idx on public.utility_usage (contract_id, period_start);
create index utility_usage_household_idx on public.utility_usage (household_id);

create trigger utility_usage_set_updated_at
  before update on public.utility_usage
  for each row execute function public.set_updated_at();

-- Offers ----------------------------------------------------------------------------------------
-- Copied by the household from bonkers.ie, switcher.ie or a supplier's site, with source and date.
-- Unit rates are cents per kWh excluding VAT; the standing charge is cents per year excluding VAT.
create table public.tariff_offers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  contract_id uuid not null,
  supplier text not null check (char_length(supplier) between 1 and 80),
  tariff_name text check (char_length(tariff_name) <= 120),
  utility_type text not null
    check (utility_type in ('electricity', 'gas', 'dual_fuel', 'broadband', 'mobile', 'home_insurance')),
  day_rate_cents numeric(9, 4) check (day_rate_cents >= 0),
  night_rate_cents numeric(9, 4) check (night_rate_cents >= 0),
  peak_rate_cents numeric(9, 4) check (peak_rate_cents >= 0),
  standard_rate_cents numeric(9, 4) check (standard_rate_cents >= 0),
  gas_rate_cents numeric(9, 4) check (gas_rate_cents >= 0),
  standing_charge_cents_per_year integer not null default 0 check (standing_charge_cents_per_year >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  -- Discounts apply to unit rates; some also cover the standing charge.
  discount_includes_standing boolean not null default false,
  discount_months integer not null default 0 check (discount_months between 0 and 12),
  cashback_cents integer not null default 0 check (cashback_cents >= 0),
  -- Fee for leaving the current contract early to take this offer.
  exit_fee_cents integer not null default 0 check (exit_fee_cents >= 0),
  vat_percent numeric(4, 2) not null default 9.00 check (vat_percent between 0 and 50),
  source_url text check (source_url ~ '^https?://' and char_length(source_url) <= 500),
  checked_on date not null,
  notes text check (char_length(notes) <= 2000),
  decision text check (decision in ('selected', 'rejected', 'negotiating')),
  -- The current supplier's renewal price: the baseline for "vs renewal".
  is_current_renewal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (household_id, contract_id)
    references public.utility_contracts (household_id, id) on delete cascade
);

create index tariff_offers_contract_idx on public.tariff_offers (contract_id);
create index tariff_offers_household_idx on public.tariff_offers (household_id);
create unique index tariff_offers_one_renewal_idx on public.tariff_offers (contract_id) where is_current_renewal;

create trigger tariff_offers_set_updated_at
  before update on public.tariff_offers
  for each row execute function public.set_updated_at();

-- Comparison snapshots ------------------------------------------------------------------------
-- Frozen copy of the computed table, so later bills can be checked against expected savings.
create table public.utility_comparisons (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  contract_id uuid not null,
  trigger text not null check (trigger in ('due', 'manual')),
  contract_end date,
  -- One "due" snapshot per contract end date; null for manual snapshots.
  dedupe_key text,
  usage_basis jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (household_id, contract_id)
    references public.utility_contracts (household_id, id) on delete cascade,
  unique (household_id, dedupe_key)
);

create index utility_comparisons_contract_idx on public.utility_comparisons (contract_id, created_at desc);

-- Preferences --------------------------------------------------------------------------------
-- No household_preferences table exists yet, so utilities keeps its own.
create table public.utility_preferences (
  household_id uuid primary key references public.households (id) on delete cascade,
  excluded_suppliers text[] not null default '{"Bord Gáis Energy"}'
    check (cardinality(excluded_suppliers) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger utility_preferences_set_updated_at
  before update on public.utility_preferences
  for each row execute function public.set_updated_at();

-- Row-level security ---------------------------------------------------------------------------
alter table public.utility_contracts enable row level security;
alter table public.utility_usage enable row level security;
alter table public.tariff_offers enable row level security;
alter table public.utility_comparisons enable row level security;
alter table public.utility_preferences enable row level security;

create policy "Members read utility contracts"
  on public.utility_contracts for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add utility contracts"
  on public.utility_contracts for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit utility contracts"
  on public.utility_contracts for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members remove utility contracts"
  on public.utility_contracts for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read utility usage"
  on public.utility_usage for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add utility usage"
  on public.utility_usage for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit utility usage"
  on public.utility_usage for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members remove utility usage"
  on public.utility_usage for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read tariff offers"
  on public.tariff_offers for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members add tariff offers"
  on public.tariff_offers for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit tariff offers"
  on public.tariff_offers for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));
create policy "Members remove tariff offers"
  on public.tariff_offers for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read utility comparisons"
  on public.utility_comparisons for select to authenticated
  using (household_id = (select public.current_household_id()));
-- Signed-in users save manual snapshots only; "due" snapshots come from the daily job.
create policy "Members save manual comparisons"
  on public.utility_comparisons for insert to authenticated
  with check (
    household_id = (select public.current_household_id())
    and trigger = 'manual'
    and dedupe_key is null
    and created_by = (select auth.uid())
  );
create policy "Members remove utility comparisons"
  on public.utility_comparisons for delete to authenticated
  using (household_id = (select public.current_household_id()));

create policy "Members read utility preferences"
  on public.utility_preferences for select to authenticated
  using (household_id = (select public.current_household_id()));
create policy "Members create utility preferences"
  on public.utility_preferences for insert to authenticated
  with check (household_id = (select public.current_household_id()));
create policy "Members edit utility preferences"
  on public.utility_preferences for update to authenticated
  using (household_id = (select public.current_household_id()))
  with check (household_id = (select public.current_household_id()));

-- Privileges -------------------------------------------------------------------------------------
revoke all on public.utility_contracts, public.utility_usage, public.tariff_offers,
  public.utility_comparisons, public.utility_preferences from anon;
revoke all on public.utility_contracts, public.utility_usage, public.tariff_offers,
  public.utility_comparisons, public.utility_preferences from authenticated;

grant select, insert, delete on public.utility_contracts to authenticated;
grant update (utility_type, supplier, tariff_name, account_label, meter_type, contract_start,
  contract_end, status, notes) on public.utility_contracts to authenticated;
grant select, insert, delete on public.utility_usage to authenticated;
grant update (period_start, period_end, day_kwh, night_kwh, peak_kwh, standard_kwh, gas_kwh,
  total_cents) on public.utility_usage to authenticated;
grant select, insert, delete on public.tariff_offers to authenticated;
grant update (supplier, tariff_name, utility_type, day_rate_cents, night_rate_cents,
  peak_rate_cents, standard_rate_cents, gas_rate_cents, standing_charge_cents_per_year,
  discount_percent, discount_includes_standing, discount_months, cashback_cents, exit_fee_cents,
  vat_percent, source_url, checked_on, notes, decision, is_current_renewal)
  on public.tariff_offers to authenticated;
grant select, insert, delete on public.utility_comparisons to authenticated;
grant select, insert on public.utility_preferences to authenticated;
grant update (excluded_suppliers) on public.utility_preferences to authenticated;

grant all on public.utility_contracts, public.utility_usage, public.tariff_offers,
  public.utility_comparisons, public.utility_preferences to service_role;
