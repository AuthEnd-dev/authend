# Authend Documentation

## 1. What We Are Trying To Build

Authend is meant to be a self-hosted backend template that gives a developer a usable backend immediately after forking the repository and configuring environment variables.

The intended experience is:

1. Fork the repo.
2. Configure Postgres and auth secrets.
3. Run bootstrap.
4. Get a live backend with:
   - user authentication
   - admin login
   - a plugin catalog for Better Auth features
   - a dashboard for schema management
   - generated CRUD APIs for application tables

The mental model is closer to PocketBase than to a typical starter kit:

- there is one deployable service
- the backend owns auth and data APIs
- an admin dashboard controls backend behavior
- the system should be usable without writing custom backend code first

This is not trying to be a hosted control plane or a multi-tenant BaaS in v1. It is a single-project, self-hosted backend foundation.

## 2. Product Goal

The product goal is to combine:

- Better Auth for authentication
- Drizzle for schema representation and migrations
- Postgres for persistence
- Bun for runtime and tooling
- React for the admin dashboard

into a backend template that stays editable and source-controlled.

That last point matters. Authend is not supposed to hide everything inside opaque runtime metadata. It is supposed to keep the backend understandable:

- schema changes become SQL files
- generated schema code is written to the repo
- the dashboard is an operator UI over a code-backed backend

## 3. Core Use Cases

### 3.1 A developer forks the repo

They should only need:

- `DATABASE_URL`
- `APP_URL`
- `BETTER_AUTH_SECRET`
- `SUPERADMIN_EMAIL`
- `SUPERADMIN_PASSWORD`

After bootstrap, they should be able to sign into the admin dashboard and start using the backend.

### 3.2 The admin enables auth features

The admin dashboard should let the operator enable a curated set of Better Auth plugins such as:

- username
- jwt
- organization
- two factor
- api key
- magic link
- admin

### 3.3 The admin creates app tables

The dashboard should let the operator define application tables and relations without manually editing SQL first.

Those changes should:

- be validated
- produce SQL
- be executed against Postgres
- be stored as migration history
- be reflected in generated CRUD endpoints

### 3.4 App developers consume the backend

Once the backend is running, the app developer should be able to use:

- Better Auth client flows for auth
- generated REST endpoints for records
- a typed SDK wrapper for those endpoints

## 4. Non-Goals For v1

These are deliberately out of scope in the current design:

- multi-tenancy
- hosted project management
- billing
- full file upload/browser workflows
- distributed jobs and task queues
- user-defined serverless functions
- webhook orchestration
- broad custom OAuth provider authoring beyond the curated social sign-on catalog

## 5. System Overview

Authend is organized as a Bun workspace:

- `apps/api`: backend runtime
- `apps/admin`: admin dashboard
- `packages/shared`: shared contracts, schemas, helpers
- `packages/sdk`: frontend/backend client wrapper

There is one logical system:

- the API process serves the backend
- the admin dashboard is a separate frontend during development
- the API serves the built admin assets in production

### 5.1 Fork extensions

Fork-specific routes, auth options, plugins, and admin navigation should live under **`extensions/`** directories and related config files so upstream can evolve core wiring without constant merge conflicts. The HTTP API keeps those under `apps/api/src/extensions/`; everything else ships under **`apps/api/src/core/`** so the top of `src/` stays small. Do not name customization folders **`system`** or **`internal`** (those collide with existing routers and semantics). See [`docs/EXTENSIONS.md`](./EXTENSIONS.md) and [`apps/api/src/README.md`](../apps/api/src/README.md).

## 6. Architecture

### 6.1 API Layer

The API is built with Hono and runs on Bun.

Main responsibilities:

- serve health and readiness routes
- mount Better Auth at `/api/auth/*`
- expose admin APIs for plugins, schema, migrations, and audit logs
- expose app-facing CRUD routes at `/api/data/:table`
- serve the OpenAPI document
- serve the built admin frontend under `/admin`

Important files:

- [`apps/api/src/index.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/index.ts)
- [`apps/api/src/README.md`](/Users/akuma/Github/akumzy/authend/apps/api/src/README.md)
- [`apps/api/src/core/app.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/app.ts)
- [`apps/api/src/core/register-core-routes.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/register-core-routes.ts)
- [`apps/api/src/extensions/`](/Users/akuma/Github/akumzy/authend/apps/api/src/extensions)
- [`apps/api/src/core/routes`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/routes)

### 6.2 Auth Layer

Better Auth is the authentication engine.

The current design assumes:

- email/password is always enabled
- plugin support is curated, not arbitrary
- the auth instance is created from runtime plugin state stored in the database

Current auth responsibilities:

- signup/signin/session handling
- password reset emails
- email verification emails
- plugin-driven auth extensions

Important file:

- [`apps/api/src/core/services/auth-service.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/services/auth-service.ts)

### 6.3 Database Layer

Postgres is the only required external service.

Drizzle is used as the code-level schema representation for:

- auth tables
- system metadata tables
- generated schema artifacts

There are three categories of data:

