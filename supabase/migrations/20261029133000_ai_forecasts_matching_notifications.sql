begin;

create table public.surplus_forecasts (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references auth.users (id) on delete restrict,
  food_category text not null,
  restaurant_type text not null,
  planned_quantity numeric not null,
  expected_customers integer not null,
  historical_sales numeric not null,
  historical_leftover numeric not null,
  ready_at timestamptz not null,
  predicted_quantity numeric not null,
  uncertainty_lower numeric not null,
  uncertainty_upper numeric not null,
  unit text not null,
  model_version text not null,
  status text not null default 'estimated',
  confirmed_quantity numeric,
  actual_ready_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint surplus_forecasts_positive_inputs check (
    planned_quantity > 0 and expected_customers >= 0 and historical_sales >= 0 and historical_leftover >= 0
  ),
  constraint surplus_forecasts_valid_prediction check (
    predicted_quantity >= 0 and uncertainty_lower >= 0 and uncertainty_upper >= uncertainty_lower
  ),
  constraint surplus_forecasts_status_check check (
    status = any (array['estimated'::text, 'confirmed'::text, 'ready'::text, 'cancelled'::text])
  ),
  constraint surplus_forecasts_confirmation_check check (
    (status in ('estimated', 'cancelled') and confirmed_quantity is null)
    or (status in ('confirmed', 'ready') and confirmed_quantity is not null and confirmed_quantity > 0)
  )
);

create table public.ngo_demand_requirements (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references auth.users (id) on delete restrict,
  food_category text not null,
  dietary_constraints text,
  required_quantity numeric not null,
  unit text not null,
  required_by timestamptz not null,
  delivery_address text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ngo_demand_positive_quantity check (required_quantity > 0),
  constraint ngo_demand_address_length check (char_length(btrim(delivery_address)) between 1 and 500),
  constraint ngo_demand_status_check check (
    status = any (array['active'::text, 'fulfilled'::text, 'cancelled'::text, 'expired'::text])
  )
);

create table public.match_recommendations (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.ngo_demand_requirements (id) on delete cascade,
  forecast_id uuid references public.surplus_forecasts (id) on delete cascade,
  donation_id uuid references public.donations (id) on delete cascade,
  is_feasible boolean not null,
  allocatable_quantity numeric not null default 0,
  score numeric not null default 0,
  explanation text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint match_recommendation_source_check check (forecast_id is not null or donation_id is not null),
  constraint match_recommendation_quantity_check check (allocatable_quantity >= 0),
  constraint match_recommendation_score_check check (score >= 0)
);

create table public.quantity_allocations (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.ngo_demand_requirements (id) on delete restrict,
  forecast_id uuid references public.surplus_forecasts (id) on delete restrict,
  donation_id uuid references public.donations (id) on delete restrict,
  quantity numeric not null,
  unit text not null,
  status text not null default 'reserved',
  idempotency_key text not null,
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  fulfilled_at timestamptz,
  constraint quantity_allocation_source_check check (forecast_id is not null or donation_id is not null),
  constraint quantity_allocation_quantity_check check (quantity > 0),
  constraint quantity_allocation_status_check check (
    status = any (array['reserved'::text, 'released'::text, 'fulfilled'::text])
  ),
  constraint quantity_allocation_state_check check (
    (status = 'reserved' and released_at is null and fulfilled_at is null)
    or (status = 'released' and released_at is not null and fulfilled_at is null)
    or (status = 'fulfilled' and fulfilled_at is not null and released_at is null)
  ),
  constraint quantity_allocation_idempotency_key_length check (char_length(btrim(idempotency_key)) between 1 and 128)
);

create unique index quantity_allocations_active_demand_key
  on public.quantity_allocations (demand_id, idempotency_key)
  where status = 'reserved';
create index quantity_allocations_donation_status_idx
  on public.quantity_allocations (donation_id, status);
create index quantity_allocations_forecast_status_idx
  on public.quantity_allocations (forecast_id, status);

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notification_event_status_check check (
    status = any (array['pending'::text, 'sent'::text, 'failed'::text])
  ),
  constraint notification_event_payload_object check (jsonb_typeof(payload) = 'object')
);

