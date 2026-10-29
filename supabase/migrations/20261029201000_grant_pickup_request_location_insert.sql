begin;

grant insert (
  donation_id,
  ngo_id,
  requested_quantity,
  pickup_at,
  notes,
  dropoff_address,
  dropoff_latitude,
  dropoff_longitude
) on public.pickup_requests to authenticated;

commit;
