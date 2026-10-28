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

No live Supabase application connection or database access was verified.
Authentication and donor workflows have since been implemented in the
frontend, and two version-controlled migration drafts have been added. They
remain unapplied and unverified against PostgreSQL; no seed data exists.

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
  profile completion, role onboarding, protected routes, and NGO verification
  workflow foundations.
- **Dependencies:** Phase 1; Supabase development project and authentication
  settings; approved role policy.
- **Deliverables:** session handling, onboarding screens, route access
  boundaries, and verification-pending UX.
- **Likely areas:** auth pages/services, route/layout code, Supabase client,
  configuration, and tests.
- **Acceptance:** auth flows work against the approved development project;
  role choice alone grants no protected access; errors and loading states are
  handled.
- **Verification:** typecheck/build, auth-flow tests, and positive/negative
  access checks.
- **Gate:** auth providers, role assignment authority, and verification
  workflow are approved.

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
  request management, delivery tracking, receipt confirmation, organization
  profile, and verification.
- **Dependencies:** Phases 1–3; reviewed organization and workflow policies.
- **Deliverables:** NGO screens and access-controlled request/receipt flows.
- **Likely areas:** NGO pages, request/delivery data logic, verification and
  Storage policy, and tests.
- **Acceptance:** only eligible verified/authorized organizations can perform
  approved actions; request and receipt transitions are auditable.
- **Verification:** build, visual comparison, integration and denied-access
  tests.
- **Gate:** organization membership/verification, request conflict behavior,
  and receipt correction rules are approved.

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
