---
name: authend-extension-guardrails
description: Use when working in an AuthEnd fork or template, especially for changes under apps/api or apps/admin, schema/auth/plugin customization, MCP-assisted app building, or any request that might tempt an agent to edit upstream-owned core files. This skill enforces the AuthEnd rule to prefer extension points and treat core as read-only unless the user explicitly asks for a core change.
---

# AuthEnd Extension Guardrails

Use this skill when the repo is an AuthEnd app or fork.

## Default rule

Treat upstream-owned `core/` files as read-only unless the user explicitly asks for a core change.

Prefer documented extension points first.

## File mapping

For API changes, use:

- `apps/api/src/extensions/routes.ts` for fork-owned HTTP routes
- `apps/api/src/extensions/auth.ts` for Better Auth additions or auth option overrides
- `apps/api/src/extensions/schema.ts` for fork-owned tables and relations
- `apps/api/src/extensions/plugins.ts` for new plugin definitions

For admin changes, use:

- `apps/admin/src/extensions/routes.tsx` for fork-owned admin routes
- `apps/admin/src/config/navigation.ts` for navigation changes

## Do not do this by default

- Do not edit `apps/api/src/core/*`
- Do not edit `apps/admin/src/app/*` or other upstream-owned admin shell files if an extension hook exists
- Do not add new imports from `core/` into `extensions/` just to create a product-specific startup path
- Do not mutate durable DB or plugin state from core startup unless the user explicitly asks for a new core hook

## Decision workflow

1. Identify the requested behavior.
2. Check whether an existing extension point can handle it.
3. If yes, implement it in the extension layer.
4. If no, explain that the change requires a new core hook or explicit core edit.
5. Only touch core after the user explicitly asks for a core change.

## AuthEnd-specific reminders

- Built-in plugin registration lives in core; fork-specific plugin definitions belong in `apps/api/src/extensions/plugins.ts`
- Configuring an existing built-in plugin is not the same as registering a plugin
- Fork-specific schema should stay in `apps/api/src/extensions/schema.ts`
- Relation aliases in extension schema may use `snake_case` or `camelCase`, but must start with a lowercase letter and use only letters, numbers, or underscores

## Good outcomes

- Product-specific work stays in `extensions/`
- Upstream pulls remain merge-friendly
- Agents explain when the requested behavior needs a core hook instead of silently editing core

