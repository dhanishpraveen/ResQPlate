create table public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.donor_profiles (id) on delete restrict,
  food_name text not null,
  cuisine_type text not null,
  description text not null,
  quantity numeric(12, 3) not null,
  unit text not null check (unit in ('servings', 'portions', 'kg', 'items')),
  expires_at timestamptz not null,
  pickup_address text not null,
  pickup_instructions text,
  photo_path text,
  status text not null default 'draft'
    check (status in ('draft', 'available', 'claimed', 'picked_up', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donations_food_name_length check (char_length(btrim(food_name)) between 1 and 160),
  constraint donations_cuisine_length check (char_length(btrim(cuisine_type)) between 1 and 80),
  constraint donations_description_length check (char_length(btrim(description)) between 1 and 2000),
  constraint donations_quantity_positive check (quantity > 0),
  constraint donations_address_length check (char_length(btrim(pickup_address)) between 1 and 500),
  constraint donations_instructions_length check (
    pickup_instructions is null or char_length(pickup_instructions) <= 1000
  ),
  constraint donations_photo_owner_path check (
    photo_path is null or photo_path like donor_id::text || '/%'
  )
);

create table public.pickup_requests (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations (id) on delete restrict,
  ngo_id uuid not null references public.ngo_profiles (id) on delete restrict,
  requested_quantity numeric(12, 3) not null check (requested_quantity > 0),
  pickup_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'declined', 'picked_up', 'completed', 'cancelled')),
  received_quantity numeric(12, 3),
  receipt_confirmed_at timestamptz,
  receipt_confirmed_by uuid references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pickup_requests_receipt_quantity_valid check (
    received_quantity is null or (received_quantity > 0 and received_quantity = requested_quantity)
  ),
  constraint pickup_requests_receipt_state_valid check (
    (status = 'completed' and received_quantity is not null and receipt_confirmed_at is not null and receipt_confirmed_by is not null)
    or (status <> 'completed' and received_quantity is null and receipt_confirmed_at is null and receipt_confirmed_by is null)
  )
);

