# AuthEnd

**AuthEnd** is a **self-hosted backend-as-a-service** that brings together auth, data, and day-to-day operations, so you spend less time wiring everything yourself. The goal is **less application code**: an **admin UI** configures nearly the whole platform, and a **fully typed TypeScript SDK** keeps your TypeScript clients aligned with the API.

The stack is **TypeScript**, the **Bun** runtime, **Better Auth**, **Drizzle**, **Hono**, and **Postgres**.

For architecture, API details, deployment workflow, and client examples, see [`docs/`](./docs/) (start with [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), and [`docs/COMPATIBILITY.md`](./docs/COMPATIBILITY.md)). For fork-specific routes, plugins, and admin UI hooks without merge pain, see [`docs/EXTENSIONS.md`](./docs/EXTENSIONS.md).

When using AI coding agents in this repo, they should prefer documented extension points and should not modify upstream-owned `core/` files unless you explicitly ask for a core change.
For built-in plugin defaults in a fork, use `apps/api/src/extensions/plugin-defaults.ts` rather than ad hoc bootstrap logic in core.

## Quick start

1. Install [Bun](https://bun.sh) and run Postgres (e.g. `docker compose up -d`).
2. Copy `.env.example` → `.env` and set at least `DATABASE_URL`, `APP_URL`, `ADMIN_URL`, `BETTER_AUTH_SECRET`, and superadmin credentials.
3. From the repo root:

```bash
bun install
bun run bootstrap
bun run dev
```


Sign in at the admin URL using the superadmin you configured.

## Client SDK

Install the runtime package, point the generator at your API, and pull types from `GET /api/system/sdk-schema`:

```bash
bun add @authend/sdk
bunx @authend/sdk init    # writes authend.config.json
bunx @authend/sdk generate
```

Use the client with the generated schema module:

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

const client = createAuthendClient<AuthendSchema>({
  baseURL: "http://localhost:7002",
  schema: authendSchema,
});

const rows = await client.data.yourTable.list();
```

More detail lives in [`packages/sdk/README.md`](./packages/sdk/README.md) and [`docs/examples/`](./docs/examples/).

## MCP Server

AuthEnd also ships with a schema-first MCP server for local AI-assisted app building.

From the repo root:

```bash
bun run mcp:stdio
```

or:

```bash
bun run mcp:http
```

Use it to create tables, relations, API config, records, plugins, and storage objects through MCP. Full usage docs live in [`packages/mcp-server/README.md`](./packages/mcp-server/README.md).

## Generated schema and migrations in Git

The API emits Drizzle schema and SQL migrations under [`apps/api/generated/`](./apps/api/generated/). By default that path is ignored via the `generated` line in [`apps/api/.gitignore`](./apps/api/.gitignore). **Remove that line** (or replace it with narrower rules) if you want to **commit** generated schema and migrations—for example so deploys and teammates share the same migration history.

## Repo layout

| Path | Role |
|------|------|
| `apps/api` | HTTP API, auth, database, migrations |
| `apps/api/src/extensions` | Your routes, plugins, auth hooks (see [`apps/api/src/README.md`](./apps/api/src/README.md)) |
| `apps/api/src/core` | Platform implementation (pull upstream here) |
| `apps/admin` | Operator dashboard |
| `packages/mcp-server` | Schema-first MCP server for local AI tools |
| `packages/sdk` | Typed client for your schema |
| `packages/shared` | Shared types and helpers |
| `apps/*/src/extensions` | Fork-owned customization (see [`docs/EXTENSIONS.md`](./docs/EXTENSIONS.md)) |

## Production-ish run

Build the admin, then start the API (see root `package.json` for `build` / `start`). Run `bun test` when you change server behavior.

Before staging or production deploys, run:

```bash
bun run --cwd apps/api validate-env
```
