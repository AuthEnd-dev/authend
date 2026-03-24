# Authend

Authend is a self-hosted backend template built on Bun, Better Auth, Drizzle, and Postgres. The goal is simple: fork the repo, set a handful of environment variables, run bootstrap, and get a working backend plus admin dashboard for auth, plugins, schema management, and generated CRUD APIs.

Full product and architecture documentation lives in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). The API contract and preview layer is documented in [docs/API_PREVIEW.md](./docs/API_PREVIEW.md). The execution roadmap and delivery checklist live in [docs/ROADMAP.md](./docs/ROADMAP.md).

## What ships in v1

- Bun API server with Hono routes and Better Auth mounted at `/api/auth/*`
- Postgres-backed auth tables plus system metadata tables
- React admin dashboard served at `/admin`
- Curated Better Auth plugin catalog:
  - `username`
  - `jwt`
  - `organization`
  - `twoFactor`
  - `apiKey`
  - `magicLink`
  - `admin`
- Schema draft preview and apply flow
- App-facing CRUD endpoints at `/api/data/:table`
- Typed SDK in [`packages/sdk`](./packages/sdk)
- Migration history and audit logging
- API contract preview with OpenAPI and SDK-aligned resource metadata
- Project settings pages for file storage, backups, crons, email, domains, and platform policy
- Superadmin-only AI assistant with preview-and-confirm action batches for schema, plugins, API config, and data CRUD

## Quick start

1. Install Bun and start Postgres.
2. Copy the environment template.

```bash
cp .env.example .env
docker compose up -d
```

