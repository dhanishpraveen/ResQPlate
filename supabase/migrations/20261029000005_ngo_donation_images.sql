drop function public.list_available_donations(uuid);

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
  created_at timestamptz,
  photo_path text
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
    where p.id = (select auth.uid())
      and p.role = 'ngo'
  ) then
    raise exception 'An authenticated NGO account is required to browse available donations'
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
    d.created_at,
    d.photo_path
  from public.donations d
  where d.status = 'available'
    and d.expires_at > pg_catalog.now()
    and (p_donation_id is null or d.id = p_donation_id)
  order by d.expires_at asc;
end;
$$;

revoke all on function public.list_available_donations(uuid) from public, anon;
grant execute on function public.list_available_donations(uuid) to authenticated, service_role;

create function public.can_ngo_view_donation_image(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.user_profiles p
      where p.id = (select auth.uid())
        and p.role = 'ngo'
    )
    and exists (
      select 1
      from public.donations d
      where d.photo_path = p_object_name
        and d.status = 'available'
        and d.expires_at > pg_catalog.now()
    );
$$;

revoke all on function public.can_ngo_view_donation_image(text) from public, anon;
grant execute on function public.can_ngo_view_donation_image(text) to authenticated;

drop policy if exists "NGOs can view available donation images" on storage.objects;
create policy "NGOs can view available donation images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'donation-images'
    and public.can_ngo_view_donation_image(name)
  );
