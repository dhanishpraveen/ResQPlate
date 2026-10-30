begin;

create table public.forecast_outcomes (
  forecast_id uuid primary key references public.surplus_forecasts (id) on delete restrict,
  actual_surplus_quantity numeric not null,
  unit text not null,
  actual_sales numeric,
  actual_customers integer,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint forecast_outcomes_surplus_nonnegative
    check (actual_surplus_quantity >= 0),
  constraint forecast_outcomes_sales_nonnegative
    check (actual_sales is null or actual_sales >= 0),
  constraint forecast_outcomes_customers_nonnegative
    check (actual_customers is null or actual_customers >= 0)
);

comment on table public.forecast_outcomes is
  'Donor-entered observed surplus outcomes, separate from forecast predictions, confirmed donations, and delivered quantities.';
comment on column public.forecast_outcomes.observed_at is
  'Time when the actual edible surplus was measured; must be after the linked forecast ready time.';

alter table public.forecast_outcomes enable row level security;

revoke all on public.forecast_outcomes from public, anon, authenticated;
grant select, insert on public.forecast_outcomes to authenticated;

create policy forecast_outcomes_donor_read on public.forecast_outcomes
  for select to authenticated
  using (
    exists (
      select 1
      from public.surplus_forecasts f
      where f.id = forecast_outcomes.forecast_id
        and f.donor_id = (select auth.uid())
    )
  );

create policy forecast_outcomes_donor_insert on public.forecast_outcomes
  for insert to authenticated
  with check (
    observed_at <= (select now())
    and exists (
      select 1
      from public.surplus_forecasts f
      where f.id = forecast_outcomes.forecast_id
        and f.donor_id = (select auth.uid())
        and f.unit = forecast_outcomes.unit
        and forecast_outcomes.observed_at > f.ready_at
    )
  );

commit;
