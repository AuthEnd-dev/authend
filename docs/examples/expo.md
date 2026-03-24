# Expo Example (Mobile App)

Use this when integrating Authend in an Expo React Native app.

## 1) Install and generate schema

```bash
npm install @authend/sdk
npx authend-gen init
npx authend-gen generate
```

## 2) Environment variables

```env
EXPO_PUBLIC_AUTHEND_API_URL=http://localhost:7002
```

Only expose public base URLs in Expo public env vars. Keep API keys server-side.

## 3) Client factory

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

export const authendClient = createAuthendClient<AuthendSchema>({
  baseURL: process.env.EXPO_PUBLIC_AUTHEND_API_URL!,
  schema: authendSchema,
});
```

## 4) Typed usage

```ts
const posts = await authendClient.data.post.list();

await authendClient.data.post.create({
  title: "Hello from Expo",
});
```

## 5) Better Auth note

For mobile auth flows, prefer passing your app's existing Better Auth client via `authClient`.
