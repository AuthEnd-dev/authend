# @authend/sdk

Typed Authend client for external web, mobile, and server projects.

`@authend/sdk` is intentionally small:

- `auth`: Better Auth client access
- `data`: typed Authend resource access

It does not expose the admin control-plane surface.

## Install

```bash
npm install @authend/sdk
```

## Quick start

Initialize config once, then generate types:

```bash
npx authend-gen init
npx authend-gen generate
```

Use `init` for first-time setup in a client project. After that, run `generate` whenever your backend schema changes.

## How it works

The SDK uses two pieces:

1. The runtime client from `@authend/sdk`
2. Generated types from your deployed Authend backend

Your backend exposes a schema manifest at:

```txt
GET /api/system/sdk-schema
```

The generator downloads that manifest and creates local TypeScript types for your tables and API resources.

## Generate types

Create `authend.config.json` in your app:

```json
{
  "apiUrl": "http://localhost:7002",
  "output": "./src/generated/authend.ts"
}
```

Then run:

```bash
npx authend-gen generate
```

You can also add it to your app scripts:

```json
{
  "scripts": {
    "authend:generate": "authend-gen generate"
  }
}
```

To create the config file automatically:

```bash
npx authend-gen init
```

## Framework examples

See end-to-end setup guides:

- React: `docs/examples/react.md`
- Next.js: `docs/examples/nextjs.md`
- Expo: `docs/examples/expo.md`
- Node backend: `docs/examples/node.md`

## Usage

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

const client = createAuthendClient<AuthendSchema>({
  baseURL: "http://localhost:7002",
  schema: authendSchema,
});

const posts = await client.data.post.list();
const post = await client.data.post.get("post_123");

await client.data.post.create({
  title: "Hello",
});
```

Generated resources now also carry typed filter, sort, and include unions. If `post` exposes an `author` include and `title` sort field, TypeScript narrows those inputs automatically:

```ts
const posts = await client.data.post.list({
  sort: "title",
  filterField: "title",
  include: "author",
});
```

## Generated vs generic client

For common CRUD flows, generated resource access is preferred:

- `client.data.post.list()` gives table-specific record typing and narrowed query fields.
- `client.data.post.create(...)` enforces typed create payloads.
- Disabled operations become `never` at compile time.

The generic fallback (`client.data.resource("post")`) remains available for dynamic cases, but it intentionally falls back to `DataRecord` typing.

## Auth

`client.auth` uses Better Auth client plugins.

```ts
await client.auth.signIn.email({
  email: "me@example.com",
  password: "secret",
});
```

If you already have your own Better Auth client configured, pass it in:

```ts
import { createAuthendClient } from "@authend/sdk";
import { auth } from "./auth";
import { authendSchema, type AuthendSchema } from "./generated/authend";

const client = createAuthendClient<AuthendSchema>({
  baseURL: "http://localhost:7002",
  schema: authendSchema,
  authClient: auth,
});
```

This is the recommended pattern for mobile apps like Expo projects.

## Environment-safe usage

Use different client setup patterns for browser and server runtimes.

### Browser-safe client

Only use a public base URL in browser bundles.

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

const client = createAuthendClient<AuthendSchema>({
  baseURL: import.meta.env.VITE_AUTHEND_API_URL,
  schema: authendSchema,
});
```

Do not configure `apiKey` in browser code.

### Server client (Node/SSR/API routes)

Use a server-only API key from non-public environment variables.

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

const client = createAuthendClient<AuthendSchema>({
  baseURL: process.env.AUTHEND_API_URL!,
  schema: authendSchema,
  apiKey: process.env.AUTHEND_API_KEY!,
});
```

### SSR and edge notes

- Keep server client factories in server-only modules.
- In frameworks like Next.js, separate client/browser factories to prevent leaking server env vars.
- You can pass a custom `fetch` implementation with `fetch` option if your runtime needs one.

### Anti-patterns

- Putting `AUTHEND_API_KEY` in `NEXT_PUBLIC_*`, `VITE_*`, or `EXPO_PUBLIC_*` variables.
- Reusing a server factory in client-rendered components.
- Assuming authenticated browser sessions and API-key server access are interchangeable.

## Framework guides

See framework-specific integration guides in the Authend repo docs:

- React: `docs/examples/react.md`
- Next.js: `docs/examples/nextjs.md`
- Expo: `docs/examples/expo.md`
- Node backend: `docs/examples/node.md`

## Runtime shape

```ts
const client = createAuthendClient(...);

client.auth
client.data
client.storage
```

## Storage

The SDK now exposes a first-class storage client:

```ts
const uploaded = await client.storage.upload({
  file,
  fileName: "avatar.png",
  visibility: "private",
  prefix: "avatars",
});

const signedUpload = await client.storage.createSignedUploadUrl({
  key: "avatars/user_123.png",
  contentType: "image/png",
  expiresIn: 900,
});

const signedDownload = await client.storage.createSignedDownloadUrl({
  key: uploaded.key,
  expiresIn: 900,
});

const head = await client.storage.head({ key: uploaded.key });
await client.storage.remove({ key: uploaded.key });
```

Available methods:

- `upload({ file, fileName?, mimeType?, visibility?, prefix? })`
- `createSignedUploadUrl({ key, contentType?, visibility?, expiresIn? })`
- `createSignedDownloadUrl({ key, expiresIn? })`
- `head({ key })`
- `remove({ key })`

`client.data` supports:

- typed dot-notation access when you pass generated schema
- dynamic fallback access through `client.data.resource("table")`

Examples:

```ts
await client.data.post.list();
await client.data.resource("post").list();
await client.data.meta("post");
await client.data.tables();
```

## What gets generated

The generator emits:

- record types
- create input types
- update input types
- list param types
- include metadata types
- runtime schema metadata used for typed dot-notation
- schema checksum and schema version constants

Example generated output:

```ts
export interface PostRecord {
  id: string;
  title: string;
}

export type PostCreateInput = {
  title: string;
};

export const authendSchemaVersion = "2";
export const authendSchemaChecksum = "...";
```

## CLI

The package ships with `authend-gen`.

Available commands:

- `authend-gen init`
- `authend-gen generate`
- `authend-gen watch`

Optional flags for `generate`:

- `--api-url`
- `--output`
- `--schema-output`

Optional flags for `watch`:

- `--api-url`
- `--output`
- `--schema-output`
- `--interval` (milliseconds, default `2000`)

## Validation commands

If you are maintaining an integration in CI, these root-level commands validate the generated SDK contract end-to-end:

```bash
bun run test:sdk
bun run typecheck:sdk
bun run ci:sdk-dist-clean
```

Or run everything together:

```bash
bun run ci:sdk
```

## Notes

- The SDK is for external consumers.
- The admin dashboard uses its own control-plane methods on top of the same backend.
- Full typing depends on the generated schema matching your deployed backend.
