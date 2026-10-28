# ResQPlate setup

## Required software and access

- Node.js 22.12+ (Node.js 22 LTS recommended) and npm 10+
- Git
- VS Code for the workspace MCP configuration
- An authorized Supabase account and development project when backend
  integration begins

The repository's Vite toolchain expects a current Node.js version. Confirm
locally with `node --version` and `npm --version`.

## Install and run

From the repository root:

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

To copy the environment file in Command Prompt:

```bat
copy .env.example .env.local
```

The dev and preview scripts bind to `127.0.0.1`. Vite prints the local URL
when the server starts. Stop it with Ctrl+C in the terminal.

## Environment variables

Set values in the ignored `.env.local` file:

| Variable | Value source | Privacy |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase project API settings for the development project | Public project endpoint; browser-exposed |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase project API settings; use the publishable client key | Public client key; browser-exposed and constrained by RLS |

The variables are blank in `.env.example`. No project credentials were
available during foundation setup. Never put service-role keys, database
passwords, or private credentials in `VITE_` variables. Do not make a
production `.env` file with guessed values.

## Supabase development project

1. Obtain user approval and access to an appropriate development Supabase
   project; do not assume production is appropriate.
2. Record the project reference and URL from the Supabase dashboard.
3. Put the URL and publishable key in `.env.local`.
4. Configure authentication providers, redirect URLs, and email behavior in
   Supabase only after product requirements and account permissions are
   confirmed.
5. Design and review schema and RLS policies before applying migrations.

No project creation, authentication configuration, database schema, seed data,
or backend connection was performed in this foundation phase.

## Future migration workflow

Database migrations belong under `supabase/migrations/` and must be
version-controlled, reviewed, and tested against a development environment
before any approved deployment. No migration or seed file is present yet.
Use the Supabase CLI and the project's documented workflow when introduced;
do not apply ad-hoc or destructive SQL to a shared/production project. Before
write operations, review the migration and obtain any required approval.

## Supabase MCP setup in VS Code

`.vscode/mcp.json` uses the VS Code `servers` configuration with an HTTP
server and the official Supabase MCP endpoint. The installed VS Code CLI was
1.142.0. VS Code's current documentation says `.vscode/mcp.json` remains
available for compatibility, though the guided flow labels this destination
deprecated; it was retained here because it is the requested workspace path.
Replace `YOUR_SUPABASE_PROJECT_REF` with the approved **development**
project's reference. The endpoint is scoped to that project and requests
read-only access. No feature-selection parameter is set because a supported
parameter/value was not confirmed in the official configuration guidance. The
file contains no token or service-role key.

See the [VS Code MCP server documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
and [Supabase MCP documentation](https://supabase.com/docs/guides/getting-started/mcp)
for current configuration and authentication details.

1. Open the repository in a VS Code version that supports HTTP MCP servers.
2. Replace the project-reference placeholder with the real development
   reference; do not commit credentials.
3. Start/enable the server using VS Code's MCP controls.
4. Complete the authentication prompt in the trusted VS Code/Supabase flow.
   Do not paste credentials into source files or chat.
5. Verify the server reports connected in the VS Code MCP controls, then run
   a harmless read-only tool such as listing project metadata or reading
   documentation. Confirm it targets the intended development project.

The configuration file alone does not prove that the server connected or is
authenticated. No account login or MCP connection was available to verify
during foundation setup.

### Enabling approved writes later

Keep the initial configuration read-only. When database migrations need to be
applied, first review and approve the migration and confirm the target is the
development project. Then consult the current official Supabase MCP
documentation and change the configuration to the documented write-enabled
mode only for that approved operation. Do not remove read-only restrictions
for convenience, and do not grant production access without explicit
authorization. Restore the safer configuration after the task if writes are
not continuously required. Never embed credentials in the MCP JSON.

## Available checks

Commands currently defined in `package.json`:

```powershell
npm run typecheck
npm run build
```

`npm run dev` starts the local server; `npm run preview` previews an existing
production build. No lint or test command exists yet. Do not report lint or
test success until those tools and tests are added and actually run.

## Troubleshooting

- **Unsupported Node version:** install a current Node.js 22 LTS release and
  reopen the terminal; Vite may reject older versions.
- **Missing dependencies:** run `npm install` from the repository root.
- **Address already in use:** stop the process using the selected local port
  or use a port approved for local development.
- **Supabase request/configuration errors:** check that the URL and publishable
  key belong to the same development project, that `.env.local` is in the
  repository root, and that Vite was restarted after changing environment
  values.
- **MCP not connected:** verify VS Code's MCP support, JSON syntax, actual
  project reference, authentication prompt, and workspace trust/account
  permissions. A saved file is not a connection test.
- **Access denied:** do not weaken RLS to work around an error. Verify the
  authenticated identity, intended role/ownership, and reviewed policy.

## Secrets, rotation, and approvals

Keep `.env.local`, private keys, provider tokens, database credentials, and
service-role keys out of Git. `.gitignore` does not erase a secret already
committed. If exposure is suspected, revoke/rotate the credential with its
provider, assess its use, and follow the approved incident and history-cleanup
process without disclosing the value.

Creating projects, changing account settings, authenticating MCP, applying
migrations, granting write permissions, or deploying to production may need
manual account access and explicit user approval. Ask for the necessary access
or approval; do not claim those actions were performed when they were not.
