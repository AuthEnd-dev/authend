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

## Runtime shape

```ts
const client = createAuthendClient(...);

client.auth
client.data
```

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
- runtime schema metadata used for typed dot-notation

Example generated output:

```ts
export interface PostRecord {
  id: string;
  title: string;
}

export type PostCreateInput = {
  title: string;
};
```

## CLI

The package ships with `authend-gen`.

Available commands:

- `authend-gen init`
- `authend-gen generate`

Optional flags for `generate`:

- `--api-url`
- `--output`
- `--schema-output`

## Notes

- The SDK is for external consumers.
- The admin dashboard uses its own control-plane methods on top of the same backend.
- Full typing depends on the generated schema matching your deployed backend.
