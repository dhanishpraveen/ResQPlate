begin;

create or replace function public.verify_delivery_otp(
  p_request_id uuid,
  p_volunteer_id uuid,
  p_otp_hash text,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_donation_id uuid;
  request_ngo_id uuid;
  assigned_volunteer_id uuid;
  request_status text;
  pickup_at timestamptz;
  delivered_at timestamptz;
  verification_status text;
  donation_status text;
  stored_hash text;
  challenge_expiry timestamptz;
  attempts integer;
  used_at timestamptz;
  verified_at timestamptz;
  hash_difference integer := 0;
  hash_index integer;
begin
  if p_otp_hash is null or p_otp_hash !~ '^[0-9a-f]{64}$' or p_now is null then
    return 'invalid';
  end if;

  select r.donation_id into request_donation_id
  from public.pickup_requests r
  where r.id = p_request_id;
  if not found then return 'unauthorized'; end if;

  select d.status into donation_status
  from public.donations d
  where d.id = request_donation_id
  for update;
  if not found then return 'not_ready'; end if;

  select r.ngo_id, r.volunteer_id, r.status, r.volunteer_picked_up_at,
         r.volunteer_delivered_at, r.delivery_verification_status
  into request_ngo_id, assigned_volunteer_id, request_status, pickup_at,
       delivered_at, verification_status
  from public.pickup_requests r
  where r.id = p_request_id
  for update;
  if not found or assigned_volunteer_id is distinct from p_volunteer_id then
    return 'unauthorized';
  end if;
  if not exists (
    select 1
    from public.user_profiles p
    join public.volunteer_profiles vp on vp.id = p.id
    where p.id = p_volunteer_id
      and p.role = 'volunteer'
      and vp.onboarding_complete
  ) then
    return 'unauthorized';
  end if;
  if request_status <> 'picked_up' or donation_status <> 'picked_up'
     or pickup_at is null or verification_status <> 'pending'
     or not exists (
       select 1 from public.donation_handovers h
       where h.pickup_request_id = p_request_id
     ) then
    return 'not_ready';
  end if;
  if delivered_at is not null then return 'already_used'; end if;

  perform 1
  from public.ngo_profiles np
  where np.id = request_ngo_id
  for update;
  if not found then return 'not_ready'; end if;

  select c.otp_hash, c.expires_at, c.attempt_count, c.verified_at, c.used_at
  into stored_hash, challenge_expiry, attempts, verified_at, used_at
  from public.delivery_otp_challenges c
  where c.request_id = p_request_id
    and c.ngo_id = request_ngo_id
    and c.volunteer_id = p_volunteer_id
  for update;
  if not found then return 'invalid'; end if;
  if used_at is not null or verified_at is not null then return 'already_used'; end if;
  if p_now >= challenge_expiry then return 'expired'; end if;
  if attempts >= 5 then return 'too_many_attempts'; end if;

  for hash_index in 1..64 loop
    hash_difference := hash_difference
      | (pg_catalog.ascii(pg_catalog.substr(stored_hash, hash_index, 1))
      # pg_catalog.ascii(pg_catalog.substr(p_otp_hash, hash_index, 1)));
  end loop;

  if hash_difference <> 0 then
    update public.delivery_otp_challenges
    set attempt_count = attempt_count + 1
    where request_id = p_request_id;
    if attempts + 1 >= 5 then return 'too_many_attempts'; end if;
    return 'invalid';
  end if;

  update public.delivery_otp_challenges
  set verified_at = p_now,
      used_at = p_now
  where request_id = p_request_id
    and verified_at is null
    and used_at is null;
  if not found then return 'already_used'; end if;

  update public.pickup_requests
  set volunteer_delivered_at = p_now
  where id = p_request_id
    and volunteer_id = p_volunteer_id
    and status = 'picked_up'
    and volunteer_delivered_at is null
    and delivery_verification_status = 'pending';
  if not found then raise exception 'Delivery changed during OTP verification'; end if;

  return 'verified';
end;
$$;

revoke all on function public.verify_delivery_otp(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.verify_delivery_otp(uuid, uuid, text, timestamptz)
  to service_role;

commit;
