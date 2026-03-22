# Authend

Authend is a self-hosted backend template built on Bun, Better Auth, Drizzle, and Postgres. The goal is simple: fork the repo, set a handful of environment variables, run bootstrap, and get a working backend plus admin dashboard for auth, plugins, schema management, and generated CRUD APIs.

Full product and architecture documentation lives in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md). The API contract and preview layer is documented in [docs/API_PREVIEW.md](./docs/API_PREVIEW.md).

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
- Generated CRUD endpoints at `/api/data/:table`
- Typed SDK in [`packages/sdk`](./packages/sdk)
- Migration history and audit logging
- API contract preview with OpenAPI and SDK-aligned resource metadata
- Project settings pages for file storage, backups, crons, email, domains, and platform policy

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
- `GET|POST /api/admin/schema/*`
- `GET|POST /api/admin/migrations/*`
- `GET /api/admin/audit`
- `GET|POST /api/admin/api-preview/*`
- `GET|POST|PATCH|DELETE /api/data/:table`

Admin and data routes require a Better Auth session and a seeded superadmin record.

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
- The API preview layer now defines stable contract metadata, but runtime auth modes other than superadmin are still preview-only until a client-facing router is added.
- The SDK generator now uses the dedicated `/api/system/sdk-schema` manifest rather than full OpenAPI codegen. OpenAPI remains available for broader ecosystem tooling.
- The plugin migration coverage is best-effort for the curated set and should be validated against the exact Better Auth version you pin in production.
