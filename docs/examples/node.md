# Node Backend Example (Server-to-Server)

Use this in backend services, jobs, or scripts that call Authend with API key auth.

## 1) Install and generate schema

```bash
npm install @authend/sdk
npx authend-gen init
npx authend-gen generate
```

## 2) Environment variables

```env
AUTHEND_API_URL=http://localhost:7002
AUTHEND_API_KEY=replace-with-server-key
```

Treat both values as server configuration and never expose them to browser bundles.

## 3) Client factory

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

export function createAuthendServerClient() {
  return createAuthendClient<AuthendSchema>({
    baseURL: process.env.AUTHEND_API_URL!,
    schema: authendSchema,
    apiKey: process.env.AUTHEND_API_KEY!,
  });
}
```

## 4) Typed usage

```ts
const client = createAuthendServerClient();

const posts = await client.data.post.list({ pageSize: 25 });
await client.data.post.create({ title: "Hello from Node worker" });
```

This pattern works for cron jobs, queues, and service-to-service sync tasks.
