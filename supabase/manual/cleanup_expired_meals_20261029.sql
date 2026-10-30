-- Manual cleanup only. Review this exact-ID script before execution; it is not a migration.
-- It aborts if the verified donation/request state or dependency counts have changed.
begin;
set local lock_timeout = '5s';

do $$
declare
  target_donation_id constant uuid := '45715a9b-5773-42a5-9317-ddabe309c52e';
  target_request_id constant uuid := '0d361edc-dba4-4132-be8b-b39babe226ae';
  donation_status text;
  donation_expiry timestamptz;
  request_status text;
  assigned_volunteer uuid;
  picked_up_at timestamptz;
  delivered_at timestamptz;
  deleted_count bigint;
  expected_recommendations bigint;
begin
  select d.status, d.expires_at
  into donation_status, donation_expiry
  from public.donations d
  where d.id = target_donation_id
    and d.food_name = 'Meals'
  for update;
  if not found then
    raise exception 'The exact expired Meals donation was not found; no rows deleted.';
  end if;
  if donation_status is distinct from 'claimed'
    or donation_expiry is distinct from timestamptz '2026-10-29 20:33:00+00'
    or donation_expiry >= pg_catalog.now()
  then
    raise exception 'The target donation status or expiry changed; no rows deleted.';
  end if;

  select r.status, r.volunteer_id, r.volunteer_picked_up_at, r.volunteer_delivered_at
  into request_status, assigned_volunteer, picked_up_at, delivered_at
  from public.pickup_requests r
  where r.id = target_request_id
    and r.donation_id = target_donation_id
  for update;
  if not found then
    raise exception 'The exact pickup request was not found; no rows deleted.';
  end if;
  if request_status is distinct from 'confirmed'
    or assigned_volunteer is null
    or picked_up_at is not null
    or delivered_at is not null
    or (select count(*) from public.pickup_requests where donation_id = target_donation_id) <> 1
  then
    raise exception 'The pickup request is not the verified uncollected request; no rows deleted.';
  end if;

  if exists (
    select 1 from public.donation_handovers
    where pickup_request_id = target_request_id
  ) or exists (
    select 1 from public.donation_status_history
    where donation_id = target_donation_id
      and status not in ('available', 'claimed')
  ) or exists (
    select 1 from public.pickup_request_status_history
    where pickup_request_id = target_request_id
      and status not in ('pending', 'confirmed')
  ) then
    raise exception 'Delivery or unexpected lifecycle history exists; no rows deleted.';
  end if;

  if (select count(*) from public.donation_status_history where donation_id = target_donation_id and status = 'available') <> 1
    or (select count(*) from public.donation_status_history where donation_id = target_donation_id and status = 'claimed') <> 1
    or (select count(*) from public.pickup_request_status_history where pickup_request_id = target_request_id and status = 'pending') <> 1
    or (select count(*) from public.pickup_request_status_history where pickup_request_id = target_request_id and status = 'confirmed') <> 1
  then
    raise exception 'Status-history counts changed; inspect manually before cleanup.';
  end if;

  if exists (select 1 from public.quantity_allocations where donation_id = target_donation_id)
    or exists (select 1 from public.delivery_otp_challenges where request_id = target_request_id)
    or exists (select 1 from public.delivery_otp_send_events where request_id = target_request_id)
  then
    raise exception 'Allocation or OTP audit records exist; inspect manually before cleanup.';
  end if;

  if exists (
    select 1
    from public.notification_events n
    where coalesce(n.event_key, '') ilike '%' || target_donation_id::text || '%'
       or coalesce(n.event_type, '') ilike '%' || target_donation_id::text || '%'
       or n.payload::text ilike '%' || target_donation_id::text || '%'
       or coalesce(n.event_key, '') ilike '%' || target_request_id::text || '%'
       or coalesce(n.event_type, '') ilike '%' || target_request_id::text || '%'
       or n.payload::text ilike '%' || target_request_id::text || '%'
  ) then
    raise exception 'Related notification records exist; inspect manually before cleanup.';
  end if;

  select count(*) into expected_recommendations
  from public.match_recommendations
  where donation_id = target_donation_id;
  delete from public.match_recommendations
  where donation_id = target_donation_id;
  get diagnostics deleted_count = row_count;
  if deleted_count <> expected_recommendations then
    raise exception 'Recommendation cleanup row count changed; transaction aborted.';
  end if;

  delete from public.pickup_request_status_history
  where pickup_request_id = target_request_id
    and status in ('pending', 'confirmed');
  get diagnostics deleted_count = row_count;
  if deleted_count <> 2 then
    raise exception 'Pickup history cleanup did not delete the verified two rows.';
  end if;

  delete from public.donation_status_history
  where donation_id = target_donation_id
    and status in ('available', 'claimed');
  get diagnostics deleted_count = row_count;
  if deleted_count <> 2 then
    raise exception 'Donation history cleanup did not delete the verified two rows.';
  end if;

  delete from public.pickup_requests
  where id = target_request_id
    and donation_id = target_donation_id
    and status = 'confirmed'
    and volunteer_picked_up_at is null
    and volunteer_delivered_at is null;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then
    raise exception 'Pickup request cleanup did not delete exactly one row.';
  end if;

  delete from public.donations
  where id = target_donation_id
    and food_name = 'Meals'
    and status = 'claimed'
    and expires_at = timestamptz '2026-10-29 20:33:00+00';
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then
    raise exception 'Donation cleanup did not delete exactly one row.';
  end if;

  raise notice 'Deleted exactly one expired donation and its uncollected request; no completed handovers or unrelated rows were touched.';
end;
$$;

-- Guard failures abort the transaction. Replace COMMIT with ROLLBACK for a preview-only run.
commit;
