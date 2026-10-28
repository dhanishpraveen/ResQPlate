create table public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text check (role is null or role in ('donor', 'ngo', 'volunteer')),
  full_name text,
  phone_number text,
  address text,
  about text,
  avatar_path text,
  profile_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_name_length check (full_name is null or char_length(full_name) <= 120),
  constraint user_profiles_phone_format check (phone_number is null or phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  constraint user_profiles_avatar_owner_path check (
    avatar_path is null or avatar_path like id::text || '/%'
  )
);

create table public.donor_profiles (
  id uuid primary key references public.user_profiles (id) on delete cascade,
  business_name text,
  cuisine_type text,
  business_address text,
  operating_hours jsonb,
  food_capacity_per_day integer,
  terms_accepted_at timestamptz,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint donor_profiles_capacity_positive check (
    food_capacity_per_day is null or food_capacity_per_day > 0
  ),
  constraint donor_profiles_operating_hours_valid check (
    operating_hours is null
    or (
      jsonb_typeof(operating_hours) = 'object'
      and coalesce(operating_hours ->> 'opens', '') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
      and coalesce(operating_hours ->> 'closes', '') ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
    )
  )
);

create table public.ngo_profiles (
  id uuid primary key references public.user_profiles (id) on delete cascade,
  organization_name text,
  organization_address text,
  registration_number text,
  organization_type text,
  description text,
  contact_name text,
  contact_designation text,
  contact_email text,
  contact_phone text,
  registration_certificate_path text,
  ngo_proof_path text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected')),
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ngo_profiles_name_length check (
    organization_name is null or char_length(organization_name) <= 180
  ),
  constraint ngo_profiles_address_length check (
    organization_address is null or char_length(organization_address) <= 500
  ),
  constraint ngo_profiles_document_paths_owner check (
    (registration_certificate_path is null or registration_certificate_path like id::text || '/%')
    and (ngo_proof_path is null or ngo_proof_path like id::text || '/%')
  )
);

