begin;

create or replace function public.can_submit_pickup_request(p_donation_id uuid, p_quantity numeric)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.donations d
    join public.user_profiles p
      on p.id = (select auth.uid())
     and p.role = 'ngo'
    join public.ngo_profiles np
      on np.id = p.id
    where d.id = p_donation_id
      and d.status = 'available'
      and d.expires_at > now()
      and p_quantity > 0
      and p_quantity = d.quantity
      and not exists (
        select 1
        from public.pickup_requests r
        where r.donation_id = d.id
          and r.ngo_id = (select auth.uid())
          and r.status in ('pending', 'confirmed', 'picked_up')
      )
  );
$$;

create or replace function public.lock_pickup_request_donation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  donation_status text;
  donation_expiry timestamptz;
begin
  select status, expires_at into donation_status, donation_expiry
  from public.donations
  where id = new.donation_id
  for update;

  if not found or donation_status <> 'available' or donation_expiry <= now() then
    raise exception 'Donation is no longer available for requests';
  end if;
  if not public.can_submit_pickup_request(new.donation_id, new.requested_quantity) then
    raise exception 'An NGO must request the full quantity of an available donation';
  end if;
  return new;
end;
$$;

create or replace function public.list_available_donations(p_donation_id uuid default null)
returns table (
  id uuid,
  food_name text,
  cuisine_type text,
  description text,
  quantity numeric,
  unit text,
  expires_at timestamptz,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.user_profiles p
    join public.ngo_profiles np on np.id = p.id
    where p.id = (select auth.uid())
      and p.role = 'ngo'
  ) then
    raise exception 'An authenticated NGO profile is required to browse available donations'
      using errcode = '42501';
  end if;

  return query
  select
    d.id,
    d.food_name,
    d.cuisine_type,
    d.description,
    d.quantity,
    d.unit,
    d.expires_at,
    d.status,
    d.created_at
  from public.donations d
  where d.status = 'available'
    and d.expires_at > pg_catalog.now()
    and (p_donation_id is null or d.id = p_donation_id)
  order by d.expires_at asc;
end;
$$;

create or replace function public.confirm_ngo_receipt(p_request_id uuid, p_received_quantity numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  donation_id uuid;
  ngo_id uuid;
  request_status text;
  donation_status text;
  handed_over_quantity numeric;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;
  if p_received_quantity is null or p_received_quantity <= 0 then
    raise exception 'Receipt quantity must be positive';
  end if;

  select d.id, r.ngo_id, r.status, d.status, h.quantity_handed_over
  into donation_id, ngo_id, request_status, donation_status, handed_over_quantity
  from public.pickup_requests r
  join public.donations d on d.id = r.donation_id
  join public.donation_handovers h on h.pickup_request_id = r.id
  where r.id = p_request_id
  for update of d, r;

  if not found or ngo_id <> (select auth.uid()) then
    raise exception 'Pickup request was not found for this organization';
  end if;
  if not exists (
    select 1
    from public.user_profiles p
    join public.ngo_profiles np on np.id = p.id
    where p.id = (select auth.uid())
      and p.role = 'ngo'
  ) then
    raise exception 'An NGO profile is required to confirm receipt';
  end if;
  if request_status <> 'picked_up' or donation_status <> 'picked_up' then
    raise exception 'Receipt can only be confirmed after donor handover';
  end if;
  if p_received_quantity <> handed_over_quantity then
    raise exception 'The full handed-over quantity must be confirmed; partial receipts need an approved discrepancy workflow';
  end if;

  update public.pickup_requests
  set status = 'completed',
      received_quantity = p_received_quantity,
      receipt_confirmed_at = now(),
      receipt_confirmed_by = (select auth.uid())
  where id = p_request_id and status = 'picked_up';
  if not found then
    raise exception 'Pickup request changed before receipt confirmation';
  end if;

  update public.donations
  set status = 'completed'
  where id = donation_id and status = 'picked_up';
  if not found then
    raise exception 'Donation changed before receipt confirmation';
  end if;
end;
$$;

commit;
