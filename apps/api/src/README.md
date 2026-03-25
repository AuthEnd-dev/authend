# API source layout

**Forks and product-specific changes**

- [`extensions/`](./extensions/) — add routes, auth options, and plugin definitions here. See [`docs/EXTENSIONS.md`](../../docs/EXTENSIONS.md).

**Application entry**

- [`index.ts`](./index.ts) — process entry (bootstrap, server). Rarely needs edits.

**Upstream / platform implementation**

- [`core/`](./core/) — routes, services, database, plugins, middleware, and scripts. Pull upstream updates from here; prefer `extensions/` for your own HTTP surface and auth extras.