3. Set the required variables in `.env`.

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/authend
APP_URL=http://localhost:7002
ADMIN_URL=http://localhost:7001
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
SUPERADMIN_EMAIL=admin@example.com
SUPERADMIN_PASSWORD=ChangeMe123!
OPENAI_API_KEY=
```

4. Install dependencies, bootstrap, and start the stack.

```bash
bun install
bun run bootstrap
bun run dev:api
```

5. In another terminal, run the admin frontend during development.

```bash
bun run dev:admin
```

Open [http://localhost:7001](http://localhost:7001). Sign in with the seeded superadmin credentials from `.env`.

## Workspace layout

- [`apps/api`](./apps/api): Bun API, Better Auth, Drizzle metadata, migrations, and runtime schema generation
- [`apps/admin`](./apps/admin): React dashboard for plugins, schema, migrations, and records
- [`packages/shared`](./packages/shared): shared contracts and schema helper utilities
- [`packages/sdk`](./packages/sdk): typed fetch client plus Better Auth client wiring

## Bootstrap behavior

`bun run bootstrap` will:

- create the core Postgres tables if they do not exist
- seed the curated plugin registry into `plugin_configs`
- apply any pending SQL migrations from `apps/api/src/db/migrations`
- create or promote the configured superadmin user

## Plugin model

Plugins are curated rather than dynamically installed. The template ships the code and exposes enable/disable toggles from the dashboard. Some plugins add SQL-managed tables on first enable. Email-driven flows such as magic links, password reset, and email verification use SMTP if configured; otherwise the API logs the generated links for local development.

## Schema model

Dashboard-authored tables are stored in metadata tables, emitted into [`apps/api/generated/schema/generated.ts`](./apps/api/generated/schema/generated.ts), written as SQL migrations under [`apps/api/generated/migrations`](./apps/api/generated/migrations), and executed against Postgres.

v1 intentionally blocks destructive operations:

- dropping tables
- removing fields
- auto-migrating incompatible field shape changes
- disabling certain stateful plugins after provisioning

## API surface

- `GET /health`
- `GET /ready`
- `GET /api/openapi.json`
- `GET /api/system/sdk-schema`
- `ALL /api/auth/*`
- `GET /api/setup/status`
- `GET|POST /api/admin/plugins/*`
- `GET|POST /api/admin/ai/*`
- `GET|POST /api/admin/schema/*`
- `GET|POST /api/admin/migrations/*`
- `GET /api/admin/audit`
- `GET|POST /api/admin/api-preview/*`
- `GET|POST|PATCH|DELETE /api/data/:table`
- `GET|POST|PATCH|DELETE /api/admin/data/:table`

Admin routes require a Better Auth session and a seeded superadmin record. App-facing data routes enforce per-table access policy, and built-in auth/system tables are default-deny unless explicitly allowlisted for read-only admin use. The admin dashboard SDK talks to `/api/admin/data/*`, while external clients default to `/api/data/*`.

## Security defaults

- Generated app tables stay on the table-level API policy you define, which defaults to superadmin-only in fresh drafts.
- App-facing actors are `public`, `session`, `apiKey`, and `superadmin`.
- Public access applies to anonymous callers and authenticated callers; superadmins bypass app-facing policy checks.
- Per-field read, create, and update visibility can now be restricted per actor in the schema editor.
- Built-in auth and system tables are blocked from `/api/data/*` by default.
- `/api/admin/data/*` is reserved for superadmin-only management flows.
- The current allowlisted built-in views are intentionally narrow and read-only.
- Sensitive fields on allowlisted built-in tables are redacted before metadata or record payloads are returned.
- Relation includes are filtered through the target table's own read policy, and hidden fields stay redacted inside included records.
- Hidden fields are also excluded from filter and sort allowlists, including direct service-level callers that do not pass explicit query capability config.
- `/api/data/*` now applies per-minute rate limiting for anonymous traffic by client IP and for API-key traffic by key id, using the API settings defaults.

## App-facing policy presets

The schema editor now exposes first-class policy presets for the common access patterns:

- public read-only content
- signed-in user private records
- user can read all but write own
- API-key server-to-server access

Owner-scoped presets guide you toward an ownership field such as `owner_id` or `user_id`, and runtime enforcement is covered by integration tests for public, session, and API-key callers.
The schema editor also supports field-level visibility for read/create/update and flags risky combinations such as public writes, public filtering on sensitive field names, and broad public relation includes.
The API Preview panel now includes an actor-aware policy simulator so you can verify allowed operations, visible fields, and query surface for `public`, `session`, and `apiKey` callers before shipping the table.

## AI assistant

Authend includes a superadmin-only AI assistant in the admin shell. It uses the official `openai` SDK on the API server and talks to an OpenAI-compatible endpoint you configure under `Settings > AI Assistant`.

Important guardrails:

- preview + confirm only, never direct apply
- limited to schema, plugins, API config, and data CRUD
- cannot edit env vars, run backups, manage crons, use raw SQL, or invoke danger-zone operations
- every approved run is executed through the same service layer as the dashboard and written to the audit log

Minimum local setup:

```env
OPENAI_API_KEY=your-provider-key
```

Then in the admin:

1. Open `Settings > AI Assistant`
2. Enable the assistant
3. Set your provider base URL and model
4. Keep the API key env var name aligned with your `.env`

## SDK generation

Authend now exposes a dedicated SDK schema manifest at `/api/system/sdk-schema`.

In the client app:

```bash
npm install @authend/sdk
```

In another app, create `authend.config.json`:

```json
{
  "apiUrl": "http://localhost:7002",
  "output": "./src/generated/authend.ts"
}
```

Then generate local types:

```bash
npx authend-gen generate
```

Or via `package.json`:

```json
{
  "scripts": {
    "authend:generate": "authend-gen generate"
  }
}
```

Use the generated schema with the runtime client:

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

const client = createAuthendClient<AuthendSchema>({
  baseURL: "http://localhost:7002",
  schema: authendSchema,
});

await client.data.post.list();
```

Keep Better Auth as the auth client in your app and use the Authend SDK for typed `data` access.

## Runtime-verified plugin config

Phase 0A verifies that saved runtime config is consumed for the shipped plugin surfaces exercised by tests:

- `username`
- `magicLink`
- `apiKey`
- `admin`
- `jwt`
- `organization`
- `twoFactor`
- `socialAuth`

Config that depends on custom extension handlers or provider credentials still requires those handlers/env vars to be present at runtime. Plugin manifests remain the source of truth for those dependencies.

## Production notes

- Build the admin app before starting the Bun server in production:

```bash
bun run build
bun run start
```

- The admin bundle is served under `/admin/`, so reverse proxies should preserve that path.
- Generated schema and migration files are regular workspace files. Commit them if you want schema history tracked in git.

## Tests

The repo includes a small Bun test scaffold for shared schema validation helpers.

```bash
bun test
```

## Current limitations

- Multi-tenancy is out of scope for v1.
- File upload/browser workflows are not yet exposed beyond storage configuration and diagnostics.
- Generated app tables can now be exposed through the data router with runtime policy enforcement and preset-based policy editing, but the admin UX is still operator-grade rather than polished end-user product tooling.
- The SDK generator now uses the dedicated `/api/system/sdk-schema` manifest rather than full OpenAPI codegen. OpenAPI remains available for broader ecosystem tooling.
- The plugin migration coverage is best-effort for the curated set and should be validated against the exact Better Auth version you pin in production.