1. Better Auth tables
2. system tables used by Authend
3. generated application tables created from dashboard actions

Important files:

- [`apps/api/src/core/db/schema/auth.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/db/schema/auth.ts)
- [`apps/api/src/core/db/schema/system.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/db/schema/system.ts)
- [`apps/api/generated/schema/generated.ts`](/Users/akuma/Github/akumzy/authend/apps/api/generated/schema/generated.ts)

Generated application tables can also carry table-level record hooks in schema metadata.

- hooks can run on `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, and `afterDelete`
- a hook can either call an external webhook URL or run a built-in automation recipe
- `blocking` hooks must succeed for the request to continue
- `after*` hooks run after the row mutation has happened, so blocking there delays completion but does not roll back the already-written row

### 6.4 Admin Dashboard

The admin app is a React frontend.

It exists to operate the backend, not to be a public product UI.

Main screens:

- overview
- plugin catalog
- schema designer
- record browser
- migration history
- audit log

Important files:

- [`apps/admin/src/main.tsx`](/Users/akuma/Github/akumzy/authend/apps/admin/src/main.tsx)
- [`apps/admin/src/app/router.tsx`](/Users/akuma/Github/akumzy/authend/apps/admin/src/app/router.tsx)
- [`apps/admin/src/app/shell.tsx`](/Users/akuma/Github/akumzy/authend/apps/admin/src/app/shell.tsx)
- [`apps/admin/src/config/navigation.ts`](/Users/akuma/Github/akumzy/authend/apps/admin/src/config/navigation.ts)
- [`apps/admin/src/extensions/`](/Users/akuma/Github/akumzy/authend/apps/admin/src/extensions)
- [`apps/admin/src/pages`](/Users/akuma/Github/akumzy/authend/apps/admin/src/pages)

### 6.5 SDK Layer

The SDK is a typed client wrapper around:

- Better Auth client methods
- Authend admin APIs
- Authend CRUD APIs
- normalized API resource manifests used by the preview and future code generation

Important file:

- [`packages/sdk/src/client.ts`](/Users/akuma/Github/akumzy/authend/packages/sdk/src/client.ts)
- [`docs/API_PREVIEW.md`](/Users/akuma/Github/akumzy/authend/docs/API_PREVIEW.md)

## 7. Data Model

### 7.1 Auth Tables

Core auth-related tables currently defined include:

- `user`
- `session`
- `account`
- `verification`
- optional plugin tables such as `two_factor`, `jwks`, `organization`, `member`, `invitation`, `api_key`

### 7.2 System Tables

Authend-specific metadata tables include:

- `system_admins`
- `plugin_configs`
- `schema_tables`
- `schema_fields`
- `schema_relations`
- `migration_runs`
- `audit_logs`

### 7.3 Generated App Tables

These are created from dashboard-authored schema drafts.

The current model stores both:

- metadata rows describing the draft
- SQL and generated Drizzle code representing the resulting tables

## 8. Runtime Flow

### 8.1 Bootstrap Flow

`bun run bootstrap` is supposed to:

1. ensure the core schema exists
2. seed the curated plugin registry
3. apply pending migrations
4. seed or promote the configured superadmin

Main files:

- [`apps/api/src/core/scripts/bootstrap.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/scripts/bootstrap.ts)
- [`apps/api/src/core/services/bootstrap-service.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/services/bootstrap-service.ts)

### 8.2 Authentication Flow

1. User signs in via Better Auth routes.
2. Better Auth issues a session.
3. Admin APIs require a valid session.
4. Admin APIs additionally require a matching `system_admins` row.

Main middleware:

- [`apps/api/src/core/middleware/auth.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/middleware/auth.ts)

### 8.3 Plugin Enable Flow

The intended flow is:

1. admin toggles a plugin
2. plugin config is validated
3. any required SQL changes are applied
4. plugin state is persisted
5. auth runtime is reloaded

Current persistence exists in:

- [`apps/api/src/core/services/plugin-service.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/services/plugin-service.ts)

Plugin definitions live in:

- [`apps/api/src/core/plugins/registry.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/plugins/registry.ts)

### 8.4 Schema Apply Flow

The intended flow is:

1. admin submits a `SchemaDraft`
2. the draft is validated
3. SQL statements are generated
4. SQL is previewed
5. SQL is written to a migration file
6. migration is executed
7. schema metadata is replaced
8. generated Drizzle schema file is updated

Main file:

