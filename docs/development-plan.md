# ResQPlate development plan

## Operating rules

Work on one explicitly requested phase at a time. Before implementation, read
`.github/copilot-instructions.md`, inspect relevant source and design pages,
and state the scoped work briefly. Reuse existing code. Verify changes with
applicable commands, document outcomes and blockers, and do not advance to a
later phase without instruction. The approved visual reference is
`docs/design/ResQPlate_UI.pdf`; all 53 pages have been visually inventoried.

## Foundation progress

The foundation baseline is established: the minimal React/Vite bootstrap,
TypeScript checking, Tailwind integration, project documentation, environment
template, and read-only development MCP template are in place. All 53 PDF
pages were rendered and visually reviewed. The reference does not identify an
original font or provide separate source assets; these limitations and design
ambiguities are recorded in `docs/design/design-inventory.md`.

The initial Supabase production schema setup has since been applied and
verified; see the milestone below and
[`database-diagnostics.md`](./database-diagnostics.md) for results. The
frontend authentication and donor workflows are implemented. The profile
backfill migration was added and applied without assigning a role to the
existing account.

### Phase 2A.1 database diagnostics

- Updated the workspace VS Code MCP endpoint to use the locally configured
  project reference, the supplied feature selection, and `read_only=true`.
  JSON and query-string parsing passed locally; this is not evidence of
  OAuth, live database access, or development-environment identity.
- The installed Copilot CLI has a separate user-level `supabase` server
  configured for a different project reference without the read-only
  parameter. It was not changed because that global entry may serve other
  workspaces.
- The attempted repository-scoped CLI entry was not recognized by the
  installed CLI's `mcp list`/`mcp get` commands and was not retained.
- No authenticated MCP operation was available. Live schema, RLS, grants,
  API exposure, and hosted migration history remain unverified. No hosted
  writes or schema-cache refreshes occurred. The `user_profiles` 404 remains
  unresolved because the actual response body was unavailable.
- **Phase 2A.1 status:** workspace configuration corrected; read-only
  diagnostics blocked on selecting/authenticating the appropriate MCP
  configuration and confirming the Dashboard project identity. See
  [`database-diagnostics.md`](./database-diagnostics.md).

### Phase 2A.2 Supabase MCP write-capable configuration

- Updated `.vscode/mcp.json` to omit `read_only=true`, preserving the
  configured project reference and feature list. JSON and URL parameters
  parse successfully.
- Inspected `.env`, `.env.example`, Supabase client initialization, both
  migration drafts, and the existing diagnostics. Secret values were not
  printed.
- Authenticated read-only MCP checks confirmed project `ResQPlate`
  (`ohfooorhpbciphscxteb`), identified by the user as production. The live
  `public` schema has zero base tables, the MCP migration list is empty, the
  migration-history table is absent, and one auth user exists.
- The authentication/profile migration creates profile records only for
  future auth inserts; it does not backfill that existing account. Therefore
  the two migrations as written would leave the existing account without its
  profile row. This is a stop condition. No migrations or other hosted writes
  were applied.
- Static review found no `DROP`, `TRUNCATE`, `DELETE`, or destructive table
  alterations. The bucket upserts can update existing bucket configuration,
  but the four target bucket IDs were absent in preflight. Migrations contain
  non-idempotent DDL and must not be blindly rerun.
- **Status at that time:** migration application was blocked pending a safe
  existing-account plan. This status was superseded by the production setup
  milestone below; the original `user_profiles` response body remains
  unavailable.

### Production profile backfill proposal

- Read-only inspection found one existing Auth account; email confirmation is
  complete, and user metadata contains `role=donor`. The UUID and personal
  fields were not recorded. Because Auth metadata is user-supplied, it is not
  treated as confirmed authorization or used to assign a role.
- Added `supabase/migrations/20261029000001_backfill_existing_auth_profiles.sql`
  as a proposed third migration (after auth/profile and donor migrations). It
  inserts `id` only for existing `auth.users` records and uses
  `ON CONFLICT (id) DO NOTHING`; the nullable role remains unset until the
  signed-in account holder chooses through onboarding and the
  `assign_initial_role` function. RLS and role protections are unchanged.
- This was a local proposal at that stage; it was later applied with explicit
  user authorization as recorded below.

### Initial production schema setup

