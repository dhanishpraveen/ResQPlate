insert into public.user_profiles (id)
select id
from auth.users
on conflict (id) do nothing;
