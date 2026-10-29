begin;

create or replace function public.issue_delivery_otp(
  p_request_id uuid,
  p_volunteer_id uuid,
  p_otp_hash text,
  p_expires_at timestamptz,
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
  previous_sent_at timestamptz;
  previous_verified_at timestamptz;
  previous_used_at timestamptz;
  ngo_send_count bigint;
begin
  if p_otp_hash is null or p_otp_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null or p_now is null
     or p_expires_at <= p_now
     or p_expires_at > p_now + interval '15 minutes' then
    return 'not_ready';
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
     or pickup_at is null or delivered_at is not null
     or verification_status <> 'pending'
     or not exists (
       select 1 from public.donation_handovers h
       where h.pickup_request_id = p_request_id
     ) then
    return 'not_ready';
  end if;

  perform 1
  from public.ngo_profiles np
  where np.id = request_ngo_id
  for update;
  if not found then return 'not_ready'; end if;

  select c.sent_at, c.verified_at, c.used_at
  into previous_sent_at, previous_verified_at, previous_used_at
  from public.delivery_otp_challenges c
  where c.request_id = p_request_id
  for update;
  if previous_used_at is not null or previous_verified_at is not null then
    return 'already_used';
  end if;
  if previous_sent_at is not null and p_now < previous_sent_at + interval '60 seconds' then
    return 'cooldown';
  end if;

  select count(*) into ngo_send_count
  from public.delivery_otp_send_events e
  where e.ngo_id = request_ngo_id
    and e.attempted_at > p_now - interval '1 hour';
  if ngo_send_count >= 5 then return 'rate_limited'; end if;

  delete from public.delivery_otp_send_events
  where attempted_at < p_now - interval '1 day';

  insert into public.delivery_otp_send_events (request_id, ngo_id, volunteer_id, attempted_at)
  values (p_request_id, request_ngo_id, p_volunteer_id, p_now);

  insert into public.delivery_otp_challenges (
    request_id, ngo_id, volunteer_id, otp_hash, expires_at, attempt_count, sent_at, verified_at, used_at
  )
  values (
    p_request_id, request_ngo_id, p_volunteer_id, p_otp_hash, p_expires_at, 0, p_now, null, null
  )
  on conflict (request_id) do update
  set ngo_id = excluded.ngo_id,
      volunteer_id = excluded.volunteer_id,
      otp_hash = excluded.otp_hash,
      expires_at = excluded.expires_at,
      attempt_count = 0,
      sent_at = excluded.sent_at,
      verified_at = null,
      used_at = null,
      created_at = p_now;

  return 'issued';
end;
$$;

revoke all on function public.issue_delivery_otp(uuid, uuid, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_delivery_otp(uuid, uuid, text, timestamptz, timestamptz)
  to service_role;

commit;
