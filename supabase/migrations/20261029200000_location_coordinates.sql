begin;

alter table public.donations
  add column pickup_latitude double precision,
  add column pickup_longitude double precision;

alter table public.donations
  add constraint donations_pickup_latitude_check
    check (pickup_latitude is null or pickup_latitude between -90 and 90),
  add constraint donations_pickup_longitude_check
    check (pickup_longitude is null or pickup_longitude between -180 and 180),
  add constraint donations_pickup_coordinates_pair_check
    check ((pickup_latitude is null) = (pickup_longitude is null));

alter table public.ngo_profiles
  add column organization_latitude double precision,
  add column organization_longitude double precision;

alter table public.ngo_profiles
  add constraint ngo_profiles_organization_latitude_check
    check (organization_latitude is null or organization_latitude between -90 and 90),
  add constraint ngo_profiles_organization_longitude_check
    check (organization_longitude is null or organization_longitude between -180 and 180),
  add constraint ngo_profiles_organization_coordinates_pair_check
    check ((organization_latitude is null) = (organization_longitude is null));

alter table public.pickup_requests
  add column dropoff_address text,
  add column dropoff_latitude double precision,
  add column dropoff_longitude double precision;

alter table public.pickup_requests
  add constraint pickup_requests_dropoff_latitude_check
    check (dropoff_latitude is null or dropoff_latitude between -90 and 90),
  add constraint pickup_requests_dropoff_longitude_check
    check (dropoff_longitude is null or dropoff_longitude between -180 and 180),
  add constraint pickup_requests_dropoff_coordinates_pair_check
    check ((dropoff_latitude is null) = (dropoff_longitude is null));

commit;
