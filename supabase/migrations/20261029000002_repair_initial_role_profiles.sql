create or replace function public.assign_initial_role(p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  auth_metadata jsonb;
  supplied_name text;
  supplied_phone text;
  assigned_role text;
begin
  if current_user_id is null or p_role is null or p_role not in ('donor', 'ngo', 'volunteer') then
    raise exception 'A supported initial role and authenticated user are required';
  end if;

  select u.raw_user_meta_data
  into auth_metadata
  from auth.users u
  where u.id = current_user_id;

  if not found then
    raise exception 'The authenticated user record was not found';
  end if;

  supplied_name := nullif(btrim(coalesce(auth_metadata ->> 'full_name', '')), '');
  if char_length(supplied_name) > 120 then
    supplied_name := null;
  end if;

  supplied_phone := nullif(btrim(coalesce(auth_metadata ->> 'phone_number', '')), '');
  if supplied_phone !~ '^\+[1-9][0-9]{7,14}$' then
    supplied_phone := null;
  end if;

  insert into public.user_profiles (id, role, full_name, phone_number)
  values (current_user_id, p_role, supplied_name, supplied_phone)
  on conflict (id) do nothing;

  select p.role
  into assigned_role
  from public.user_profiles p
  where p.id = current_user_id
  for update;

  if not found then
    raise exception 'The application profile could not be created';
  end if;

  if assigned_role is null then
    update public.user_profiles
    set role = p_role, updated_at = now()
    where id = current_user_id;
  elsif assigned_role <> p_role then
    raise exception 'The account role is already assigned';
  end if;

  if p_role = 'donor' then
    insert into public.donor_profiles (id) values (current_user_id)
    on conflict (id) do nothing;
  elsif p_role = 'ngo' then
    insert into public.ngo_profiles (id) values (current_user_id)
    on conflict (id) do nothing;
  else
    insert into public.volunteer_profiles (id) values (current_user_id)
    on conflict (id) do nothing;
  end if;
end;
$$;

revoke all on function public.assign_initial_role(text) from public, anon;
grant execute on function public.assign_initial_role(text) to authenticated;