create table public.volunteer_profiles (
  id uuid primary key references public.user_profiles (id) on delete cascade,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index user_profiles_role_idx on public.user_profiles (role);
create index ngo_profiles_verification_status_idx on public.ngo_profiles (verification_status);

alter table public.user_profiles enable row level security;
alter table public.donor_profiles enable row level security;
alter table public.ngo_profiles enable row level security;
alter table public.volunteer_profiles enable row level security;

revoke all on public.user_profiles from anon, authenticated;
revoke all on public.donor_profiles from anon, authenticated;
revoke all on public.ngo_profiles from anon, authenticated;
revoke all on public.volunteer_profiles from anon, authenticated;

grant select on public.user_profiles to authenticated;
grant update (full_name, phone_number, address, about, avatar_path)
  on public.user_profiles to authenticated;

grant select on public.donor_profiles to authenticated;
grant insert (id, business_name, cuisine_type, business_address, operating_hours, food_capacity_per_day, terms_accepted_at)
  on public.donor_profiles to authenticated;
grant update (business_name, cuisine_type, business_address, operating_hours, food_capacity_per_day, terms_accepted_at)
  on public.donor_profiles to authenticated;

grant select on public.ngo_profiles to authenticated;
grant insert (
  id, organization_name, organization_address, registration_number, organization_type, description,
  contact_name, contact_designation, contact_email, contact_phone,
  registration_certificate_path, ngo_proof_path
) on public.ngo_profiles to authenticated;
grant update (
  organization_name, organization_address, registration_number, organization_type, description,
  contact_name, contact_designation, contact_email, contact_phone,
  registration_certificate_path, ngo_proof_path
) on public.ngo_profiles to authenticated;

grant select on public.volunteer_profiles to authenticated;

create policy "Users can view their own profile"
  on public.user_profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users can update their own editable profile fields"
  on public.user_profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Donors can view their own donor profile"
  on public.donor_profiles for select to authenticated
  using (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy "Donors can create their own donor profile"
  on public.donor_profiles for insert to authenticated
  with check (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy "Donors can update their own donor profile"
  on public.donor_profiles for update to authenticated
  using (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  )
  with check (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'donor'
    )
  );

create policy "NGOs can view their own organization profile"
  on public.ngo_profiles for select to authenticated
  using (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  );

create policy "NGOs can create their own organization profile"
  on public.ngo_profiles for insert to authenticated
  with check (
    (select auth.uid()) = id
    and verification_status = 'pending'
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  );

create policy "NGOs can update their own organization profile"
  on public.ngo_profiles for update to authenticated
  using (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  )
  with check (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  );

create policy "Volunteers can view their own volunteer profile"
  on public.volunteer_profiles for select to authenticated
  using (
    (select auth.uid()) = id
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'volunteer'
    )
  );

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role text;
  supplied_name text;
  supplied_phone text;
begin
  requested_role := nullif(lower(coalesce(new.raw_user_meta_data ->> 'role', '')), '');
  if requested_role is not null and requested_role not in ('donor', 'ngo', 'volunteer') then
    raise exception 'Unsupported account role';
  end if;

  supplied_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  supplied_phone := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')), '');
  if supplied_name is not null and char_length(supplied_name) > 120 then
    raise exception 'Name is too long';
  end if;
  if supplied_phone is not null and supplied_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Phone number must be in E.164 format';
  end if;

  insert into public.user_profiles (id, role, full_name, phone_number)
  values (new.id, requested_role, supplied_name, supplied_phone);

  if requested_role = 'donor' then
    insert into public.donor_profiles (id) values (new.id);
  elsif requested_role = 'ngo' then
    insert into public.ngo_profiles (id, verification_status) values (new.id, 'pending');
  elsif requested_role = 'volunteer' then
    insert into public.volunteer_profiles (id) values (new.id);
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create function public.assign_initial_role(p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or p_role is null or p_role not in ('donor', 'ngo', 'volunteer') then
    raise exception 'A supported initial role and authenticated user are required';
  end if;

  update public.user_profiles
  set role = p_role, updated_at = now()
  where id = current_user_id and role is null;

  if not found then
    raise exception 'The account role is already assigned';
  end if;

  if p_role = 'donor' then
    insert into public.donor_profiles (id) values (current_user_id);
  elsif p_role = 'ngo' then
    insert into public.ngo_profiles (id, verification_status) values (current_user_id, 'pending');
  else
    insert into public.volunteer_profiles (id) values (current_user_id);
  end if;
end;
$$;

revoke all on function public.assign_initial_role(text) from public, anon;
grant execute on function public.assign_initial_role(text) to authenticated;

create function public.refresh_profile_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_complete boolean;
begin
  is_complete := case new.role
    when 'donor' then nullif(btrim(coalesce(new.full_name, '')), '') is not null
      and nullif(btrim(coalesce(new.address, '')), '') is not null
    when 'ngo' then nullif(btrim(coalesce(new.full_name, '')), '') is not null
      and nullif(btrim(coalesce(new.phone_number, '')), '') is not null
    when 'volunteer' then nullif(btrim(coalesce(new.full_name, '')), '') is not null
      and nullif(btrim(coalesce(new.phone_number, '')), '') is not null
    else false
  end;

  update public.user_profiles
  set profile_completed = is_complete,
      updated_at = now()
  where id = new.id and profile_completed is distinct from is_complete;

  return new;
end;
$$;

revoke all on function public.refresh_profile_completion() from public, anon, authenticated;
create trigger refresh_user_profile_completion
  after insert or update of role, full_name, phone_number, address on public.user_profiles
  for each row execute function public.refresh_profile_completion();

create function public.set_donor_onboarding_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.terms_accepted_at is not null then
      new.terms_accepted_at := old.terms_accepted_at;
    elsif new.terms_accepted_at is not null then
      new.terms_accepted_at := now();
    end if;
  elsif new.terms_accepted_at is not null then
    new.terms_accepted_at := now();
  end if;

  new.onboarding_complete :=
    nullif(btrim(coalesce(new.business_name, '')), '') is not null
    and nullif(btrim(coalesce(new.cuisine_type, '')), '') is not null
    and nullif(btrim(coalesce(new.business_address, '')), '') is not null
    and new.operating_hours is not null
    and new.food_capacity_per_day is not null
    and new.terms_accepted_at is not null;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_donor_onboarding_state() from public, anon, authenticated;
create trigger set_donor_onboarding_state
  before insert or update on public.donor_profiles
  for each row execute function public.set_donor_onboarding_state();

create function public.set_ngo_onboarding_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.verification_status := old.verification_status;
  else
    new.verification_status := 'pending';
  end if;

  new.onboarding_complete :=
    nullif(btrim(coalesce(new.organization_name, '')), '') is not null
    and nullif(btrim(coalesce(new.organization_address, '')), '') is not null
    and nullif(btrim(coalesce(new.registration_number, '')), '') is not null
    and nullif(btrim(coalesce(new.organization_type, '')), '') is not null
    and nullif(btrim(coalesce(new.contact_name, '')), '') is not null
    and nullif(btrim(coalesce(new.contact_designation, '')), '') is not null
    and nullif(btrim(coalesce(new.contact_email, '')), '') is not null
    and nullif(btrim(coalesce(new.contact_phone, '')), '') is not null
    and new.registration_certificate_path is not null
    and new.ngo_proof_path is not null;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_ngo_onboarding_state() from public, anon, authenticated;
create trigger set_ngo_onboarding_state
  before insert or update on public.ngo_profiles
  for each row execute function public.set_ngo_onboarding_state();

create function public.set_volunteer_onboarding_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.user_profiles%rowtype;
begin
  select * into profile from public.user_profiles where id = new.id;
  new.onboarding_complete :=
    nullif(btrim(coalesce(profile.full_name, '')), '') is not null
    and nullif(btrim(coalesce(profile.phone_number, '')), '') is not null;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.set_volunteer_onboarding_state() from public, anon, authenticated;
create trigger set_volunteer_onboarding_state
  before insert or update on public.volunteer_profiles
  for each row execute function public.set_volunteer_onboarding_state();

create function public.refresh_volunteer_onboarding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.volunteer_profiles
  set updated_at = now()
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.refresh_volunteer_onboarding() from public, anon, authenticated;
create trigger refresh_volunteer_on_profile_change
  after update of full_name, phone_number on public.user_profiles
  for each row execute function public.refresh_volunteer_onboarding();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-images', 'profile-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('ngo-verification', 'ngo-verification', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can read their own profile images"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can upload their own profile images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own profile images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "NGOs can read their own verification files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ngo-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  );

create policy "NGOs can upload their own verification files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ngo-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  );

create policy "NGOs can delete their own verification files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ngo-verification'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.user_profiles p
      where p.id = (select auth.uid()) and p.role = 'ngo'
    )
  );