- [`apps/api/src/core/services/schema-service.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/services/schema-service.ts)

### 8.5 CRUD Flow

The generic data API works by:

1. resolving a table descriptor
2. allowing sorting and simple filtering
3. reading or mutating rows with SQL built from the descriptor

Main file:

- [`apps/api/src/core/services/crud-service.ts`](/Users/akuma/Github/akumzy/authend/apps/api/src/core/services/crud-service.ts)

## 9. Public API Surface

### 9.1 System Routes

- `GET /health`
- `GET /ready`
- `GET /api/openapi.json`
- `GET /api/setup/status`

### 9.2 Auth Routes

- `ALL /api/auth/*`

These are handled by Better Auth directly.

### 9.3 Admin Routes

- `GET /api/admin/plugins`
- `POST /api/admin/plugins/:pluginId/config`
- `POST /api/admin/plugins/:pluginId/enable`
- `POST /api/admin/plugins/:pluginId/disable`
- `GET /api/admin/schema`
- `POST /api/admin/schema/preview`
- `POST /api/admin/schema/apply`
- `GET /api/admin/migrations`
- `POST /api/admin/migrations/preview`
- `POST /api/admin/migrations/apply`
- `GET /api/admin/audit`

### 9.4 Data Routes

- `GET /api/data`
- `GET /api/data/:table`
- `POST /api/data/:table`
- `GET /api/data/:table/:id`
- `PATCH /api/data/:table/:id`
- `DELETE /api/data/:table/:id`
- `GET /api/admin/data`
- `GET /api/admin/data/:table`
- `POST /api/admin/data/:table`
- `GET /api/admin/data/:table/:id`
- `PATCH /api/admin/data/:table/:id`
- `DELETE /api/admin/data/:table/:id`

## 10. Shared Contracts

The shared package defines the core backend-facing shapes:

- `PluginCatalogItem`
- `PluginConfig`
- `SchemaDraft`
- `TableBlueprint`
- `FieldBlueprint`
- `RelationBlueprint`
- `MigrationRecord`
- `AuditLog`

Main file:

- [`packages/shared/src/contracts.ts`](/Users/akuma/Github/akumzy/authend/packages/shared/src/contracts.ts)

## 11. Security Model

The current intended security model is:

- Better Auth handles sessions and auth flows
- only seeded superadmins can access admin routes
- admin routes are separate from public auth routes
- app-facing data routes are governed by table API policy across `public`, `session`, `apiKey`, and `superadmin` actors
- generated table fields can also be restricted per actor for read, create, and update visibility
- admin-only data management routes are mounted separately and require superadmin access before table policy evaluation
- built-in auth/system tables are default-deny on the app-facing data API unless explicitly allowlisted for read-only admin use

That last point is important. The runtime now enforces per-table access policy on generated tables, including owner-scoped session routes and API-key permissions, and the admin UI exposes policy presets plus an actor-aware API Preview simulator for the common patterns. The product UX is still operator-grade rather than polished hosted-BaaS-grade tooling.

## 12. Current State Of The Repository

The repository currently contains a scaffolded implementation of the architecture above.

It already includes:

- workspace layout
- API routes
- auth service wiring
- plugin catalog model
- schema draft model
- migration history model
- admin dashboard pages
- SDK wrapper
- bootstrap script

What it does not yet guarantee is production readiness. Several areas are still scaffold-level and need hardening.

## 13. Known Gaps And Risks

These are the most important gaps in the current implementation:

### 13.1 Plugin config coverage is now test-backed, but still bounded by real runtime surfaces

Core saved config paths are now verified against runtime composition for the shipped plugins, but fields that depend on extension handlers, provider credentials, or downstream Better Auth behavior still need plugin-specific validation.

### 13.2 Built-in table exposure is intentionally narrow

The data API now default-denies built-in auth/system tables and redacts sensitive fields on the small allowlisted set. Any expansion of that allowlist should be treated as a security review item.

### 13.3 Schema drift is detectable, but still operator-facing

The runtime now exposes schema drift reporting across metadata, generated artifacts, and the live database. That closes a major safety gap, but the flow is still an operator tool rather than a polished guided workflow.

### 13.4 Better Auth compatibility is now runtime-tested, but version pinning still matters

The current auth and plugin flows are exercised against the installed Better Auth version in the integration suite. Production deployments should still pin Better Auth deliberately and treat upgrades as a compatibility event.

### 13.5 Admin UX is still operator-grade, not polished product-grade

The current dashboard is enough to exercise flows, but not yet refined for onboarding, error recovery, or complex schema authoring.

## 14. What Success Looks Like

Authend is successful when a user can:

1. fork the repository
2. configure env vars
3. run bootstrap
4. sign in as superadmin
5. enable a Better Auth plugin from the dashboard
6. create a table from the dashboard
7. see a migration recorded
8. call a generated CRUD endpoint successfully

That is the v1 bar.

## 15. Recommended Next Work

If the goal is to turn the current scaffold into a reliable v1, the next priorities should be:

1. finish runtime plugin configuration wiring
2. lock down or redact sensitive built-in CRUD tables
3. fix generated schema fidelity for enums and references
4. add real integration tests against Postgres
5. validate Better Auth plugin behavior against the exact installed version
6. improve admin onboarding and schema editing UX

## 16. Short Plain-English Summary

Authend is trying to be a forkable, self-hosted backend product starter.

Instead of giving you only a code skeleton, it is trying to give you:

- auth already wired
- admin already wired
- database already wired
- schema operations already wired
- API generation already wired

The long-term point is that you should not have to build “the boring backend foundation” from scratch every time you start a product.
