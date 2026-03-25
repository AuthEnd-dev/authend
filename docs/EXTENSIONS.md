# Fork extensions (merge-friendly customization)

Authend is meant to be forked and extended. To reduce merge conflicts when you pull upstream changes, put **product-specific** code in the dedicated **`extensions/`** folders and small config modules documented below. Prefer **not** editing large upstream-owned files when a hook exists.

## Naming

Use the folder name **`extensions/`** for fork-owned code. Do **not** name customization areas `system` or `internal`: those terms already mean something in this repo (for example the HTTP router under `/api/system`, system metadata tables, and security-sensitive paths).

## API (`apps/api/src/extensions/`)

| File | Purpose |
|------|---------|
| [`routes.ts`](../apps/api/src/extensions/routes.ts) | Mount extra Hono routers after core routes (`registerExtensionRoutes(app)` is called from [`app.ts`](../apps/api/src/core/app.ts)). |
| [`plugins.ts`](../apps/api/src/extensions/plugins.ts) | Append `PluginDefinition` entries; they are merged after the built-in registry in [`plugins/registry.ts`](../apps/api/src/core/plugins/registry.ts). Built-in plugins live in [`plugins/builtin-registry.ts`](../apps/api/src/core/plugins/builtin-registry.ts). |
| [`auth.ts`](../apps/api/src/extensions/auth.ts) | Implement `forkAuthContributions()` to add Better Auth plugins or option fragments; merged after dashboard-driven runtime plugins in [`auth-service.ts`](../apps/api/src/core/services/auth-service.ts). |

Platform route mounting lives in [`register-core-routes.ts`](../apps/api/src/core/register-core-routes.ts) under `src/core/`. Upstream adds new first-party routes there; forks add HTTP surface in `extensions/routes.ts` or new files imported from it.

Admin HTTP handlers are split under [`apps/api/src/core/routes/admin/`](../apps/api/src/core/routes/admin/) by area (`ai`, `plugins`, `settings`, `schema`, and so on) so upstream growth does not force a single huge merge conflict file.

See also [`apps/api/src/README.md`](../apps/api/src/README.md) for the `extensions/` vs `core/` split.

## Admin dashboard (`apps/admin/src/`)

| Location | Purpose |
|----------|---------|
| [`config/navigation.ts`](../apps/admin/src/config/navigation.ts) | Tier-1 rail (`primaryNav`) and settings sidebar data derived from `settingsNavItems`. Add entries here instead of editing shell layout. |
| [`extensions/routes.tsx`](../apps/admin/src/extensions/routes.tsx) | Return extra top-level route groups from `mergeExtensionRouteChildren()` (spread into the router tree in [`app/router.tsx`](../apps/admin/src/app/router.tsx)). |
| [`app/shell.tsx`](../apps/admin/src/app/shell.tsx) | Layout and chrome (upstream-owned; avoid fork edits when navigation or routes suffice). |
| [`app/router.tsx`](../apps/admin/src/app/router.tsx) | Core TanStack Router tree (upstream-owned). |
| [`main.tsx`](../apps/admin/src/main.tsx) | App bootstrap only (providers + `RouterProvider`). |

## Shared packages

Keep cross-cutting contracts in [`packages/shared`](../packages/shared). App-only types and helpers can live under `apps/api/src/extensions/` or a fork-owned package if they grow large.

## Pulling upstream

1. Expect changes under `apps/api/src/core/` (for example `register-core-routes.ts`, `plugins/builtin-registry.ts`, `routes/admin/`) and in the admin app’s `app/router.tsx` and `app/shell.tsx`.
2. Re-apply your work in `apps/api/src/extensions/*` and `apps/admin/src/extensions/*` (and `config/navigation.ts`) if a merge touches those files; conflicts should be smaller than when everything lived in monolithic entrypoints.
