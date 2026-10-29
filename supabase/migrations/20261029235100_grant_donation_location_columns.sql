begin;

grant insert (pickup_latitude, pickup_longitude)
  on public.donations to authenticated;

grant update (pickup_latitude, pickup_longitude)
  on public.donations to authenticated;

commit;
