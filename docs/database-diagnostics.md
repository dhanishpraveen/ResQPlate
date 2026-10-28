# Supabase database diagnostics

**Status:** initial production schema setup applied and verified  
**Last checked:** 2026-10-29

## Project identity

The verified MCP project is `ResQPlate`, reference
`ohfooorhpbciphscxteb`. The user identified this as production and explicitly
authorized initial schema setup. The reference matches the frontend
`VITE_SUPABASE_URL`, server-side `SUPABASE_URL`, and workspace MCP URL.
`.env.example` contains empty `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` placeholders. `.env.local` was not present.
`.env` also contains `VITE_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`; their values are intentionally not recorded or
displayed.

## MCP configuration and authentication

- `.vscode/mcp.json` is project-scoped and uses the configured project
  reference and supplied feature list. It omits `read_only=true` as
  requested; this does not alone prove write capability.
- The JSON and URL parameters parsed successfully. No token or service-role
  key is embedded in the workspace configuration.
- The user-level Copilot CLI `supabase` entry points at a different project
  and was not changed. The connected workspace Supabase MCP tools were used
  for project verification, inspection, and applying the migrations.

## Applied migrations and live schema

The three migrations were applied in this order:

1. `20261028000000_auth_profiles_onboarding.sql`
2. `20261029000001_backfill_existing_auth_profiles.sql`
3. `20261029000000_donor_module.sql`

Each `apply_migration` call returned success. Supabase migration history
records:

- `20261028191501` — `20261028000000_auth_profiles_onboarding`
- `20261028191517` — `20261029000001_backfill_existing_auth_profiles`
- `20261028191623` — `20261029000000_donor_module`

All nine expected public tables exist: `user_profiles`, `donor_profiles`,
`ngo_profiles`, `volunteer_profiles`, `donations`, `pickup_requests`,
`donation_status_history`, `pickup_request_status_history`, and
`donation_handovers`. All nine have RLS enabled. Read-only catalog checks
found 53 constraints, 19 indexes, 19 public policies, 18 functions, 12
triggers, two views, four private storage buckets, and 12 storage policies.
Verbose table listing confirmed expected columns, primary keys, and foreign
keys.

The backfill created a profile for the existing Auth account without
modifying its Auth record. Post-migration checks found one profile for one
Auth user, zero Auth users without a profile, one null-role profile, and zero
assigned-role profiles. The role remains unset for the account holder to
choose through onboarding. Authenticated users have SELECT and an own-row
RLS policy, but cannot update the role or profile completion fields.
Anonymous users have no SELECT grant. NGO verification and donor onboarding
state columns are also not directly updateable by authenticated users.

Static inspection found no `DROP`, `TRUNCATE`, or `DELETE` statements or
destructive table alterations. The four target buckets were absent in the
preflight before the bucket upserts. The migrations contain non-idempotent
DDL and must not be rerun. Auth-user deletion cascades to associated profile
rows by design.

## `user_profiles` request and 404

`src/auth/AuthContext.tsx` queries `user_profiles`, selects all columns,
filters by the authenticated user's ID, and calls `maybeSingle()`. The table
now exists in the configured project and is available to authenticated
queries with RLS limiting rows to the caller. No anonymous select grant
exists. The exact authenticated frontend request was not replayed because
this verification did not use the user's browser session.

Before migration, the live database had no `public.user_profiles` table,
which establishes the missing-table condition as the evidenced cause of the
reported 404. The original response body/code was not captured; request-level
confirmation after migration remains outstanding.

## Remaining verification

1. Sign in through the frontend with the existing account and confirm the
   authenticated `user_profiles` request succeeds and routes to role
   onboarding. No role was assigned by these migrations.
2. If the request still fails, capture only its response body/code and verify
   the request host. Do not share authorization headers or tokens.