- Applied `20261028000000_auth_profiles_onboarding`,
  `20261029000001_backfill_existing_auth_profiles`, and
  `20261029000000_donor_module` in that order using the Supabase MCP
  migration tool. Each call returned success; no migration was retried.
- Supabase migration history records versions `20261028191501`,
  `20261028191517`, and `20261028191623` for those migrations respectively.
- Read-only verification found all nine expected public tables with RLS
  enabled; 53 constraints, 19 indexes, 19 public policies, 18 functions, 12
  triggers, two views, four private storage buckets, and 12 storage policies.
  The table listing confirmed expected columns, primary keys, and foreign
  keys.
- The existing Auth account was not modified. The backfill produced one
  profile row with a null role; no role or user-provided metadata was used to
  assign it. Authenticated users cannot directly update role or profile
  completion fields, and anonymous users have no select grant on profiles.
- The pre-migration absence of `public.user_profiles` supports the original
  404's missing-table cause. The actual authenticated frontend request was
  not replayed; confirm it through the existing account without exposing
  tokens.
- No destructive statements were found in the SQL; DDL is non-idempotent and
  must not be rerun. No Auth user was created, deleted, or updated.

Phase 1 establishes a centralized token layer, responsive shared app/auth
shells, role-specific navigation configurations, accessible UI primitives,
and a development-only shared-component preview. Original visual assets and
font files were not recoverable as standalone files; temporary asset
approximations are documented in the design and asset inventories. Build,
type-check, and browser validation results are recorded with the Phase 1
milestone below after verification.

### Phase 1 milestone

- Implemented CSS design tokens, typography/global styles, responsive
  app/auth layouts, role-specific donor/NGO/volunteer navigation, shared
  buttons/forms/cards/status/avatar/alert/state/dialog components, plus shared
  food-listing and progress-timeline presentation.
- Added a temporary root component preview for the shared controls. It does
  not implement routes, persistence, authentication, dashboards, or business
  actions.
- Added Lucide React as one consistent icon family. Its icons and the generic
  sprout wordmark are documented approximations, not original PDF assets.
- Visually compared the desktop app shell and mobile/desktop auth layout to
  the inspected reference compositions. This is a qualitative comparison;
  no pixel-diff or claim of exact visual fidelity is made. Original artwork
  and font remain unavailable.
- Verified `npm run typecheck` and `npm run build`. Browser smoke checks
  verified the volunteer navigation drawer and Availability item, responsive
  width without horizontal overflow at 390px, confirmation-dialog keyboard
  dismissal, and the auth-layout preview. No lint or automated test runner is
  configured.
- **Phase 1 status:** shared design-system foundation implemented. Remaining
  visual limitation: replace documented placeholders only when approved
  source assets are supplied; revisit estimated tokens if the original design
  source becomes available. No complete workflow or role dashboard is in
  scope.

### Phase 2–3 implementation status

- Added Supabase Auth client/session handling, callback and password-reset
  flows, role-aware route guards, profile and role onboarding screens, and
  donor onboarding. The PDF uses six-digit email codes; implementation uses
  Supabase confirmation links/PKCE, a documented deviation awaiting product
  and email-configuration confirmation.
- Added donor dashboard, create/edit/list/detail donation screens, pickup
  request review/detail, donor handover, and impact reporting. Role navigation
  outside the donor scope remains routed to phase placeholders.
- Added typed Supabase data access and two dependent SQL migration drafts for
  profiles/onboarding and donor workflow. They have not been applied,
  PostgreSQL-validated, or tested against a live Supabase project. Local
  environment values and MCP metadata are not evidence of live app
  connectivity.
- Whole-donation requests were explicitly selected: partial requests are not
  supported. NGO receipt is only a database integration boundary; no NGO UI or
  volunteer delivery flow is in this phase.
- Impact includes only recipient-confirmed completed records; explicit
  `servings` are counted as meals and `kg` as weight. `portions` and `items`
  are not converted. People-fed and CO₂ metrics remain unavailable without
  verified inputs and an approved factor. Notifications are not implemented.
- Original standalone food artwork was not available; the donor dashboard's
  food-rescue banner uses a documented icon/gradient approximation rather
  than claiming an exact match.
- `npm run typecheck`, `npm run build`, and `npm test -- --reporter=verbose`
  passed; Vitest reports 4 files and 14 tests passed. Vite reports a 573 kB
  minified JavaScript chunk-size advisory. Browser smoke checks confirmed the
  sign-in and sign-up pages render and an unauthenticated `/donor` visit
  redirects to sign-in. These checks do not prove live Supabase behavior.