create unique index notification_events_recipient_key
  on public.notification_events (recipient_id, event_key);
create index notification_events_recipient_created_idx
  on public.notification_events (recipient_id, created_at desc);

alter table public.surplus_forecasts enable row level security;
alter table public.ngo_demand_requirements enable row level security;
alter table public.match_recommendations enable row level security;
alter table public.quantity_allocations enable row level security;
alter table public.notification_events enable row level security;

create policy surplus_forecasts_donor_access on public.surplus_forecasts
  for all to authenticated
  using (donor_id = (select auth.uid()))
  with check (
    donor_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy ngo_demands_owner_access on public.ngo_demand_requirements
  for all to authenticated
  using (ngo_id = (select auth.uid()))
  with check (
    ngo_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  );

create policy match_recommendations_demand_owner_read on public.match_recommendations
  for select to authenticated
  using (
    exists (
      select 1 from public.ngo_demand_requirements d
      where d.id = demand_id and d.ngo_id = (select auth.uid())
    )
    or exists (
      select 1 from public.surplus_forecasts f
      where f.id = forecast_id and f.donor_id = (select auth.uid())
    )
  );

create policy quantity_allocations_demand_owner_read on public.quantity_allocations
  for select to authenticated
  using (
    exists (
      select 1 from public.ngo_demand_requirements d
      where d.id = demand_id and d.ngo_id = (select auth.uid())
    )
  );

create policy notification_events_recipient_access on public.notification_events
  for select to authenticated
  using (recipient_id = (select auth.uid()));

create function public.reserve_donation_quantity(
  p_demand_id uuid,
  p_donation_id uuid,
  p_quantity numeric,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  donation_quantity numeric;
  donation_unit text;
  donation_status text;
  already_reserved numeric;
  allocation_id uuid;
begin
  if current_user_id is null then raise exception 'Authentication is required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Allocation quantity must be positive'; end if;
  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) not between 1 and 128 then
    raise exception 'A valid idempotency key is required';
  end if;
  if not exists (
    select 1 from public.ngo_demand_requirements d
    join public.user_profiles p on p.id = d.ngo_id
    where d.id = p_demand_id and d.ngo_id = current_user_id and p.role = 'ngo' and d.status = 'active'
  ) then raise exception 'Active NGO demand was not found'; end if;

  select a.id into allocation_id
  from public.quantity_allocations a
  where a.demand_id = p_demand_id and a.idempotency_key = btrim(p_idempotency_key) and a.status = 'reserved';
  if allocation_id is not null then return allocation_id; end if;

  select d.quantity, d.unit, d.status into donation_quantity, donation_unit, donation_status
  from public.donations d
  where d.id = p_donation_id
  for update;
  if not found or donation_status <> 'available' then raise exception 'Donation is not available'; end if;

  select coalesce(sum(a.quantity), 0) into already_reserved
  from public.quantity_allocations a
  where a.donation_id = p_donation_id and a.status = 'reserved';
  if p_quantity + already_reserved > donation_quantity then
    raise exception 'Requested quantity exceeds remaining donation quantity';
  end if;

  insert into public.quantity_allocations (demand_id, donation_id, quantity, unit, idempotency_key)
  values (p_demand_id, p_donation_id, p_quantity, donation_unit, btrim(p_idempotency_key))
  returning id into allocation_id;
  return allocation_id;
end;
$$;

revoke all on function public.reserve_donation_quantity(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.reserve_donation_quantity(uuid, uuid, numeric, text) to authenticated;

create function public.release_quantity_allocation(p_allocation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.quantity_allocations a
  set status = 'released', released_at = pg_catalog.now()
  where a.id = p_allocation_id
    and a.status = 'reserved'
    and exists (
      select 1 from public.ngo_demand_requirements d
      where d.id = a.demand_id and d.ngo_id = (select auth.uid())
    );
  if not found then raise exception 'Reserved allocation was not found or cannot be released'; end if;
end;
$$;

revoke all on function public.release_quantity_allocation(uuid) from public, anon;
grant execute on function public.release_quantity_allocation(uuid) to authenticated;

commit;
