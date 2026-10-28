# Authentication and donor workflows

## Status and backend boundary

The application has routed Supabase Auth flows and donor screens, with
typed client-side data access. The SQL files under `supabase/migrations/` are
version-controlled drafts only. They have not been applied or tested against
PostgreSQL, and a live Supabase project/database connection is not verified.
Do not treat a successful frontend build or an MCP project-metadata response
as evidence that auth, RLS, Storage, or RPC calls work.

The current migrations are ordered prerequisites:

1. `20261028000000_auth_profiles_onboarding.sql` drafts user and role profiles,
   initial role assignment, onboarding state, RLS, and private profile/NGO
   document storage.
2. `20261029000000_donor_module.sql` drafts donations, pickup requests,
   status history, donor handover, recipient receipt confirmation, RLS,
   private image buckets, and donor impact views.

Confirm the intended development target and review both migrations before
applying them. Neither should be applied to a shared or production project
without explicit approval.

## Authentication and access flow

The browser uses `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`; these are public client values and do not
grant privileged access. A service-role key or database credential must never
be added to frontend code or a `VITE_` variable. The auth context loads the
authenticated session and the corresponding profile; route guards distinguish
signed-out, role-selection, profile-completion, role-onboarding, and
verification-pending states.

Implemented auth routes include sign-in, sign-up, confirmation-email pending,
password reset/update, auth callback, role selection, shared profile
completion, donor onboarding, and NGO onboarding/pending verification. Role
selection is only a request to assign an initial role: the draft
`assign_initial_role` RPC accepts it once when the account role is unset. A
client-selected role is not a trusted authorization check.

The PDF shows a six-digit email-code entry screen. The current Supabase flow
uses a confirmation link and PKCE callback instead. This is a documented UX
deviation pending confirmation of the email configuration and product
requirement; do not describe the code-entry design as implemented.

## Donor routes and lifecycle

Implemented donor routes cover dashboard, create/edit donation, donation
list/detail, pickup-request list/detail and decisions, donor handover, and
impact reporting. Messages, notifications, profile, and settings are
navigation placeholders; notification delivery is not implemented.

The draft database contract is designed around:

- Donations: `draft` → `available` → `claimed` → `picked_up` → `completed`,
  with `cancelled` available only before a request is claimed. A listing
  cannot be edited when an active request exists.
- Pickup requests: `pending` → `confirmed` or `declined`; a confirmed request
  proceeds to `picked_up` after donor handover, then `completed` after
  recipient confirmation. The donor's confirm/decline and handover operations
  use transaction-oriented RPCs in the draft.
- Requests are **whole-donation only**: requested quantity must equal the
  listed quantity. Donor handover and the later NGO receipt quantity must
  match that full amount. Partial fulfillment/discrepancy handling is not
  implemented.
- `confirm_ngo_receipt` is a backend integration boundary for a future
  verified-NGO workflow. There is no NGO receipt interface in this phase.
  Delivery assignment/volunteer collection is also outside the implemented
  workflow.

These are draft SQL rules, not verified database behavior. Conflict handling
for multiple pending requests, cancellation/recovery after failures, and
dispute/correction workflows remain product decisions.

## Impact calculations

The donor impact code derives totals from completed records with a
recipient-confirmed receipt; pending or donor-only handover records do not
count. It counts only an explicit `servings` quantity as meals and sums
explicit `kg` as food weight. It does not convert `portions` or `items` into
servings or kilograms. People-fed and CO₂ metrics remain unavailable because
there is no verified people count or approved CO₂ conversion factor. Mock
values in the PDF are illustrative and are not used as live totals.

## Verification state

The configured unit/component tests cover selected auth route/validation and
donor metric/input-validation logic. They do not execute migrations, assert
RLS policies, test Storage permissions, or exercise authenticated Supabase
workflows. Those checks require an authorized development database and
account configuration. See `docs/setup.md` for setup and approval
requirements.