create table public.donation_status_history (
  id bigint generated always as identity primary key,
  donation_id uuid not null references public.donations (id) on delete restrict,
  status text not null check (status in ('draft', 'available', 'claimed', 'picked_up', 'completed', 'cancelled')),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create table public.pickup_request_status_history (
  id bigint generated always as identity primary key,
  pickup_request_id uuid not null references public.pickup_requests (id) on delete restrict,
  status text not null check (status in ('pending', 'confirmed', 'declined', 'picked_up', 'completed', 'cancelled')),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now()
);

create table public.donation_handovers (
  id uuid primary key default gen_random_uuid(),
  pickup_request_id uuid not null unique references public.pickup_requests (id) on delete restrict,
  quantity_handed_over numeric(12, 3) not null check (quantity_handed_over > 0),
  photo_path text,
  note text check (note is null or char_length(note) <= 1000),
  recorded_by uuid not null references auth.users (id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint donation_handovers_photo_owner_path check (
    photo_path is null or photo_path like recorded_by::text || '/%'
  )
);

create index donations_donor_status_created_idx
  on public.donations (donor_id, status, created_at desc);
create index donations_donor_expiry_idx
  on public.donations (donor_id, expires_at);
create index pickup_requests_donation_status_idx
  on public.pickup_requests (donation_id, status, created_at desc);
create index pickup_requests_ngo_status_idx
  on public.pickup_requests (ngo_id, status, created_at desc);
create unique index pickup_requests_one_active_per_ngo
  on public.pickup_requests (donation_id, ngo_id)
  where status in ('pending', 'confirmed', 'picked_up');
create index donation_status_history_donation_time_idx
  on public.donation_status_history (donation_id, changed_at desc);
create index pickup_request_status_history_request_time_idx
  on public.pickup_request_status_history (pickup_request_id, changed_at desc);

alter table public.donations enable row level security;
alter table public.pickup_requests enable row level security;
alter table public.donation_status_history enable row level security;
alter table public.pickup_request_status_history enable row level security;
alter table public.donation_handovers enable row level security;

revoke all on public.donations from anon, authenticated;
revoke all on public.pickup_requests from anon, authenticated;
revoke all on public.donation_status_history from anon, authenticated;
revoke all on public.pickup_request_status_history from anon, authenticated;
revoke all on public.donation_handovers from anon, authenticated;

grant select on public.donations to authenticated;
grant insert (
  donor_id, food_name, cuisine_type, description, quantity, unit, expires_at,
  pickup_address, pickup_instructions, photo_path, status
) on public.donations to authenticated;
grant update (
  food_name, cuisine_type, description, quantity, unit, expires_at,
  pickup_address, pickup_instructions, photo_path, status
) on public.donations to authenticated;
grant select on public.pickup_requests to authenticated;
grant insert (donation_id, ngo_id, requested_quantity, pickup_at, notes)
  on public.pickup_requests to authenticated;
grant select on public.donation_status_history to authenticated;
grant select on public.pickup_request_status_history to authenticated;
grant select on public.donation_handovers to authenticated;

create function public.can_edit_donation(p_donation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.donations d
    join public.user_profiles p on p.id = (select auth.uid()) and p.role = 'donor'
    where d.id = p_donation_id
      and d.donor_id = (select auth.uid())
      and d.status in ('draft', 'available')
      and not exists (
        select 1 from public.pickup_requests r
        where r.donation_id = d.id and r.status in ('pending', 'confirmed', 'picked_up')
      )
  );
$$;

revoke all on function public.can_edit_donation(uuid) from public, anon;
grant execute on function public.can_edit_donation(uuid) to authenticated;

create policy "Donors can read their donations"
  on public.donations for select to authenticated
  using (
    donor_id = (select auth.uid())
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy "Donors can create their own drafts or listings"
  on public.donations for insert to authenticated
  with check (
    donor_id = (select auth.uid())
    and status in ('draft', 'available')
    and exists (
      select 1 from public.user_profiles p
      join public.donor_profiles dp on dp.id = p.id and dp.onboarding_complete
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy "Donors can edit unrequested drafts or listings"
  on public.donations for update to authenticated
  using (
    public.can_edit_donation(id)
  )
  with check (
    donor_id = (select auth.uid())
    and status in ('draft', 'available')
    and public.can_edit_donation(id)
  );

create function public.can_submit_pickup_request(p_donation_id uuid, p_quantity numeric)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.donations d
    join public.user_profiles p on p.id = (select auth.uid()) and p.role = 'ngo'
    join public.ngo_profiles np on np.id = p.id and np.verification_status = 'verified'
    where d.id = p_donation_id
      and d.status = 'available'
      and d.expires_at > now()
      and p_quantity > 0
      and p_quantity = d.quantity
      and not exists (
        select 1 from public.pickup_requests r
        where r.donation_id = d.id and r.ngo_id = (select auth.uid())
          and r.status in ('pending', 'confirmed', 'picked_up')
      )
  );
$$;

revoke all on function public.can_submit_pickup_request(uuid, numeric) from public, anon;
grant execute on function public.can_submit_pickup_request(uuid, numeric) to authenticated;

create function public.lock_pickup_request_donation()
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
    raise exception 'A verified NGO must request the full quantity of an available donation';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_pickup_request_donation() from public, anon, authenticated;
create trigger lock_pickup_request_donation
  before insert on public.pickup_requests
  for each row execute function public.lock_pickup_request_donation();

create policy "NGOs can submit requests for available donations"
  on public.pickup_requests for insert to authenticated
  with check (
    ngo_id = (select auth.uid())
    and status = 'pending'
    and public.can_submit_pickup_request(donation_id, requested_quantity)
  );

create policy "Donors can read requests for their donations"
  on public.pickup_requests for select to authenticated
  using (
    exists (
      select 1 from public.donations d
      where d.id = pickup_requests.donation_id and d.donor_id = (select auth.uid())
    )
  );

create policy "NGOs can read their own pickup requests"
  on public.pickup_requests for select to authenticated
  using (ngo_id = (select auth.uid()));

create policy "Donors can read their donation status history"
  on public.donation_status_history for select to authenticated
  using (
    exists (
      select 1 from public.donations d
      where d.id = donation_status_history.donation_id and d.donor_id = (select auth.uid())
    )
  );

create policy "Donors can read related request status history"
  on public.pickup_request_status_history for select to authenticated
  using (
    exists (
      select 1
      from public.pickup_requests r
      join public.donations d on d.id = r.donation_id
      where r.id = pickup_request_status_history.pickup_request_id
        and d.donor_id = (select auth.uid())
    )
  );

create policy "NGOs can read their request status history"
  on public.pickup_request_status_history for select to authenticated
  using (
    exists (
      select 1 from public.pickup_requests r
      where r.id = pickup_request_status_history.pickup_request_id and r.ngo_id = (select auth.uid())
    )
  );

create policy "Participants can read handover records"
  on public.donation_handovers for select to authenticated
  using (
    recorded_by = (select auth.uid())
    or exists (
      select 1
      from public.pickup_requests r
      join public.donations d on d.id = r.donation_id
      where r.id = donation_handovers.pickup_request_id
        and (d.donor_id = (select auth.uid()) or r.ngo_id = (select auth.uid()))
    )
  );

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_donations_updated_at
  before update on public.donations
  for each row execute function public.touch_updated_at();

create trigger touch_pickup_requests_updated_at
  before update on public.pickup_requests
  for each row execute function public.touch_updated_at();

create function public.validate_donation_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'available' and new.expires_at <= now() then
    raise exception 'An expired donation cannot be published';
  end if;
  return new;
end;
$$;

create trigger validate_donation_state
  before insert or update on public.donations
  for each row execute function public.validate_donation_state();

create function public.record_donation_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.donation_status_history (donation_id, status, changed_by)
    values (new.id, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function public.record_donation_status() from public, anon, authenticated;
create trigger record_donation_status
  after insert or update of status on public.donations
  for each row execute function public.record_donation_status();

create function public.record_pickup_request_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.pickup_request_status_history (pickup_request_id, status, changed_by)
    values (new.id, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

revoke all on function public.record_pickup_request_status() from public, anon, authenticated;
create trigger record_pickup_request_status
  after insert or update of status on public.pickup_requests
  for each row execute function public.record_pickup_request_status();

create function public.review_pickup_request(p_request_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  donation_id uuid;
  current_request_status text;
  current_donation_status text;
  expiry timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required';
  end if;
  if p_action is null or p_action not in ('confirm', 'decline') then
    raise exception 'Action must be confirm or decline';
  end if;

  select d.id, r.status, d.status, d.expires_at
  into donation_id, current_request_status, current_donation_status, expiry
  from public.pickup_requests r
  join public.donations d on d.id = r.donation_id
  where r.id = p_request_id and d.donor_id = (select auth.uid())
  for update of d, r;

  if not found then raise exception 'Pickup request was not found for this donor'; end if;
  if current_request_status <> 'pending' then raise exception 'Pickup request is no longer pending'; end if;

  if p_action = 'decline' then
    update public.pickup_requests set status = 'declined' where id = p_request_id and status = 'pending';
    return;
  end if;

  if current_donation_status <> 'available' or expiry <= now() then
    raise exception 'Donation is no longer available for confirmation';
  end if;
  update public.donations set status = 'claimed'
  where id = donation_id and status = 'available' and expires_at > now();
  if not found then raise exception 'Donation was claimed or expired before confirmation'; end if;
  update public.pickup_requests set status = 'confirmed'
  where id = p_request_id and status = 'pending';
  if not found then raise exception 'Pickup request changed before confirmation'; end if;
end;
$$;

revoke all on function public.review_pickup_request(uuid, text) from public, anon;
grant execute on function public.review_pickup_request(uuid, text) to authenticated;

create function public.cancel_donation(p_donation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  select status into current_status
  from public.donations
  where id = p_donation_id and donor_id = (select auth.uid())
  for update;
  if not found then raise exception 'Donation was not found for this donor'; end if;
  if current_status not in ('draft', 'available') then
    raise exception 'Only drafts or unclaimed listings can be cancelled';
  end if;
  if exists (
    select 1 from public.pickup_requests
    where donation_id = p_donation_id and status in ('pending', 'confirmed', 'picked_up')
  ) then
    raise exception 'Resolve active pickup requests before cancelling this donation';
  end if;
  update public.donations set status = 'cancelled'
  where id = p_donation_id and status = current_status;
  if not found then raise exception 'Donation changed before cancellation'; end if;
end;
$$;

revoke all on function public.cancel_donation(uuid) from public, anon;
grant execute on function public.cancel_donation(uuid) to authenticated;

create function public.confirm_donor_handover(
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
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
  if p_note is not null and char_length(p_note) > 1000 then raise exception 'Handover note is too long'; end if;
  if p_photo_path is not null and p_photo_path not like (select auth.uid())::text || '/%' then
    raise exception 'Handover photo must belong to this donor';
  end if;

  select d.id, r.requested_quantity, r.status, d.status
  into donation_id, requested_quantity, request_status, donation_status
  from public.pickup_requests r
  join public.donations d on d.id = r.donation_id
  where r.id = p_request_id and d.donor_id = (select auth.uid())
  for update of d, r;

  if not found then raise exception 'Pickup request was not found for this donor'; end if;
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

create function public.confirm_ngo_receipt(p_request_id uuid, p_received_quantity numeric)
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
  if (select auth.uid()) is null then raise exception 'Authentication is required'; end if;
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
    select 1 from public.user_profiles p
    join public.ngo_profiles np on np.id = p.id and np.verification_status = 'verified'
    where p.id = (select auth.uid()) and p.role = 'ngo'
  ) then
    raise exception 'A verified NGO account is required to confirm receipt';
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
  if not found then raise exception 'Pickup request changed before receipt confirmation'; end if;
  update public.donations set status = 'completed'
  where id = donation_id and status = 'picked_up';
  if not found then raise exception 'Donation changed before receipt confirmation'; end if;
end;
$$;

revoke all on function public.confirm_ngo_receipt(uuid, numeric) from public, anon;
grant execute on function public.confirm_ngo_receipt(uuid, numeric) to authenticated;

create view public.donor_pickup_request_details
with (security_barrier = true, security_invoker = false)
as
select
  r.id as request_id,
  r.donation_id,
  r.requested_quantity,
  r.pickup_at,
  r.notes,
  r.status,
  r.received_quantity,
  r.receipt_confirmed_at,
  r.created_at,
  r.updated_at,
  np.organization_name,
  case when r.status in ('confirmed', 'picked_up', 'completed') then np.contact_name end as contact_name,
  case when r.status in ('confirmed', 'picked_up', 'completed') then np.contact_email end as contact_email,
  case when r.status in ('confirmed', 'picked_up', 'completed') then np.contact_phone end as contact_phone
from public.pickup_requests r
join public.donations d on d.id = r.donation_id
join public.ngo_profiles np on np.id = r.ngo_id
where d.donor_id = (select auth.uid());

revoke all on public.donor_pickup_request_details from anon, authenticated;
grant select on public.donor_pickup_request_details to authenticated;

create view public.donor_completed_impact
with (security_barrier = true, security_invoker = false)
as
select
  d.id as donation_id,
  d.cuisine_type,
  d.unit,
  r.received_quantity as quantity,
  r.receipt_confirmed_at as completed_at
from public.donations d
join public.pickup_requests r on r.donation_id = d.id
where d.donor_id = (select auth.uid())
  and r.status = 'completed'
  and d.status = 'completed';

revoke all on public.donor_completed_impact from anon, authenticated;
grant select on public.donor_completed_impact to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('donation-images', 'donation-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('handover-evidence', 'handover-evidence', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Donors can view their donation images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'donation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Donors can upload their donation images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'donation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy "Donors can delete their donation images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'donation-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Donors can upload their handover evidence"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'handover-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy "Participants can read handover evidence"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'handover-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.donation_handovers h
        join public.pickup_requests r on r.id = h.pickup_request_id
        where h.photo_path = storage.objects.name and r.ngo_id = (select auth.uid())
      )
    )
  );

create policy "Donors can delete their handover evidence"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'handover-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