- Database/RLS/Storage tests and authenticated donor browser workflows remain
  blocked on an authorized development project. Visual comparison against
  donor pages 6–12 remains incomplete because protected donor routes cannot be
  viewed without a verified backend session.
- **Phase 2–3 status:** frontend implementation and draft schema are present;
  backend integration, migration validation/application, visual review of all
  donor pages, and live authenticated workflows remain incomplete. Do not
  advance to Phase 4 without an explicit request.

Acceptance criteria below are intended gates, not claims that the phases are
already complete.

## Phase 0: Foundation

- **Objectives:** establish repository guidance, development configuration,
  architecture, design inventory, and phase plan.
- **Dependencies:** repository access and approved PDF.
- **Deliverables:** project documentation, safe environment template, MCP
  template, minimal frontend bootstrap, ignore rules, and dependency/scripts
  configuration.
- **Likely areas:** root configuration, `.github/`, `.vscode/`, `docs/`,
  `src/`, `public/`, and `supabase/`.
- **Acceptance:** project builds and type-checks; configuration is valid;
  secrets are absent; all 53 PDF pages are inventoried and remaining blockers
  are explicit.
- **Verification:** `npm run typecheck`, `npm run build`; inspect JSON and
  repository status; inspect all 53 PDF pages.
- **Gate:** reference inventory and MCP/project access limitations are
  recorded before design-dependent work;
  environment/account actions requiring user authorization are approved.

## Phase 1: Design system

- **Objectives:** inspect/recover approved assets; establish verified
  typography/color tokens; build shared primitives and role layouts.
- **Dependencies:** Phase 0; actual PDF and available original assets.
- **Deliverables:** design inventory updates, tokens, buttons, fields, cards,
  badges, dialogs, navigation, and donor/NGO/volunteer layout primitives.
- **Likely areas:** `src/styles.css`, component/design-system directories,
  `public/images/`, and design documentation.
- **Acceptance:** tokens are sourced or explicitly estimated; reusable
  components match the inspected reference; screenshot comparisons record and
  resolve material visual gaps.
- **Verification:** typecheck/build, component tests when configured,
  accessibility checks, and reference-page screenshot comparisons.
- **Gate:** no unresolved foundational design assumption is silently treated
  as fact; user approves any material design approximation.

## Phase 2: Authentication and onboarding

- **Objectives:** sign-in, registration/role selection, email verification,
  profile completion, role onboarding, and protected routes.
- **Dependencies:** Phase 1; Supabase development project and authentication
  settings; approved role policy.
- **Deliverables:** session handling, onboarding screens, role access
  boundaries, and role-aware dashboard routing.
- **Likely areas:** auth pages/services, route/layout code, Supabase client,
  configuration, and tests.
- **Acceptance:** auth flows work against the approved development project;
  role choice alone grants no protected access; errors and loading states are
  handled.
- **Verification:** typecheck/build, auth-flow tests, and positive/negative
  access checks.
- **Gate:** auth providers, role assignment authority, and authorization rules
  are approved.

## Phase 3: Donor functionality

- **Objectives:** dashboard, create/edit donations, lists/filters, pickup
  request management, handover confirmation, and impact reporting.
- **Dependencies:** Phases 1–2; reviewed donation/request model and RLS.
- **Deliverables:** donor workflows and their guarded data operations.
- **Likely areas:** donor pages/components, donation/request domain/data
  modules, Storage policy, and tests.
- **Acceptance:** donor operations are limited to authorized records; listing
  lifecycle and validation are explicit; impact metrics are defined.
- **Verification:** unit/integration/RLS tests as configured, build, and visual
  comparison.
- **Gate:** donation rules, food safety information, request decisions, and
  impact metric definitions are approved.

## Phase 4: NGO functionality

- **Objectives:** dashboard, available donations, details, pickup requests,
  request management, delivery tracking, receipt confirmation, and organization
  profile.
- **Dependencies:** Phases 1–3; reviewed organization and workflow policies.
- **Deliverables:** NGO screens and access-controlled request/receipt flows.
- **Likely areas:** NGO pages, request/delivery data logic, verification and
  Storage policy, and tests.
