# API Preview Architecture

## Goal

The API Preview phase exists to turn each generated table into a stable API contract before we expose a richer client-facing runtime.

The immediate objective is not just to show example requests. It is to define, persist, and normalize the parts of an API that a future SDK generator will depend on:

- route segment
- stable SDK resource name
- auth mode
- actor-based access policy
- enabled CRUD operations
- pagination defaults and limits
- allowed filter fields
- allowed sort fields and default sort
- allowed relation includes

That contract is then reused by:

- the admin API preview panel
- the OpenAPI document
- the SDK client helpers

## Current Model

Each dashboard-authored table now has an `api` block inside its `TableBlueprint`.

Important fields:

- `routeSegment`
- `sdkName`
- `tag`
- `description`
- `authMode`
- `access`
- `operations`
- `pagination`
- `filtering`
- `sorting`
- `includes`

This is stored alongside the schema draft metadata, so API design remains source-controlled with the table definition instead of living in a separate opaque store.

## Normalization Rules

The backend normalizes API config before it is exposed anywhere else.

That normalization currently guarantees:

- `routeSegment` falls back to the table name
- `sdkName` falls back to the table name
- `tag` falls back to a start-cased table label
- `description` falls back to `"<Display Name> API"`
- built-in tables stay read-only for create, update, and delete
- invalid filter/sort/include fields are replaced with valid defaults
- the default sort field falls back to the primary key
- pagination defaults are clamped so `defaultPageSize <= maxPageSize`

This matters because OpenAPI generation and future SDK generation should never need to interpret partial or inconsistent raw config.

## Resource Contract

The normalized backend representation is `ApiResource`.

It contains:

- table identity and primary key
- route information
- normalized API config
- field metadata
- security metadata
- query capabilities
- enabled operations

`ApiPreview` is a thin wrapper around `ApiResource` plus code snippets for the admin UI.

## Admin API Surface

These admin endpoints now expose the contract layer:

- `GET /api/admin/api-preview`
  - returns all normalized `ApiResource` entries
- `GET /api/admin/api-preview/:table`
  - returns one `ApiPreview`
- `POST /api/admin/api-preview/:table`
  - saves a generated table’s API config and reapplies the schema draft

This gives the admin UI and any internal tooling a stable manifest endpoint.

## OpenAPI Strategy

The OpenAPI document is now generated from normalized resources rather than hand-assembled route strings.

For each resource it includes:

- operation IDs derived from `sdkName`
- tags from the configured API tag
- security requirements from `authMode`
- list query parameters from the query capability config
- component schemas for:
  - `<sdkName>Record`
  - `<sdkName>Write`
  - `<sdkName>ListResponse`
- `x-authend-resource` metadata for codegen-friendly extensions

This keeps the exported spec aligned with the admin preview configuration.

## SDK Strategy

The SDK is not fully code-generated yet, but it now has two important foundations:

1. `client.system.api.list()`
   - fetches the normalized API resource manifest

2. `client.data.resource(routeSegment)`
   - returns a route-bound CRUD client using the configured route segment

That gives us a transitional path:

- today: generic runtime helper bound to route segments
- next: generated typed resource clients based on the OpenAPI spec and `x-authend-resource`

## Why This Matters

Without this layer, “API Preview” would just be documentation. With it, the preview becomes the beginning of a real contract system:

- admins can design APIs intentionally
- OpenAPI has stable machine-readable metadata
- SDK generation has consistent names and capabilities to target
- future client-facing API work has a defined contract source instead of ad hoc route conventions

## Current Limitations

These settings are contract metadata first. They do not fully change runtime authorization behavior yet.

Specifically:

- `/api/data/*` is still the current runtime surface
- generated tables now enforce runtime actor/access policy on that router
- signed-in callers inherit `public` routes, and owner-scoped routes enforce `ownershipField` at runtime
- relation includes now respect the target table's `get` access policy and target hidden-field redaction
- filter and sort allowlists now derive from readable fields even in direct service-level callers, so hidden fields cannot be queried by bypassing the preview layer
- `/api/data/*` now rate-limits anonymous callers by client IP and API-key callers by key id using the API settings defaults
- the admin schema editor now exposes preset-based policy authoring for `public`, `session`, and `apiKey` use cases
- the schema editor now warns on risky policy combinations such as public writes, sensitive public filters, and broad public includes
- built-in auth/system tables are default-deny there unless explicitly allowlisted
- there is still no separate polished client-facing router beyond the current data surface
- the SDK still uses generic record types rather than generated per-resource TypeScript models

That is acceptable for this phase because the goal is to lock down the contract model before we build the client-facing runtime around it.
