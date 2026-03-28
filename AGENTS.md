# AuthEnd Agent Guide

This file is the primary operating guide for AI agents working in this repo.

AuthEnd is designed to be forked. The main rule is simple:

- keep fork-specific work in extension points
- treat upstream-owned core files as read-only unless the user explicitly asks for a core change

The goal is to keep upstream pulls merge-friendly while still allowing aggressive customization in the correct places.

## Product shape

AuthEnd is a self-hosted backend-as-a-service with these major parts:

- `apps/api`: Hono + Better Auth + Drizzle + Postgres backend
- `apps/admin`: operator dashboard
- `packages/shared`: shared contracts, schemas, helpers
- `packages/sdk`: typed client package
- `packages/mcp-server`: schema-first MCP server for local AI-assisted app building

Useful high-level docs:

- `docs/ARCHITECTURE.md`
- `docs/EXTENSIONS.md`
- `docs/API_PREVIEW.md`
- `docs/DEPLOYMENT.md`
- `docs/COMPATIBILITY.md`

## Default editing rule

Treat these as upstream-owned by default:

- `apps/api/src/core/*`
- `apps/admin/src/app/*`
- `apps/admin/src/pages/*` unless the user clearly wants direct admin feature work there
- other platform internals outside documented extension points

Only edit upstream-owned files when:

- the user explicitly asks for a core change
- there is no existing extension point and the user approves a new core hook
- the task is clearly a platform/framework change rather than a fork customization

If an extension point can handle the request, use it instead of editing core.

## Repo map for agents

### Backend extension points

- `apps/api/src/extensions/routes.ts`
  Use for fork-owned API routes and HTTP surface.

- `apps/api/src/extensions/auth.ts`
  Use for Better Auth runtime plugins, trusted origins, and auth option overrides.

- `apps/api/src/extensions/schema.ts`
  Use for fork-owned schema tables and relations.

- `apps/api/src/extensions/plugins.ts`
  Use for new fork-owned AuthEnd plugin definitions.

- `apps/api/src/extensions/plugin-defaults.ts`
  Use for declarative defaults for existing built-in AuthEnd plugins.

### Admin extension points

- `apps/admin/src/extensions/routes.tsx`
  Use for fork-owned admin route groups.

- `apps/admin/src/config/navigation.ts`
  Use for admin navigation changes.

### MCP surface

- `packages/mcp-server`
  Use when the task is about MCP tools, transports, schema-first AI workflows, or exposing AuthEnd capabilities to local AI clients.

## Choose the right extension point

If the request is about:

- adding API endpoints: use `apps/api/src/extensions/routes.ts`
- adding Better Auth runtime behavior: use `apps/api/src/extensions/auth.ts`
- adding tables or relations: use `apps/api/src/extensions/schema.ts`
- adding a new fork-owned AuthEnd plugin: use `apps/api/src/extensions/plugins.ts`
- enabling or preconfiguring an existing built-in AuthEnd plugin: use `apps/api/src/extensions/plugin-defaults.ts`
- adding admin routes/screens through the extension layer: use `apps/admin/src/extensions/routes.tsx`
- changing admin navigation: use `apps/admin/src/config/navigation.ts`
- changing MCP tools or transports: use `packages/mcp-server`

## Hard boundaries

### `extensions/auth.ts`

This file is for runtime auth contributions only:

- Better Auth plugins
- auth option overrides
- trusted origins
- auth-layer hooks

Do not use it to:

- persist AuthEnd plugin install state
- enable built-in AuthEnd plugins
- save plugin config to `_plugin_configs`
- add ad hoc startup mutation behavior

If the request is “default social auth to Google when env vars exist”, that belongs in `apps/api/src/extensions/plugin-defaults.ts`, not `extensions/auth.ts`.

### `extensions/plugins.ts`

This file is only for new fork-owned AuthEnd plugin definitions.

Do not use it to:

- configure a built-in plugin
- patch built-in plugin defaults
- mutate plugin install state

### `extensions/plugin-defaults.ts`

This file is the correct place for defaults for existing built-in AuthEnd plugins.

It must stay declarative:

- `pluginId`
- optional `when`
- optional `enabled`
- optional `configPatch`
- optional `capabilityStatePatch`
- optional `extensionBindingsPatch`

