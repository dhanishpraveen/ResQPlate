begin;

alter table public.pickup_requests
  add column delivery_verification_status text not null default 'pending',
  add column delivery_verified_at timestamptz,
  add column delivery_verified_by uuid references auth.users (id) on delete restrict,
  add column delivery_issue_reason text;

update public.pickup_requests
set delivery_verification_status = 'verified',
    delivery_verified_at = receipt_confirmed_at,
    delivery_verified_by = receipt_confirmed_by
where status = 'completed';

alter table public.pickup_requests
  add constraint pickup_requests_delivery_verification_status_check
    check (delivery_verification_status = any (array['pending'::text, 'verified'::text, 'issue_reported'::text])),
  add constraint pickup_requests_delivery_verification_state_check
    check (
      (delivery_verification_status = 'pending' and delivery_verified_at is null and delivery_verified_by is null and delivery_issue_reason is null)
      or (delivery_verification_status = 'verified' and delivery_verified_at is not null and delivery_verified_by is not null and delivery_issue_reason is null)
      or (delivery_verification_status = 'issue_reported' and delivery_issue_reason is not null and char_length(btrim(delivery_issue_reason)) between 1 and 2000 and delivery_verified_at is null and delivery_verified_by is null)
    );

create index pickup_requests_delivery_verification_idx
  on public.pickup_requests (ngo_id, delivery_verification_status, updated_at desc);

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
  verification_status text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if p_received_quantity is null or p_received_quantity <= 0 then raise exception 'Receipt quantity must be positive'; end if;

  select d.id, r.ngo_id, r.status, d.status, h.quantity_handed_over,
         r.volunteer_id, r.volunteer_delivered_at, r.delivery_verification_status
  into donation_id, ngo_id, request_status, donation_status, handed_over_quantity,
       assigned_volunteer_id, volunteer_delivered_at, verification_status
  from public.pickup_requests r
  join public.donations d on d.id = r.donation_id
  join public.donation_handovers h on h.pickup_request_id = r.id
  where r.id = p_request_id
  for update of d, r;

  if not found or ngo_id <> (select auth.uid()) then raise exception 'Pickup request was not found for this organization'; end if;
  if not exists (select 1 from public.user_profiles p join public.ngo_profiles np on np.id = p.id where p.id = (select auth.uid()) and p.role = 'ngo') then
    raise exception 'An NGO profile is required to confirm receipt';
  end if;
  if request_status <> 'picked_up' or donation_status <> 'picked_up' then raise exception 'Receipt can only be confirmed after handover'; end if;
  if verification_status <> 'pending' then raise exception 'This delivery has already been reviewed'; end if;
  if assigned_volunteer_id is not null and volunteer_delivered_at is null then raise exception 'The assigned volunteer must confirm delivery before receipt'; end if;
  if p_received_quantity <> handed_over_quantity then raise exception 'The full handed-over quantity must be confirmed; partial receipts need an approved discrepancy workflow'; end if;

  update public.pickup_requests
  set status = 'completed',
      received_quantity = p_received_quantity,
      receipt_confirmed_at = pg_catalog.now(),
      receipt_confirmed_by = (select auth.uid()),
      delivery_verification_status = 'verified',
      delivery_verified_at = pg_catalog.now(),
      delivery_verified_by = (select auth.uid()),
      delivery_issue_reason = null
  where id = p_request_id and status = 'picked_up' and delivery_verification_status = 'pending';
  if not found then raise exception 'Pickup request changed before receipt confirmation'; end if;

  update public.donations set status = 'completed' where id = donation_id and status = 'picked_up';
  if not found then raise exception 'Donation changed before receipt confirmation'; end if;
end;
$$;

revoke all on function public.confirm_ngo_receipt(uuid, numeric) from public, anon;
grant execute on function public.confirm_ngo_receipt(uuid, numeric) to authenticated;

create function public.report_ngo_delivery_issue(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_ngo_id uuid;
  request_status text;
  assigned_volunteer_id uuid;
  volunteer_delivered_at timestamptz;
  verification_status text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 2000 then raise exception 'A delivery issue reason between 1 and 2000 characters is required'; end if;

  select r.ngo_id, r.status, r.volunteer_id, r.volunteer_delivered_at, r.delivery_verification_status
  into request_ngo_id, request_status, assigned_volunteer_id, volunteer_delivered_at, verification_status
  from public.pickup_requests r
  where r.id = p_request_id
  for update;

  if not found or request_ngo_id <> (select auth.uid()) then raise exception 'Pickup request was not found for this organization'; end if;
  if not exists (select 1 from public.user_profiles p join public.ngo_profiles np on np.id = p.id where p.id = (select auth.uid()) and p.role = 'ngo') then
    raise exception 'An NGO profile is required to report a delivery issue';
  end if;
  if request_status <> 'picked_up' or verification_status <> 'pending' then raise exception 'This delivery is not awaiting review'; end if;
  if assigned_volunteer_id is not null and volunteer_delivered_at is null then raise exception 'The assigned volunteer must confirm delivery before review'; end if;

  update public.pickup_requests
  set delivery_verification_status = 'issue_reported',
      delivery_issue_reason = btrim(p_reason),
      delivery_verified_at = null,
      delivery_verified_by = null
  where id = p_request_id and delivery_verification_status = 'pending';
  if not found then raise exception 'Delivery review changed before issue was recorded'; end if;
end;
$$;

revoke all on function public.report_ngo_delivery_issue(uuid, text) from public, anon;
grant execute on function public.report_ngo_delivery_issue(uuid, text) to authenticated;

commit;
