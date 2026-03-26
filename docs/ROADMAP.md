# Authend Roadmap

This roadmap turns Authend from a strong self-hosted backend scaffold into a fast, easy, TypeScript-first BaaS.

The priority order is deliberate:

1. make the runtime safe for real app users
2. make the TypeScript developer experience excellent
3. fill the missing BaaS product surface
4. harden the platform for production

## How To Use This Document

- Treat each phase as a release train.
- Do not start the next phase until the current phase exit criteria are met.
- Keep boxes unchecked until the feature is implemented, documented, and tested.
- If scope changes, update this file first so the roadmap stays truthful.

## North Star

Authend should let a TypeScript developer:

1. boot a backend in minutes
2. model data visually
3. expose safe app-facing APIs with clear policies
4. consume exact generated TypeScript clients and types
5. add storage, realtime, and automations without custom backend code
6. ship to production with confidence

## Phase 0: Stabilize The Current Foundation

Goal: close the known scaffold gaps before expanding surface area.

### API And Auth Runtime

- [x] Verify Better Auth runtime compatibility against the exact installed package versions.
- [x] Add integration coverage for sign-up, sign-in, session refresh, sign-out, password reset, and email verification.
- [x] Confirm enabled plugin flows work end-to-end for `username`, `jwt`, `organization`, `twoFactor`, `apiKey`, `magicLink`, `socialAuth`, and `admin`.
- [x] Ensure plugin config values actually affect runtime behavior, not just saved metadata.
- [x] Add regression tests for auth invalidation and plugin reconfiguration.

### Data And Schema Safety

- [x] Lock down built-in auth/system tables so sensitive rows and fields cannot leak through generic CRUD.
- [x] Add explicit redaction coverage for secrets, tokens, hashes, verification payloads, and API-key material.
- [x] Fix generated schema fidelity for enums, references, and foreign-key actions.
- [x] Add schema/apply integration tests against a real Postgres instance.
- [x] Add migration drift detection between metadata, generated files, and live database state.

### Admin And Operator Readiness

- [x] Improve onboarding for first boot, missing env vars, and failed bootstrap states.
- [x] Improve error messages for schema preview/apply, plugin enable/disable, and data operations.
- [x] Document current guarantees and non-guarantees in the README and architecture docs.

### Exit Criteria

- [x] Fresh bootstrap works on a clean machine with documented steps only.
- [x] Core auth flows are covered by automated integration tests.
- [x] CRUD on built-in tables is safe by default.
- [x] Generated schema artifacts match executed SQL for supported field types and relations.

## Phase 1: Ship A Real App-Facing Data Plane

Goal: move from superadmin-operated CRUD to a true BaaS runtime.

### Access Model

- [x] Formalize app-facing actors: `public`, `session`, `apiKey`, `superadmin`.
- [x] Make table access policy first-class in the product, not only hidden config.
- [x] Support row ownership policies with clear ownership field setup.
- [x] Support field-level read/write visibility rules.
- [x] Support operation-level access per actor for list/get/create/update/delete.
- [x] Add policy presets for common cases:
- [x] Public read-only content
- [x] Signed-in user private records
- [x] User can read all but write own
- [x] API-key server-to-server access

### Runtime Enforcement

- [x] Split app-facing data access from admin-only management routes cleanly.
- [x] Enforce `authMode` and access policy consistently in runtime, not just preview metadata.
- [x] Ensure relation includes respect access rules and hidden fields.
- [x] Ensure filters and sorts cannot bypass visibility constraints.
- [x] Add rate limiting for anonymous and API-key traffic.

### Admin UX

- [x] Add a visual policy editor in the schema/API designer.
- [x] Add policy previews with example actors and expected allowed operations.
- [x] Add warnings for unsafe combinations, such as public access to sensitive fields.
- [x] Add ownership-field setup guidance when `scope = own` is selected.

### Exit Criteria

- [x] A non-admin app user can safely access allowed resources without touching admin routes.
- [x] Policy configuration is visible, editable, and testable from the admin UI.
- [x] Runtime authorization matches the documented contract.

## Phase 2: Make The TypeScript DX Best-In-Class

Goal: remove generic-client friction and make Authend feel native to TS apps.

### SDK Generation

- [x] Generate exact per-resource TypeScript record, create, update, and query types.
- [x] Generate strongly typed clients like `client.posts.list()` and `client.posts.create()`.
- [x] Reflect disabled operations in generated client types.
- [x] Generate relation include typing and typed filter/sort fields.
- [x] Emit rich JSDoc from table and field descriptions.
- [x] Add schema checksum/version metadata to generated artifacts.

### Client Ergonomics

- [x] Improve SDK error handling with structured typed API errors.
- [x] Support API-key auth ergonomics in the SDK without requiring custom fetch wrappers.
- [x] Expose first-class helpers for pagination, includes, and cursor-style iteration if added later.
- [x] Add environment-safe browser/server usage examples.
- [x] Publish framework examples for React, Next.js, Expo, and Node backends.

### Developer Workflow

- [x] Add a simple `authend init` or equivalent setup flow for client projects.
- [x] Add watch mode for SDK regeneration during local development.
- [x] Add CI validation for stale generated SDK artifacts.
- [x] Add better quick-start templates showing auth + data working together.

### Exit Criteria

- [x] Developers can generate a client and get end-to-end inferred types with no manual patching.
- [x] Generated clients cover the common CRUD path better than the generic runtime client.
- [x] SDK docs are enough for a new TS user to integrate without reading backend source.

## Phase 3: Complete The Core BaaS Feature Set

