# Next.js Example (Server + Client Split)

Use this when your app has both server-side code and browser-rendered UI.

## 1) Install and generate schema

```bash
npm install @authend/sdk
npx authend-gen init
npx authend-gen generate
```

## 2) Environment variables

```env
NEXT_PUBLIC_AUTHEND_API_URL=http://localhost:7002
AUTHEND_SERVER_API_KEY=replace-with-server-key
```

- `NEXT_PUBLIC_AUTHEND_API_URL` is safe for browser bundles.
- `AUTHEND_SERVER_API_KEY` must only be used in server code.

## 3) Server client factory

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "@/generated/authend";

export function createServerAuthendClient() {
  return createAuthendClient<AuthendSchema>({
    baseURL: process.env.NEXT_PUBLIC_AUTHEND_API_URL!,
    schema: authendSchema,
    apiKey: process.env.AUTHEND_SERVER_API_KEY,
  });
}
```

## 4) Browser client factory

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "@/generated/authend";

export function createBrowserAuthendClient() {
  return createAuthendClient<AuthendSchema>({
    baseURL: process.env.NEXT_PUBLIC_AUTHEND_API_URL!,
    schema: authendSchema,
  });
}
```

## 5) Typed usage

```ts
const client = createServerAuthendClient();

const posts = await client.data.post.list();
await client.data.post.create({ title: "Hello from Next.js server action" });
```

Never import the server client factory into client components.
