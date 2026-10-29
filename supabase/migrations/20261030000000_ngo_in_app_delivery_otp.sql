begin;

alter table public.delivery_otp_challenges
  add column otp_encrypted text;

alter table public.delivery_otp_challenges
  add constraint delivery_otp_challenges_encrypted_format
  check (otp_encrypted is null or otp_encrypted ~ '^[A-Za-z0-9+/]{43}=$');

create function public.clear_verified_delivery_otp_ciphertext()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.used_at is not null then
    new.otp_encrypted := null;
  end if;
  return new;
end;
$$;

revoke all on function public.clear_verified_delivery_otp_ciphertext() from public, anon, authenticated;

create trigger delivery_otp_clear_ciphertext_after_use
before update of used_at on public.delivery_otp_challenges
for each row
execute function public.clear_verified_delivery_otp_ciphertext();

create function public.issue_delivery_otp_for_ngo(
  p_request_id uuid,
  p_ngo_owner_id uuid,
  p_otp_hash text,
  p_otp_encrypted text,
  p_expires_at timestamptz,
  p_now timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  assigned_volunteer_id uuid;
  issue_result text;
begin
  if p_otp_encrypted is null or p_otp_encrypted !~ '^[A-Za-z0-9+/]{43}=$' then
    return 'not_ready';
  end if;

  if not exists (
    select 1
    from public.user_profiles p
    join public.ngo_profiles np on np.id = p.id
    where p.id = p_ngo_owner_id
      and p.role = 'ngo'
  ) then
    return 'unauthorized';
  end if;

  select r.volunteer_id
  into assigned_volunteer_id
  from public.pickup_requests r
  where r.id = p_request_id
    and r.ngo_id = p_ngo_owner_id;
  if not found or assigned_volunteer_id is null then
    return 'unauthorized';
  end if;

  issue_result := public.issue_delivery_otp(
    p_request_id,
    assigned_volunteer_id,
    p_otp_hash,
    p_expires_at,
    p_now
  );
  if issue_result <> 'issued' then
    return issue_result;
  end if;

  update public.delivery_otp_challenges
  set otp_encrypted = p_otp_encrypted
  where request_id = p_request_id
    and ngo_id = p_ngo_owner_id
    and volunteer_id = assigned_volunteer_id
    and verified_at is null
    and used_at is null;
  if not found then
    raise exception 'Delivery OTP challenge changed during NGO issuance';
  end if;

  return 'issued';
end;
$$;

revoke all on function public.issue_delivery_otp_for_ngo(uuid, uuid, text, text, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.issue_delivery_otp_for_ngo(uuid, uuid, text, text, timestamptz, timestamptz)
  to service_role;

commit;