Goal: fill the most important missing product categories.

### Storage

- [x] Add upload endpoints for local and S3-compatible storage.
- [x] Add signed upload and signed download URL support.
- [x] Add file metadata records and attachment conventions for app tables.
- [x] Add access rules for private vs public files.
- [x] Add admin file browser, search, and deletion flows.
- [x] Add image and content-type validation plus upload size limits.

### Realtime

- [x] Add subscriptions for record create/update/delete events.
- [x] Support table-scoped and record-scoped subscriptions.
- [x] Ensure subscriptions respect the same access policies as HTTP reads.
- [x] Expose a typed realtime client API in the SDK.
- [x] Add admin diagnostics for active subscriptions and fanout health.

### Webhooks And Automations

- [x] Add outbound webhooks for auth, schema, plugin, and data events.
- [x] Add webhook signing secrets and replay protection.
- [x] Add event retry and dead-letter handling.
- [ ] Add record triggers for before/after create/update/delete hooks.
- [ ] Add operator-managed automation recipes for common backend tasks.

### Exit Criteria

- [x] Authend can support common app needs without requiring a separate storage or realtime service.
- [x] Event-driven workflows are available for both internal automation and external integrations.

## Phase 4: Level Up The Admin Product Experience

Goal: make the product easy, not just powerful.

### Schema Builder

- [ ] Replace JSON-first authoring as the primary flow with a visual schema builder.
- [ ] Add guided creation for tables, relations, enums, indexes, and defaults.
- [ ] Add migration diff review with clear before/after explanations.
- [ ] Add guarded destructive changes with backup prompts and rollback guidance.
- [ ] Add seeded sample data generation for new tables.

### API Designer

- [ ] Add visual route naming, SDK naming, tags, descriptions, and operation toggles.
- [ ] Add field picker UI for filters, sorting, hidden fields, and includes.
- [ ] Add “try it” request panels backed by the live API contract.
- [ ] Add policy-aware request examples for public, session, and API-key callers.

### Operator Experience

- [ ] Add setup wizard for first run.
- [ ] Add actionable diagnostics for email, storage, backups, crons, and AI assistant.
- [ ] Add “why is this failing?” troubleshooting surfaces in the UI.
- [ ] Add safer plugin lifecycle UX, especially for stateful plugins.

### Exit Criteria

- [ ] A new user can create tables, policies, and APIs without editing raw JSON.
- [ ] Common failure states have clear remediation paths in the UI.

## Phase 5: Production Hardening

Goal: make Authend reliable enough for serious production use.

### Observability

- [ ] Add structured request logs with request IDs and actor context.
- [ ] Add metrics for auth, CRUD, storage, realtime, and webhook flows.
- [ ] Add slow-query and failed-job visibility.
- [ ] Add admin views for operational health and recent incidents.

### Security And Abuse Controls

- [ ] Add configurable rate limiting by IP, session, and API key.
- [ ] Add brute-force protection for auth endpoints.
- [ ] Add audit coverage for policy changes, storage access, and webhook config changes.
- [ ] Add secrets redaction across logs and admin diagnostics.

### Recovery And Reliability

- [ ] Add backup restore workflows, not just backup creation.
- [ ] Add migration rollback guidance and safety checks.
- [ ] Add health probes for dependent services like SMTP and S3.
- [ ] Add failure-mode tests for partial migrations, auth misconfig, and unavailable dependencies.

### Exit Criteria

- [ ] Operators can detect, diagnose, and recover from the common failure modes.
- [ ] Security controls exist for public traffic and automation traffic.

## Phase 6: Team And Environment Workflows

Goal: support real teams, not just a solo local project.

### Environments

- [ ] Add explicit local, staging, and production config promotion guidance.
- [ ] Add migration promotion workflows across environments.
- [ ] Add environment validation before deploy.

### Teams

- [ ] Add multiple admin roles with scoped permissions.
- [ ] Add audit-friendly change attribution for every sensitive admin action.
- [ ] Add safe collaboration around schema drafts and pending changes.

### Distribution

- [ ] Add reference deployment guides for Docker, Fly.io, Railway, and VPS hosting.
- [ ] Add example reverse-proxy and TLS configurations.
- [ ] Add release/version compatibility notes between server and SDK.

### Exit Criteria

- [ ] A small team can run Authend with safe change management across environments.

## Later, Not Now

These are valid future directions, but they should not block the main roadmap:

- [ ] Multi-project hosted control plane
- [ ] Full multi-tenancy primitives
- [ ] Billing and quota productization
- [ ] User-authored serverless/edge functions
- [ ] Marketplace-style plugin installation

## Recommended Immediate Execution Order

If work starts now, the next sequence should be:

1. Phase 0: stabilize runtime and schema safety
2. Phase 1: app-facing authorization and public data plane
3. Phase 2: generated TS SDK and client ergonomics
4. Phase 3: storage (remaining: realtime, webhooks, automations), then Phase 4–6 as below
5. Phase 4: visual UX overhaul
6. Phase 5: production hardening
7. Phase 6: team and environment workflows

## Definition Of Done For The Roadmap

The roadmap is complete when all of the following are true:

- [x] Authend can serve app users directly, not just superadmins
- [x] TS clients are generated with exact per-resource types
- [x] Storage and realtime are first-class features
- [x] Event-driven integrations are supported
- [ ] The admin UI supports visual setup for schema, API, and policy design
- [ ] Production hardening and recovery workflows are in place
- [ ] Docs, tests, and examples stay aligned with the shipped behavior