- **Acceptance:** NGOs can enter the dashboard after required registration
  details; data actions remain limited by their existing authorization
  policies, and request/receipt transitions are auditable.
- **Verification:** build, visual comparison, integration and denied-access
  tests.
- **Gate:** organization membership/verification, request conflict behavior,
  and receipt correction rules are approved.

### Phase 4 implementation status

- Added NGO routes for the dashboard, available donations and details, pickup
  request creation/submission, request tracking/details, delivery tracking and
  details, receipt confirmation/success, impact, organization profile/settings,
  messages, and notifications. NGO registration now has organization and
  contact steps and routes directly to the dashboard after saving.
- NGO data access uses the deployed `ngo_profiles`, `donations`,
  `pickup_requests`, `pickup_request_status_history`, and `donation_handovers`
  tables, private `ngo-verification` Storage, and the existing
  `confirm_ngo_receipt` RPC. Queries request only fields needed by the screen;
  donor names, addresses, contact fields, and evidence paths are not fetched
  for pre-approval views.
- The initial production inspection found that NGOs could read their own
  requests and insert a full-quantity request only when verified; the later
  migration below removes that verification gate.
  The only `donations` SELECT policy is donor-owned; there is no NGO SELECT
  policy for available listings. RLS therefore hides donation rows from NGOs,
  so discovery, details, and request creation could not initially be
  completed through the live project. After approval, migration
  `ngo_available_donations_rpc` added
  `public.list_available_donations(uuid)`, a restricted `SECURITY DEFINER`
  RPC that initially required a verified NGO and returns only the fields used
  for discovery (no pickup address, instructions, or donor identity). After
  production logs confirmed an authenticated caller was rejected by the
  function's verification check (`42501`), approved migration
  `allow_pending_ngo_listing_browse` changed that check to require an
  authenticated NGO role but not verification. The RPC returns only unexpired
  `available` rows; request submission was subsequently updated to allow NGO
  profiles without requiring verification. The frontend uses the RPC and
  provides manual refresh controls. Authenticated
  execution remains granted; anonymous execution remains denied.
  Production log review confirmed the earlier 403s occurred before the new
  migration was applied. A read-only smoke test under the authenticated
  database role with pending-NGO claims returned one eligible listing and zero
  ineligible rows. A separate donor-scoped RLS smoke test returned zero rows
  belonging to other donors. The shared browser was not authenticated as an
  NGO, so a real browser RPC/session journey remains unverified.
- The database has no volunteer assignment/delivery table, NGO messaging or
  notification store, NGO impact view, geographic fields, or NGO notification
  preferences. Those routes disclose the missing capability instead of
  displaying fabricated data. Delivery lists use pickup-request states only.
  Receipt confirmation invokes the existing full-quantity RPC; partial
  receipts, quality/evidence uploads, volunteer contact, and pickup location
  disclosure are not implemented because no supported secure interface exists.
- Visuals reuse the app shell and design tokens, with responsive listing,
  request, status, receipt, profile, and verification patterns. Donation
  photos remain placeholders because NGO access to the private donor-image
  bucket is not authorized. The dashboard cannot show real nearby locations,
  and profile/settings and success screens omit features the backend cannot
  persist or authorize. The reference's volunteer coordination, charts, and
  notification/message content are therefore unresolved visual/functionality
  differences, not completed screens.
- Added NGO request-filter/metrics/validation tests, available-list screen
  tests, and verified/pending route-guard tests. `npm run typecheck`,
  `npm test -- --reporter=verbose`, and `npm run build` passed (9 test files,
  41 tests). Vite reports a 612.8 kB minified JavaScript chunk-size advisory.
- **Phase 4 status: incomplete.** Core UI routes and existing authorized
  request/receipt boundaries are wired, but backend gaps prevent several
  reference workflows. Do not describe this phase as end-to-end complete until
  those capabilities are implemented and tested.

### NGO registration simplification

- NGO registration now requires only organization and contact details. It
  saves to the existing `ngo_profiles` row, verifies that each update returned
  a row, skips the duplicate shared-profile prompt when the signup already
  supplied account details, and submits all required fields together again on
  final save. Persisted required fields are verified before routing directly to
  `/ngo`; failures name the missing fields. No document upload or
  verification-pending screen is part of registration.
