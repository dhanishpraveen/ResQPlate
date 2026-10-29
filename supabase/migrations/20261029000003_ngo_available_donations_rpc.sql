create function public.list_available_donations(p_donation_id uuid default null)
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
      and np.verification_status = 'verified'
  ) then
    raise exception 'A verified NGO account is required to browse available donations'
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

revoke all on function public.list_available_donations(uuid) from public, anon;
grant execute on function public.list_available_donations(uuid) to authenticated;
