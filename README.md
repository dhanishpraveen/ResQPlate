# ResQPlate

ResQPlate is a food rescue and redistribution platform intended to connect
restaurants and other food businesses with NGOs and volunteers so safe surplus
food can reach people who need it.

## Roles and workflow

- **Donor:** lists surplus food, manages donations, responds to pickup requests,
  and confirms handover.
- **NGO:** discovers available food, requests pickups, coordinates delivery,
  manages its organization profile, and confirms receipt.
- **Volunteer:** accepts delivery tasks, collects food from a donor, transports
  it to an NGO, updates delivery progress, and manages availability and
  earnings.

The expected end-to-end flow is donation listing → NGO pickup request → donor
decision → delivery assignment → volunteer collection → transport → NGO
receipt confirmation. The exact states and assignment rules remain subject to
the approved designs and later product decisions.

## Technology

- React and TypeScript
- Vite
- Tailwind CSS v4 (Vite plugin)
- Lucide React for a consistent icon family
- Supabase Auth, PostgreSQL, and Storage integration through the public
  authenticated client, with database authorization enforced by RLS
- Existing Random Forest surplus forecasts plus an authenticated Supabase Edge
  Function for deterministic recommendations and optional Hugging Face
  Inference Providers explanations
- VS Code Copilot Agent mode; optional Supabase MCP configuration
- Git and GitHub

The application currently contains routed authentication/onboarding and
donor workflow screens. Live Supabase connectivity and database behavior are
not verified; the versioned schema/RLS migrations remain unapplied drafts.
Selected unit/component tests are configured. No lint command is configured.

## Prerequisites

- Node.js 22.12+ (the installed Vite toolchain requires a compatible modern
  Node.js release; Node.js 22 LTS is recommended)
- npm 10+
- Git
- VS Code for the repository MCP configuration
- A Supabase development project when backend work begins

Versions of the frontend dependencies are declared in `package.json`.

## Local setup

From the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

In Command Prompt, the environment-template copy command is:

```bat
copy .env.example .env.local
```

The Vite development server binds to `127.0.0.1` by default. Configure
`.env.local` before adding or running code that connects to Supabase. Do not
commit local environment files.

## Supabase setup

Use an authorized **development-only** Supabase project. In the Supabase
dashboard, use the project's API settings to obtain its project URL and
publishable client key, then set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Values are intentionally
blank in `.env.example`; no usable project credentials or live database
access were available to validate this implementation.

Only public client values belong in `VITE_` variables. Never put a service-role
key, database password, or other privileged secret in the frontend or a
`VITE_` variable. Private credentials belong only in an appropriately secured
server-side environment. The authentication/onboarding and donor workflow
migrations in `supabase/migrations/` are un-applied drafts; they require
development-database review and testing before use. No seed records exist.

## MCP setup

`.vscode/mcp.json` contains an HTTP configuration for the official Supabase
MCP endpoint, scoped to a project and read-only. Replace
`YOUR_SUPABASE_PROJECT_REF` with the approved development project's actual
reference; do not use a production reference without explicit approval. VS
Code must authenticate the MCP session using the user's Supabase account.
Configuration alone does not establish a connection. See
[docs/setup.md](docs/setup.md) for authentication, connection verification,
and the controlled path to enabling writes for approved migrations.

## Available commands

These are the scripts currently defined in `package.json`:

| Command             | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Start the local Vite development server.                     |
| `npm run typecheck` | Type-check the application TypeScript configuration.         |
| `npm run build`     | Type-check project references and create a production build. |
| `npm test`          | Run the configured Vitest unit/component tests.              |
| `npm run preview`   | Preview the production build locally.                        |

No lint or Playwright end-to-end command is configured. Current tests cover
selected auth route/validation and donor metric/input-validation logic; they
do not establish database, RLS, Storage, or live-auth behavior.

## Repository structure

```text
.github/copilot-instructions.md  Permanent implementation and design rules
.vscode/mcp.json                Workspace Supabase MCP configuration
docs/
  architecture.md               Current architecture and security model
  ai-intelligence.md             Hybrid ML/LLM architecture and provider setup
  authentication.md             Auth, donor lifecycle, impact rules and blockers
  development-plan.md           Ordered implementation phases
  design/
    design-inventory.md         Visually reviewed 53-page screen inventory
    design-system.md            Shared tokens and component conventions
    asset-inventory.md          Original assets and documented placeholders
    ResQPlate_UI.pdf            Approved 53-page visual reference
  setup.md                      Local development and account setup
public/images/                  Reserved for original/approved image assets
src/
  App.tsx                       Routed auth and donor application
  main.tsx                      React entry
  auth/                         Session, access guards and onboarding
  components/                   Shared UI components, layouts, navigation
  donor/                        Donor pages, data access and impact rules
  lib/                          Supabase client and database types
  styles/                       Central design tokens and stylesheets
  test/                         Shared test setup
supabase/
  functions/                     Authenticated AI and workflow Edge Functions
  migrations/                   Draft versioned database migrations
.env.example                     Public client-variable template
index.html                       Vite HTML entry
package.json                     Dependencies and available commands
```

## Design reference and implementation strategy

The approved visual reference is
`docs/design/ResQPlate_UI.pdf`. All 53 pages have been visually inspected and
inventoried in `docs/design/design-inventory.md`. The designs show desktop
compositions only; the inventory records ambiguities and does not claim
responsive behavior, exact font identification, or separate original assets.

Development is phase-by-phase. The plan in
[docs/development-plan.md](docs/development-plan.md) begins with the design
system and proceeds through authentication, role workflows, shared
functionality, integration, and quality assurance. Authentication and the
donor phase have frontend implementations and draft migrations, but the
backend remains unverified. Do not start a later phase without an explicit
request.

## Security

- Keep `.env.local` and all actual credentials out of version control.
- Use only public Supabase client credentials in browser-exposed environment
  variables.
- Never expose a service-role key or database password to frontend code.
- Enforce authorization in trusted backend policies and checks; frontend role
  selection is not authorization.
- Use development resources and explicit approvals for schema writes and
  production changes.

If a credential was previously committed, adding it to `.gitignore` does not
remove it from Git history. Revoke/rotate it with the provider and follow the
repository's approved secret-remediation process; do not reproduce the value
in an issue or report.

## AI Intelligence

The donor and NGO AI insights workflow reuses the saved Random Forest surplus
forecast and adds an authenticated Edge Function for deterministic
recommendations and optional Hugging Face explanations. It does not publish
donations or alter forecast outcomes. See
[docs/ai-intelligence.md](docs/ai-intelligence.md) for model selection,
server-side token setup, local function serving, manual deployment, fallback
behavior, security boundaries, and limitations.

## Known setup limitations

- Original source image/font assets were not separately supplied; the
  flattened PDF designs do not establish original font names or responsive
  behavior.
- No confirmed usable Supabase project URL/publishable key or database
  connection is available for authenticated workflow validation. MCP metadata
  access previously succeeded, but database inspection was unavailable; this
  does not prove that the app is connected.
- Both SQL migrations are un-applied drafts; PostgreSQL syntax, RLS behavior,
  Storage policies, and RPC transitions have not been executed against a
  database. No seed data or lint configuration is present.
- Authentication and donor workflows are implemented in the frontend, but
  Supabase login, uploads, private-image access, and database operations are
  not claimed as live-verified.
- Donor requests are whole-donation only. NGO receipt UI, volunteer delivery,
  notification delivery, and cross-role workflows remain out of scope.
