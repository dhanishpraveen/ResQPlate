begin;

alter table public.pickup_requests
  add column volunteer_id uuid references public.volunteer_profiles (id) on delete restrict,
  add column volunteer_picked_up_at timestamptz,
  add column volunteer_delivered_at timestamptz,
  add constraint pickup_requests_volunteer_pickup_requires_assignment
    check (volunteer_picked_up_at is null or volunteer_id is not null),
  add constraint pickup_requests_volunteer_delivery_requires_pickup
    check (volunteer_delivered_at is null or volunteer_picked_up_at is not null);

create index pickup_requests_volunteer_status_idx
  on public.pickup_requests (volunteer_id, status, created_at desc);

create function public.list_volunteer_tasks()
returns table (
  request_id uuid,
  donation_id uuid,
  food_name text,
  description text,
  quantity numeric,
  unit text,
  pickup_at timestamptz,
  expires_at timestamptz,
  status text,
  donor_name text,
  donor_phone text,
  pickup_address text,
  pickup_instructions text,
  ngo_name text,
  ngo_address text,
  ngo_contact_name text,
  ngo_contact_phone text,
  volunteer_picked_up_at timestamptz,
  volunteer_delivered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not exists (
    select 1
    from public.user_profiles p
    join public.volunteer_profiles vp on vp.id = p.id
    where p.id = current_user_id
      and p.role = 'volunteer'
      and vp.onboarding_complete
  ) then
    raise exception 'A completed volunteer profile is required to view tasks'
      using errcode = '42501';
  end if;

  return query
  select
    r.id,
    d.id,
    d.food_name,
    d.description,
    r.requested_quantity,
    d.unit,
    r.pickup_at,
    d.expires_at,
    r.status,
    case when r.volunteer_id = current_user_id then coalesce(dp.business_name, donor_user.full_name) end,
    case when r.volunteer_id = current_user_id then donor_user.phone_number end,
    case when r.volunteer_id = current_user_id then d.pickup_address end,
    case when r.volunteer_id = current_user_id then d.pickup_instructions end,
    case when r.volunteer_id = current_user_id then np.organization_name end,
    case when r.volunteer_id = current_user_id then np.organization_address end,
    case when r.volunteer_id = current_user_id then np.contact_name end,
    case when r.volunteer_id = current_user_id then np.contact_phone end,
    r.volunteer_picked_up_at,
    r.volunteer_delivered_at
  from public.pickup_requests r
  join public.donations d on d.id = r.donation_id
  join public.donor_profiles dp on dp.id = d.donor_id
  join public.user_profiles donor_user on donor_user.id = d.donor_id
  join public.ngo_profiles np on np.id = r.ngo_id
  where (
    (r.volunteer_id = current_user_id and r.status in ('confirmed', 'picked_up', 'completed'))
    or (
      r.volunteer_id is null
      and r.status = 'confirmed'
      and d.status = 'claimed'
      and d.expires_at > pg_catalog.now()
    )
  )
  order by r.pickup_at nulls last, r.created_at desc;
end;
$$;

revoke all on function public.list_volunteer_tasks() from public, anon;
grant execute on function public.list_volunteer_tasks() to authenticated;

create function public.claim_volunteer_task(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  task_donation_id uuid;
  donation_status text;
  donation_expiry timestamptz;
  request_status text;
  assigned_volunteer_id uuid;
begin
  if current_user_id is null or not exists (
    select 1
    from public.user_profiles p
    join public.volunteer_profiles vp on vp.id = p.id
    where p.id = current_user_id
      and p.role = 'volunteer'
      and vp.onboarding_complete
  ) then
    raise exception 'A completed volunteer profile is required to claim tasks'
      using errcode = '42501';
  end if;

  select r.donation_id into task_donation_id
  from public.pickup_requests r
  where r.id = p_request_id;
  if not found then raise exception 'Task was not found'; end if;

  select d.status, d.expires_at
  into donation_status, donation_expiry
  from public.donations d
  where d.id = task_donation_id
  for update;
  if not found then raise exception 'Task donation was not found'; end if;

  select r.status, r.volunteer_id
  into request_status, assigned_volunteer_id
  from public.pickup_requests r
  where r.id = p_request_id and r.donation_id = task_donation_id
  for update;
  if not found then raise exception 'Task was not found'; end if;
  if request_status <> 'confirmed' or donation_status <> 'claimed' or donation_expiry <= pg_catalog.now() then
    raise exception 'Task is no longer eligible for volunteer assignment';
  end if;
  if assigned_volunteer_id is not null then
    raise exception 'Task has already been claimed';
  end if;

  update public.pickup_requests
  set volunteer_id = current_user_id
  where id = p_request_id and volunteer_id is null and status = 'confirmed';
  if not found then raise exception 'Task was claimed by another volunteer'; end if;
end;
$$;

revoke all on function public.claim_volunteer_task(uuid) from public, anon;
grant execute on function public.claim_volunteer_task(uuid) to authenticated;

create function public.volunteer_confirm_pickup(p_request_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  task_donation_id uuid;
  donation_status text;
  donation_expiry timestamptz;
  request_status text;
  assigned_volunteer_id uuid;
  requested_quantity numeric;
begin
  if current_user_id is null or not exists (
    select 1
    from public.user_profiles p
    join public.volunteer_profiles vp on vp.id = p.id
    where p.id = current_user_id
      and p.role = 'volunteer'
      and vp.onboarding_complete
  ) then
    raise exception 'A completed volunteer profile is required to confirm pickup'
      using errcode = '42501';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'Pickup note is too long';
  end if;

  select r.donation_id into task_donation_id
  from public.pickup_requests r
  where r.id = p_request_id;
  if not found then raise exception 'Task was not found'; end if;

  select d.status, d.expires_at
  into donation_status, donation_expiry
  from public.donations d
  where d.id = task_donation_id
  for update;
  if not found then raise exception 'Task donation was not found'; end if;

  select r.status, r.volunteer_id, r.requested_quantity
  into request_status, assigned_volunteer_id, requested_quantity
  from public.pickup_requests r
  where r.id = p_request_id and r.donation_id = task_donation_id
  for update;
  if not found or assigned_volunteer_id <> current_user_id then
    raise exception 'Task is not assigned to this volunteer' using errcode = '42501';
  end if;
  if request_status <> 'confirmed' or donation_status <> 'claimed' or donation_expiry <= pg_catalog.now() then
    raise exception 'Pickup cannot be confirmed for this task';
  end if;

  insert into public.donation_handovers (
    pickup_request_id, quantity_handed_over, note, recorded_by
  ) values (
    p_request_id, requested_quantity, nullif(btrim(p_note), ''), current_user_id
  );

  update public.pickup_requests
  set status = 'picked_up', volunteer_picked_up_at = pg_catalog.now()
  where id = p_request_id and status = 'confirmed' and volunteer_id = current_user_id;
  if not found then raise exception 'Task changed before pickup confirmation'; end if;

  update public.donations
  set status = 'picked_up'
  where id = task_donation_id and status = 'claimed';
  if not found then raise exception 'Donation changed before pickup confirmation'; end if;
end;
$$;

revoke all on function public.volunteer_confirm_pickup(uuid, text) from public, anon;
grant execute on function public.volunteer_confirm_pickup(uuid, text) to authenticated;

create function public.volunteer_confirm_delivery(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  task_donation_id uuid;
  donation_status text;
  request_status text;
  assigned_volunteer_id uuid;
  picked_up_at timestamptz;
  delivered_at timestamptz;
begin
  if current_user_id is null or not exists (
    select 1
    from public.user_profiles p
    join public.volunteer_profiles vp on vp.id = p.id
    where p.id = current_user_id
      and p.role = 'volunteer'
      and vp.onboarding_complete
  ) then
    raise exception 'A completed volunteer profile is required to confirm delivery'
      using errcode = '42501';
  end if;

  select r.donation_id into task_donation_id
  from public.pickup_requests r
  where r.id = p_request_id;
  if not found then raise exception 'Task was not found'; end if;

  select d.status into donation_status
  from public.donations d
  where d.id = task_donation_id
  for update;
  if not found then raise exception 'Task donation was not found'; end if;

  select r.status, r.volunteer_id, r.volunteer_picked_up_at, r.volunteer_delivered_at
  into request_status, assigned_volunteer_id, picked_up_at, delivered_at
  from public.pickup_requests r
  where r.id = p_request_id and r.donation_id = task_donation_id
  for update;
  if not found or assigned_volunteer_id <> current_user_id then
    raise exception 'Task is not assigned to this volunteer' using errcode = '42501';
  end if;
  if request_status <> 'picked_up' or donation_status <> 'picked_up' or picked_up_at is null
     or not exists (
       select 1 from public.donation_handovers h where h.pickup_request_id = p_request_id
     ) then
    raise exception 'Delivery can only be confirmed after pickup';
  end if;
  if delivered_at is not null then raise exception 'Delivery has already been confirmed'; end if;

  update public.pickup_requests
  set volunteer_delivered_at = pg_catalog.now()
  where id = p_request_id
    and volunteer_id = current_user_id
    and status = 'picked_up'
    and volunteer_delivered_at is null;
  if not found then raise exception 'Task changed before delivery confirmation'; end if;
end;
$$;

revoke all on function public.volunteer_confirm_delivery(uuid) from public, anon;
grant execute on function public.volunteer_confirm_delivery(uuid) to authenticated;

create or replace function public.confirm_donor_handover(
  p_request_id uuid,
  p_photo_path text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  donation_id uuid;
  requested_quantity numeric;
  handover_quantity numeric;
  request_status text;
  donation_status text;
  assigned_volunteer_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if p_note is not null and char_length(p_note) > 1000 then raise exception 'Handover note is too long'; end if;
  if p_photo_path is not null and p_photo_path not like (select auth.uid())::text || '/%' then
    raise exception 'Handover photo must belong to this donor';
  end if;

  select d.id, r.requested_quantity, r.status, d.status, r.volunteer_id
  into donation_id, requested_quantity, request_status, donation_status, assigned_volunteer_id
  from public.pickup_requests r
  join public.donations d on d.id = r.donation_id
  where r.id = p_request_id and d.donor_id = (select auth.uid())
  for update of d, r;

  if not found then raise exception 'Pickup request was not found for this donor'; end if;
  if assigned_volunteer_id is not null then
    raise exception 'The assigned volunteer must confirm pickup';
  end if;
  if request_status <> 'confirmed' or donation_status <> 'claimed' then
    raise exception 'Handover can only be confirmed for a confirmed pickup request';
  end if;
  handover_quantity := requested_quantity;

  insert into public.donation_handovers (
    pickup_request_id, quantity_handed_over, photo_path, note, recorded_by
  ) values (p_request_id, handover_quantity, p_photo_path, nullif(btrim(p_note), ''), (select auth.uid()));

  update public.pickup_requests set status = 'picked_up'
  where id = p_request_id and status = 'confirmed';
  if not found then raise exception 'Pickup request changed before handover confirmation'; end if;
  update public.donations set status = 'picked_up'
  where id = donation_id and status = 'claimed';
  if not found then raise exception 'Donation changed before handover confirmation'; end if;
end;
$$;

revoke all on function public.confirm_donor_handover(uuid, text, text) from public, anon;
grant execute on function public.confirm_donor_handover(uuid, text, text) to authenticated;

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
  assigned_volunteer_id uuid;
  volunteer_delivered_at timestamptz;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if p_received_quantity is null or p_received_quantity <= 0 then
    raise exception 'Receipt quantity must be positive';
  end if;

  select d.id, r.ngo_id, r.status, d.status, h.quantity_handed_over,
         r.volunteer_id, r.volunteer_delivered_at
  into donation_id, ngo_id, request_status, donation_status, handed_over_quantity,
       assigned_volunteer_id, volunteer_delivered_at
  from public.pickup_requests r
  join public.donations d on d.id = r.donation_id
  join public.donation_handovers h on h.pickup_request_id = r.id
  where r.id = p_request_id
  for update of d, r;

  if not found or ngo_id <> (select auth.uid()) then
    raise exception 'Pickup request was not found for this organization';
  end if;
  if not exists (
    select 1 from public.user_profiles p
    join public.ngo_profiles np on np.id = p.id
    where p.id = (select auth.uid()) and p.role = 'ngo'
  ) then
    raise exception 'An NGO profile is required to confirm receipt';
  end if;
  if request_status <> 'picked_up' or donation_status <> 'picked_up' then
    raise exception 'Receipt can only be confirmed after handover';
  end if;
  if assigned_volunteer_id is not null and volunteer_delivered_at is null then
    raise exception 'The assigned volunteer must confirm delivery before receipt';
  end if;
  if p_received_quantity <> handed_over_quantity then
    raise exception 'The full handed-over quantity must be confirmed; partial receipts need an approved discrepancy workflow';
  end if;

  update public.pickup_requests
  set status = 'completed',
      received_quantity = p_received_quantity,
      receipt_confirmed_at = pg_catalog.now(),
      receipt_confirmed_by = (select auth.uid())
  where id = p_request_id and status = 'picked_up';
  if not found then raise exception 'Pickup request changed before receipt confirmation'; end if;

  update public.donations set status = 'completed'
  where id = donation_id and status = 'picked_up';
  if not found then raise exception 'Donation changed before receipt confirmation'; end if;
end;
$$;

revoke all on function public.confirm_ngo_receipt(uuid, numeric) from public, anon;
grant execute on function public.confirm_ngo_receipt(uuid, numeric) to authenticated;

commit;