- Organization/contact submissions now read values from the actual form
  submission, including the organization-type select, rather than relying
  solely on React draft state. The live schema check confirmed
  `organization_type` is nullable text with no constraint or NGO trigger
  rewriting it; the self-update policy applies to the caller's own profile.
  Added regression coverage for persisting the selected type even when the
  rendered control differs from stale draft state. The affected confirmed
  account's request payload was not available in the shared browser, so the
  exact original client/server mismatch could not be independently captured.
- The live schema inspection confirmed that organization/contact columns are
  nullable and the NGO self-update RLS policy allows those fields without
  document paths. The legacy `onboarding_complete` trigger still requires two
  document paths; auth instead derives NGO readiness from the required
  organization/contact fields. Role assignment remains in the existing
  auth-trigger/`assign_initial_role` flow. No schema, policy, bucket, or
  production data was changed.
- No live schema/RLS blocker prevents saving required NGO fields to the
  existing profile row. The separately approved donation-list RPC allows NGO
  role accounts to discover available, unexpired listings;
  the later approved `ngo_verification_optional` migration removed
  verification-status gates from browsing, requesting, and receipt
  confirmation. Direct dashboard access, browsing, and requests require an NGO
  role and profile, but not verification approval.
- Automated tests cover the two-step registration, no Storage calls, update
  errors/zero-row retries, NGO role metadata, direct dashboard navigation and
  route access after a simulated refresh. Live authenticated signup and profile
  writes remain unverified. The approved inventory's document-verification
  and pending screens are intentionally superseded by this requested two-step
  flow; visual comparison was not completed because the browser PDF viewer
  did not render the page. The repository has no configured lint script.

### NGO verification is optional

- Production inspection confirmed that the NGO request form's
  `.insert(...).select("id").single()` is a single INSERT returning its ID.
  The deployed request function, RLS policy, grants, table constraints,
  active-request index, and trigger were inspected before changing access.
- The previous request failure was SQLSTATE `P0001`: the
  `can_submit_pickup_request` function required
  `verification_status = 'verified'`; the NGO profile was `pending`. The
  request insert policy delegates to that function.
- After explicit approval, migration
  `ngo_verification_optional` replaced request eligibility, donation-listing,
  trigger, and receipt-confirmation function bodies. These now require an
  authenticated NGO role and an existing NGO profile where applicable, but
  do not require verification. Existing availability, expiry, full-quantity,
  request-ownership, donor-side, handover, and duplicate protections remain.
  RLS policies and grants were not changed.
- The request UI no longer reads or gates on verification status. It preserves
  the existing active-request precheck and database-enforced duplicate
  handling. Donor listing copy no longer implies NGO approval is required.
- A read-only production smoke test under an existing NGO claim returned nine
  available, unexpired listings and marked all nine request-eligible. A
  separate donor-role claim was rejected by the request eligibility function.
  These tested function behavior without inserting or changing production
  requests.
- Automated coverage checks requests with verification status ignored,
  duplicate requests, and database rejection messaging. The browser has no
  authenticated NGO test session, so signup/login and a real persisted
  production request remain unverified. No onboarding document requirement
  was added.

### Missing Auth application-profile recovery

- Read-only live diagnostics found an Auth account without a corresponding
  `user_profiles` row and no NGO profile row. The existing
  `assign_initial_role` RPC only updated an existing row whose role was null,
  so it could not recover this account; direct client inserts are correctly
  blocked by grants and RLS.
- The client now treats a missing profile row as an unassigned account and
  routes it to role selection instead of a profile-load error. Signup metadata
  only preselects the role; the user confirms it and the client calls the
  trusted RPC. Database errors remain visible, and the dashboard is not
  entered until profile state can be loaded.
- Added `supabase/migrations/20261029000002_repair_initial_role_profiles.sql`
  as a **proposed, unapplied migration**. It makes the self-scoped RPC
  idempotently create the caller's missing base and role-specific profile,
  preserve an already assigned matching role, and reject a conflicting role.
  The application cannot complete profile recovery until this function
  definition is reviewed and applied to the intended Supabase project.
- Auth/profile recovery tests cover an NGO orphan, successful RPC recovery,
  and visible RPC failure without a redirect loop. No migration or live data
  was changed, and a real signup/confirmation with database verification
  remains blocked on approval to apply the migration and access to a test
  account.

## Phase 5: Volunteer functionality

