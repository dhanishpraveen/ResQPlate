# ResQPlate architecture

## Status and scope

This is a proposed architecture for the repository's approved React,
TypeScript, Vite, Tailwind CSS, and Supabase stack. It describes candidate
boundaries and requirements inferred from the project brief and the visually
inspected reference; it is not a verified schema or a claim that a Supabase
project exists. Screen-specific ambiguities are documented in
`docs/design/design-inventory.md`. No SQL migrations or seed data are created
in the foundation phase.

## System overview

- **Web client:** React and TypeScript, built and served by Vite. Tailwind CSS
  is integrated with shared CSS design tokens documented in
  `docs/design/design-system.md`.
- **Authentication:** Supabase Auth manages identity and sessions. The client
  may use public project URL and publishable key, but neither establishes
  authorization.
- **Application data:** PostgreSQL stores role-related records, donations,
  requests, deliveries, and other data after a reviewed schema is designed.
- **Authorization:** PostgreSQL RLS should enforce record-level access. Trusted
  server-side functions/checks should handle operations that cannot safely be
  authorized by a client.
- **Files:** Supabase Storage may hold donation images and organization
  verification documents. Buckets and access policies must be explicitly
  designed.
- **Realtime:** Supabase Realtime may be appropriate for messages, notifications,
  and delivery status updates where timely updates matter. Use it only after
  access policies and product requirements are clear; it is not assumed to be
  necessary for all data.

## Application boundaries

Suggested boundaries, to be adapted to implementation patterns as the
application grows:

- **Presentation components:** accessible, reusable visual components driven
  by established design tokens; no direct persistence or authorization logic.
- **Role-specific pages and layouts:** donor, NGO, and volunteer navigation,
  pages, and interactions. Pages should correspond to inspected reference
  screens.
- **Shared components:** authentication, message/notification patterns,
  dialogs, form controls, and other elements shared only where the reference
  supports shared behavior.
- **Authentication and authorization:** session lifecycle, route protection,
  trusted role data, and clear separation between authentication and permission
  checks.
- **Business logic:** donation, request, assignment, pickup, delivery, receipt,
  availability, and impact rules; keep authoritative transitions out of
  untrusted UI state.
- **Data access:** typed interfaces around Supabase queries and mutations;
  handle errors explicitly rather than hiding failures behind defaults.
- **File uploads:** validate size/type and ownership, use private storage where
  appropriate, and issue only suitably scoped access.
- **Notifications and messaging:** access-controlled conversations/messages
  and notification generation/delivery, with Realtime as an optional transport.
- **Reporting and impact:** define metric meaning and aggregation consistently
  before presenting totals; avoid trusting client-provided totals.

## User roles and access

The role descriptions below are expected capabilities from the brief, not
confirmed final policy. All access must be enforced by trusted controls.

| Role | Expected access (subject to confirmation) | Key boundary |
| --- | --- | --- |
| Donor | Manage its own organization profile and donations; review/respond to requests for its donations; confirm handover; view its impact. | Must not read or alter unrelated donor records or private NGO/volunteer details. |
| NGO | Manage its own organization profile; discover eligible available donations; create and manage its requests; view its deliveries; confirm receipt; view its impact. | Verification and membership rules must be defined before access is granted. |
| Volunteer | Manage own profile/availability; discover eligible delivery tasks; accept assigned work; update collection/delivery progress; view own earnings and impact. | Must not access unrelated tasks, participant private data, or financial information. |
| Administrator, if introduced | May require verification and support functions. | Not established by the brief; do not add without explicit requirements and audited least-privilege policy. |

Client-side role selection is for onboarding/UI only and cannot authorize
database, storage, or server operations. Role assignment and organization
verification need trusted workflows.

## Conceptual data model

These are candidate entities, not final tables or mandatory fields. Determine
relationships, retention, validation, and policies before migrations:

