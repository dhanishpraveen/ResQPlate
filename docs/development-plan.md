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

No Supabase project was connected, no account-level setup or MCP
authentication was performed, no database migrations or seed records exist,
and no product workflows or role dashboards have been implemented. These are
not claimed as completed work.

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