- **Objectives:** dashboard, available tasks, acceptance, task list, pickup and
  delivery confirmation, availability, earnings, and impact.
- **Dependencies:** Phases 1–4; reviewed assignment and privacy rules.
- **Deliverables:** volunteer task lifecycle and own-profile reporting.
- **Likely areas:** volunteer pages, assignment/status logic, availability and
  earnings data modules, and tests.
- **Acceptance:** assignment and status transitions are trusted and validated;
  personal and financial data is restricted.
- **Verification:** typecheck/build, workflow and RLS tests, visual comparison.
- **Gate:** assignment, availability, reimbursement/payment, and failed-task
  behavior are approved.

### Phase 5 implementation status

- Applied the approved `volunteer_task_workflow` migration. It adds
  volunteer assignment and pickup/delivery timestamps to `pickup_requests`,
  plus volunteer-only RPCs for task listing, first-volunteer claim, pickup
  confirmation, and delivery confirmation. Functions use an empty
  `search_path`, validate the authenticated volunteer role and completed
  volunteer profile, and preserve existing RLS boundaries.
- Added volunteer dashboard, available-task, my-task, task-detail, claim,
  pickup, and delivery routes. Unassigned tasks expose only high-level food
  details; donor/NGO locations and contact details are returned by the RPC
  only after assignment. NGO delivery tracking now shows assignment and
  volunteer pickup/delivery progress.
- Volunteer onboarding remains the existing shared name/phone profile flow;
  no verification or document upload requirement was introduced. Earnings,
  impact, messaging, notifications, profile, availability, and settings
  remain explicit unavailable states because no approved backend capability
  exists for them.
- Added volunteer data-helper regression tests. `npm run typecheck`,
  `npm test -- --runInBand`, `npm run build`, and `git diff --check` pass.
  Authenticated browser testing of concurrent claims and the complete
  donor-confirmation-to-NGO-receipt journey remains pending.

### NGO delivery verification milestone

- Applied `ngo_delivery_verification`, adding server-enforced
  `pending`/`verified`/`issue_reported` delivery review state, verifier
  identity/time, and a bounded issue reason to `pickup_requests`.
- `confirm_ngo_receipt` now requires a pending review and records the
  verification atomically. `report_ngo_delivery_issue` is restricted to the
  owning NGO, requires a reason, prevents repeated review, and preserves the
  delivery for follow-up instead of falsely marking it completed.
- Added the NGO Delivery Verification navigation section, filters, receipt
  confirmation guard, issue-report form, and persisted review indicators.
  Donor and volunteer private contact details remain unavailable in the NGO
  view because no approved cross-role contact projection exists.

### Volunteer delivery details milestone

- Reworked `/volunteer/tasks/:requestId` into a responsive two-column details
  view with food facts, donor pickup, NGO drop-off, directions links, truthful
  coordinate/map fallbacks, current status, actions, and a persisted-status
  progress timeline.
- The existing `list_volunteer_tasks()` RPC already returned the food,
  contact, address, and timestamp fields; the prior page rendered them inside
  one dense card and used an isolated sidebar, which caused the apparent empty
  details experience. No backend schema or status transition was changed.
- Pickup/drop OTP infrastructure and coordinate persistence remain backend
  dependencies. The page does not fabricate coordinates or claim OTP
  verification when those capabilities are absent.

### AI surplus workflow audit and ML foundation

- Audited the current schema and repository: no historical sales/leftover
  dataset, forecast/demand/allocation/notification tables, map coordinates,
  delivery OTP backend, or Python service exists.
- Added a standalone Random Forest surplus-prediction service under
  `ml_service/` with strict validation, persisted model loading, uncertainty
  bounds, time-ordered evaluation, and a clearly labelled synthetic
  development dataset.
- Development-only evaluation produced MAE 11.525 and RMSE 16.516 versus a
  simple baseline MAE of 35.244; these figures are not production accuracy.
- Added and applied an additive migration for forecast persistence, NGO
  demand, explainable recommendations, quantity reservations, notification
  events, RLS, and idempotent reservation/release RPCs. Added a matching
  engine and `POST /match` service endpoint.
- Frontend persistence is available through the new gateway source, pending
  deployment; real historical data is still required for production model
  accuracy.

### Donor AI prediction UI milestone

- Added the donor-only `/donor/forecast` route and a visible dashboard card.
  The form collects category, restaurant type, planned quantity, expected
  customers, historical sales/leftovers, and future ready time.