| Candidate entity | Purpose and likely relationships | Integrity/access considerations |
| --- | --- | --- |
| User profile | Application profile associated with an authenticated user. | Separate trusted role assignment from editable profile data; user controls only permitted own data. |
| Donor/restaurant profile | Business identity and contact context for donations. | Organization ownership/membership and private contact data require clear boundaries. |
| NGO profile | Organization identity, service area, and verification state. | Verification evidence is private; approval authority and membership are unresolved. |
| Volunteer profile | Volunteer details and operational preferences. | Limit personal data visibility and restrict edits to the owner or approved process. |
| Donation | Food listing associated with a donor; may relate to pickup requests and deliveries. | Define availability, quantity, eligibility, safe-food rules, and immutable history as needed. |
| Pickup request | NGO request for a donation; likely linked to donation and NGO. | Prevent unauthorized requests and conflicting acceptance; concurrency rules need design. |
| Delivery assignment | Work assigned/accepted by a volunteer for a donation/request. | Define assignment authority, uniqueness, cancellation, and role access. |
| Delivery status history | Auditable record of lifecycle events. | Prefer trusted append-only events and validate allowed transitions. |
| Receipt confirmation | NGO's confirmation linked to a completed delivery. | Restrict confirmation to authorized NGO participant; decide correction/dispute flow. |
| Conversation/message | Communication among authorized participants, optionally linked to a request/delivery. | Enforce participant membership on reads and writes; handle retention and moderation requirements. |
| Notification | A user's notification of relevant events. | Enforce recipient ownership and avoid leaking details in payloads. |
| Uploaded document/image | Donation imagery or NGO verification document in Storage. | Validate content and ownership; private verification files need restricted access. |
| Volunteer availability | Volunteer availability windows/preferences. | Only owner or approved scheduling processes may change it; define time-zone semantics. |
| Earnings/reimbursements | Financial or reimbursement records associated with volunteer and possibly delivery. | Define whether the platform pays volunteers; restrict access and audit changes. |
| Impact metrics | Aggregates for donor, NGO, volunteer, or platform reporting. | Define authoritative calculation, units, corrections, and privacy before showing totals. |

The reference and brief do not establish mandatory columns, cardinalities,
whether multiple NGOs can request one donation, delivery assignment policy,
payment semantics, or a full audit/retention policy.

## Donation and delivery lifecycle

An expected, provisional flow is:

1. Donor creates a donation listing.
2. NGO discovers the listing and submits a pickup request.
3. Donor approves or declines a request; conflict handling for multiple
   requests is to be decided.
4. A delivery task is created/available and a volunteer accepts or is assigned.
5. Volunteer confirms food collection from the donor.
6. Volunteer records delivery to the NGO.
7. An authorized NGO participant confirms food receipt.
8. The donation/request/delivery becomes complete and eligible impact data can
   be calculated.

Potential status concepts include draft/available, requested, approved,
declined, assigned, collected, delivered, received, cancelled, and expired.
These are examples, not an approved enum or complete transition map. Define
valid transitions, race handling, cancellation, failed pickup, partial
fulfillment, disputes, and correction rules before implementation.

Candidate notification triggers include request submission and decision,
assignment/acceptance, collection, delivery, receipt confirmation, and
cancellation or material status changes. Confirm recipients, channels,
preferences, retries, and privacy before implementing.

## Security model

- **Authentication:** use Supabase Auth and validate sessions in the
  appropriate context. Authentication proves identity, not access to a
  particular record.
- **Role assignment:** store and mutate roles through a trusted workflow.
  Never trust a client-submitted role as authorization.
- **Organization verification:** keep status/evidence controlled by a trusted
  review process; do not expose uploaded verification documents publicly.
- **RLS:** apply least-privilege table policies based on authenticated identity,
  trusted role/membership, and record relationships. Test both authorized and
  denied cases.
- **Storage:** use private buckets for non-public files and policies that
  validate user/organization ownership. Validate upload type and size and
  avoid exposing long-lived public URLs for private content.
- **Messages:** restrict reads/writes to conversation participants and validate
  membership on every operation.
- **Ownership checks:** ensure donors, NGOs, and volunteers can change only
  records they own or are explicitly authorized to manage.
- **Server-side validation:** validate lifecycle transitions, privileged
  operations, uploads, and derived values in trusted code/database constraints
  as appropriate.
- **Secrets:** only public URL/publishable key belong in frontend configuration.
  Keep service-role keys, database passwords, and private provider tokens
  server-side and out of Git.
- **Data minimization:** do not expose private addresses, contact data,
  verification files, or financial information beyond the specific workflow
  need.

## Asset management

Preserve the approved PDF at `docs/design/ResQPlate_UI.pdf`.
Organize recovered, licensed application assets under `public/images/` or a
source asset directory appropriate to their use. Track source page, origin,
license/permission, and extraction quality. Use a font asset only when its
identity and usage rights are established. If the PDF embeds an asset that
cannot be recovered cleanly, document the gap and a defensible fallback; do
not claim the substitute is identical.

## Quality assurance

- Run the configured TypeScript check and production build for frontend
  changes.
- Add unit/component tests for domain rules and accessible interactions when
  those features are implemented.
- Add integration tests for data access and RLS; include denied-access cases.
- Add Playwright end-to-end flows when corresponding workflows exist.
- Compare screenshots at matching viewport sizes against the corresponding
  PDF pages. Record page, viewport, differences, and unresolved approximations.
- Check responsive behavior, keyboard navigation, semantics, focus, contrast,
  and error/loading/empty states.
- Do not claim visual fidelity or backend integration without direct
  comparison/connection evidence.