Do not perform side effects or persistence from this file.

### `extensions/schema.ts`

Keep fork-owned schema here.

Relation aliases may use:

- `snake_case`
- `camelCase`

They must:

- start with a lowercase letter
- contain only letters, numbers, and underscores

### Core bootstrap and startup

Do not add ad hoc imports from `extensions/` into core bootstrap/startup code for fork-specific behavior.

Avoid patterns like:

- `extensions/bootstrap.ts` imported by `bootstrap-service.ts`
- startup code that writes durable DB state for fork configuration
- core startup code that configures built-in plugin install state directly for a specific product

If the feature needs startup-time fork behavior and no extension point exists, stop and explain that a new core hook is required.

## AuthEnd plugin model

AuthEnd has two different plugin concepts:

1. Better Auth runtime plugins
   These belong in `apps/api/src/extensions/auth.ts` when they are fork-owned.

2. AuthEnd plugin install/config state
   These belong in:
   - core manifests for built-in platform plugins
   - `apps/api/src/extensions/plugins.ts` for new fork-owned plugin definitions
   - `apps/api/src/extensions/plugin-defaults.ts` for defaults for existing built-in plugins

Do not confuse these layers.

Configuring a built-in AuthEnd plugin is not the same as registering a new plugin.

## How to discover existing plugins

Before adding or changing plugin-related code, check whether the plugin already exists.

Use these sources in order:

- `apps/api/src/core/plugins/builtin-registry.ts` for the canonical list of built-in AuthEnd plugins
- `apps/api/src/core/plugins/*/manifest.ts` for built-in plugin details
- `apps/api/src/extensions/plugins.ts` for fork-owned plugin definitions already added by the fork
- `apps/api/src/core/services/plugin-service.ts` and `apps/api/src/core/services/plugin-orchestrator.ts` for listing, reading, enabling, disabling, and configuring plugins

Decision rule:

1. Check `builtin-registry.ts` first.
2. If the plugin already exists, treat it as a built-in plugin.
3. If the request is to preconfigure or enable that built-in plugin for the fork, use `apps/api/src/extensions/plugin-defaults.ts`.
4. If the plugin does not exist and the user wants a new fork-owned plugin, use `apps/api/src/extensions/plugins.ts`.

## MCP guidance

AuthEnd includes a schema-first MCP server under `packages/mcp-server`.

When working in that package:

- preserve the schema-first workflow
- keep tool names and contracts stable unless the user asks for a breaking change
- prefer existing AuthEnd service logic over re-implementing business rules
- keep `stdio` and HTTP transports on the same internal tool layer

Do not invent a separate backend path for MCP if existing AuthEnd services already provide the capability.

## Documentation expectations

When you add a new extension point or boundary rule, update docs in the same change.

At minimum, consider updating:

- `docs/EXTENSIONS.md`
- `apps/api/src/README.md`
- `README.md`
- `packages/mcp-server/README.md` if the change affects MCP workflows
- this `AGENTS.md` file if the change affects agent behavior

If you add a new extension file, include a commented example in that file unless there is a strong reason not to.

## Anti-patterns

Avoid these unless the user explicitly asks for them:

- editing `apps/api/src/core/*` for fork-specific product behavior
- putting persistent plugin configuration logic in `extensions/auth.ts`
- adding a fork-only bootstrap module imported into core startup
- mutating durable DB/plugin state on every boot when a declarative default would work
- registering built-in plugin defaults in the wrong file
- bypassing existing extension hooks and directly editing admin shell/router files for simple fork additions

## Decision flow

When a request comes in:

1. Identify whether it is a fork customization or a platform/core change.
2. Check whether an existing extension point fits.
3. If yes, implement the change there.
4. If no, explain the gap and say a new core hook or explicit core change is required.
5. Only modify core after the user explicitly asks for a core change.

## Good outcomes

Good work in this repo usually looks like:

- fork-specific logic stays in `extensions/`
- built-in plugin defaults are declarative
- runtime auth contributions stay separate from persisted plugin state
- schema changes live in `extensions/schema.ts`
- docs and examples are updated with the new pattern
- upstream pulls remain straightforward