- Added the `predict-surplus` Edge Function as the authenticated gateway to
  FastAPI. It verifies the donor role, calls the existing prediction endpoint,
  and inserts the estimate into `surplus_forecasts` through RLS.
- The result is explicitly labelled as an estimate, includes uncertainty,
  unit, ready time, and model version, and does not publish a donation.
  Donors can continue to the existing confirmed donation form for review.
- Previous donor-owned forecasts, loading/error states, and a no-history-input
  state are shown. The feature requires deployment of the Edge Function and
  `ML_SERVICE_URL`; production accuracy remains limited by synthetic training
  data until real historical records are supplied.

## Phase 6: Shared functionality

- **Objectives:** messaging, notifications, shared profile patterns, settings,
  account management, and shared navigation.
- **Dependencies:** relevant role workflows and approved privacy rules.
- **Deliverables:** shared role-appropriate communication and account
  interactions.
- **Likely areas:** shared components, message/notification data/services,
  account pages, and tests.
- **Acceptance:** access is limited to intended recipients/participants;
  settings and account actions have explicit effects.
- **Verification:** component/access tests, build, accessibility and visual
  checks; realtime checks if realtime is adopted.
- **Gate:** retention, notification channels/preferences, account deletion,
  and message-access rules are approved.

## Phase 7: End-to-end integration

- **Objectives:** integrate donation-to-delivery workflows, permissions,
  transitions, notifications, uploads, appropriate realtime updates, and
  consistent impact calculations.
- **Dependencies:** Phases 2–6 and approved schemas/policies.
- **Deliverables:** cohesive cross-role user journeys and operational
  integration.
- **Likely areas:** domain services, Supabase functions/policies, storage,
  realtime subscriptions, and end-to-end tests.
- **Acceptance:** complete workflows work across roles; concurrency, errors,
  retries, and denied access are handled; totals agree across relevant views.
- **Verification:** integration, RLS, and Playwright journey tests; build;
  targeted realtime/storage checks.
- **Gate:** unresolved lifecycle edge cases are decided and testable.

## Phase 8: Quality assurance and release

- **Objectives:** test, harden, document, and prepare approved deployment.
- **Dependencies:** integrated workflows and approved release environment.
- **Deliverables:** unit/component/integration/E2E coverage, visual regression,
  responsive and accessibility checks, release configuration, and operational
  documentation.
- **Likely areas:** tests, CI configuration, deployment configuration,
  documentation, and security policies.
- **Acceptance:** required checks pass; release secrets are managed securely;
  role/RLS and visual defects meet agreed thresholds; rollback/monitoring
  expectations are documented.
- **Verification:** repository CI checks, browser tests, RLS checks, visual
  review, accessibility review, and explicit release checklist.
- **Gate:** production access and deployment receive required user approval;
  no production changes are performed without authorization.

These phases are sequential dependencies, not separate repositories or
applications. Work in a phase may be split into small, reviewable increments
without moving the overall application to a new codebase.

## NGO donation image workflow (prepared; database approval pending)

- Inspected the NGO available-donation design on PDF page 23 and confirmed
  that food photographs belong in the compact donation rows. The live
  `donations.photo_path` field and private `donation-images` bucket already
  exist. The 10 demo rows currently have no image references.
- Shared private signed-URL loading is now used by the donor and NGO screens.
  NGO listing cards, donation details, and request summaries display signed
  images with the existing labelled fallback if an image is missing or fails
  to load.
- Added an unapplied migration proposal to return `photo_path` from
  `list_available_donations` and allow only authenticated NGO-role users to
  read image objects linked to available, unexpired donations. The RPC return
  type requires a drop/recreate; read-only preflight found no database
  dependencies on the existing RPC, and the migration preserves its
  authentication checks and execute grants. The policy does not make the
  bucket public or relax donor upload rules.
- No migration or Storage policy has been applied. No food-image generator is
  available in this session, and no authenticated donor session is available
  to upload through the existing donor UI. Consequently, no image files were
  generated, uploaded, or linked. The cancelled demo row is additionally not
  editable through the existing donor workflow; it remains outside the
  authorized upload path.
- **Status:** UI implementation is in place; backend access awaits explicit
  approval, and image assets/uploads remain blocked pending suitable licensed
  images and an authenticated donor session.
