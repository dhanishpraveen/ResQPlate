# ResQPlate project instructions

## Project identity

ResQPlate connects food businesses that have safe surplus food with NGOs that
can redistribute it and volunteers who can transport it. Donors publish and
manage donations; NGOs discover food, request pickups, and confirm receipt;
volunteers accept delivery tasks and record collection and delivery progress.
The approved visual reference is `docs/design/ResQPlate_UI.pdf`.

## Source of truth

- Treat the approved PDF as the primary visual reference. Inspect the relevant
  pages before implementing any screen.
- Preserve the reference's layout, typography, colors, illustrations,
  photographs, icons, spacing, sizing, and navigation. Do not substitute a
  generic dashboard or unrelated design.
- Prefer original image assets already in the repository. If an image embedded
  in the PDF cannot be recovered cleanly, identify it and document the closest
  defensible replacement strategy.
- Do not claim an unavailable font or image is an exact match. Record
  approximations and unresolved visual differences.
- The PDF has been visually inventoried page by page in
  `docs/design/design-inventory.md`. Reinspect the relevant pages when making
  screen changes; resolve its documented ambiguities instead of guessing.

## Architecture

- Follow the repository's established architecture and use TypeScript with
  strict type checking.
- Keep presentation, role-specific pages/layouts, shared components,
  authentication/authorization, business logic, and data access appropriately
  separated.
- Share components where the reference indicates shared behavior; avoid
  duplicated UI and unnecessary abstractions.
- Keep donor, NGO, and volunteer navigation and permissions distinct.
- Centralize design tokens instead of scattering hardcoded style values.

## Backend and security

- Use Supabase for the approved backend responsibilities and Supabase Auth for
  authentication.
- Enforce authorization with PostgreSQL Row Level Security (RLS) and trusted
  server-side checks where required. A role selected in the browser is not
  proof of authorization.
- Keep privileged credentials server-side. Never expose a service-role key,
  database password, or other private credential in frontend code or a
  `VITE_` variable.
- Validate user input and uploads. Define explicit access boundaries for
  donors, NGOs, volunteers, and any administrator role introduced later.
- Protect private donor, NGO, and volunteer information. Use version-controlled
  database migrations.
- Do not invent schema fields or permissions without documenting the
  requirement and its assumptions.

## Development workflow

- Work only on the phase requested by the user. Read these instructions and
  inspect relevant existing files before editing.
- Plan briefly, reuse working code, implement only the requested scope, and do
  not silently expand it into later phases.
- Run relevant linting, type checks, tests, and builds that are configured and
  applicable. Fix regressions introduced by the change.
- Record incomplete work and known issues. Never claim an unexecuted check or
  unverified backend connection succeeded.
- Update `docs/development-plan.md` after meaningful implementation
  milestones.

## UI implementation workflow

For each screen:

1. Identify its reference PDF page and inspect that page visually.
2. Record the important layout, typography, color, image, and component
   details.
3. Reuse established design tokens and components.
4. Implement the functional controls, navigation, loading states, and error
   states required by the requested phase.
5. Compare the implementation with the reference and correct visual
   differences before declaring completion.

If the PDF becomes unavailable, stop short of claiming visual fidelity.
Record the blocker and request the actual reference instead of guessing.

## Completion criteria

A phase is complete only when its requested work is implemented, verified,
documented, and consistent with the reference to the extent technically
possible. The user will identify each next phase. Before starting it, reread
these permanent instructions, inspect the applicable reference pages and
existing code, implement only that phase, run relevant checks, and document
what is complete and what remains. Do not move into a later phase without
being asked.
