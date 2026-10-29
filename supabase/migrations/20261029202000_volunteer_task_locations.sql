begin;

drop function public.list_volunteer_tasks();

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
  volunteer_assigned boolean,
  donor_name text,
  donor_phone text,
  pickup_address text,
  pickup_latitude double precision,
  pickup_longitude double precision,
  pickup_instructions text,
  ngo_name text,
  ngo_address text,
  dropoff_latitude double precision,
  dropoff_longitude double precision,
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
    r.volunteer_id = current_user_id,
    case when r.volunteer_id = current_user_id then coalesce(dp.business_name, donor_user.full_name) end,
    case when r.volunteer_id = current_user_id then donor_user.phone_number end,
    d.pickup_address,
    d.pickup_latitude,
    d.pickup_longitude,
    case when r.volunteer_id = current_user_id then d.pickup_instructions end,
    coalesce(np.organization_name, np.contact_name),
    coalesce(r.dropoff_address, np.organization_address),
    coalesce(r.dropoff_latitude, np.organization_latitude),
    coalesce(r.dropoff_longitude, np.organization_longitude),
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

commit;
