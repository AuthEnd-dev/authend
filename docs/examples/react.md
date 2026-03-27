# React Example (Browser App)

Use this when your app calls AuthEnd directly from the browser and authenticates with Better Auth session cookies.

## 1) Install and generate schema

```bash
npm install @authend/sdk
npx authend-gen init
npx authend-gen generate
```

## 2) Environment variables

```env
VITE_AUTHEND_API_URL=http://localhost:7002
```

Only expose public base URLs in browser builds. Do not expose API keys.

## 3) Create a shared client

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

const baseURL = import.meta.env.VITE_AUTHEND_API_URL;

export const authendClient = createAuthendClient<AuthendSchema>({
  baseURL,
  schema: authendSchema,
});
```

## 4) Typed read and write calls

```ts
const posts = await authendClient.data.post.list({
  sort: "title",
});

await authendClient.data.post.create({
  title: "Hello from React",
});
```

## 5) Better Auth note

If your app already builds a Better Auth client instance, pass it with `authClient` to avoid duplicate configuration.
