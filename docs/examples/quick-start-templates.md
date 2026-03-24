# Quick-start templates (auth + data)

These templates show the minimum structure to get both auth and typed data calls working quickly.

## React template

1. `npm install @authend/sdk`
2. `npx authend-gen init && npx authend-gen generate`
3. Create `src/lib/authend.ts`:

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "../generated/authend";

export const authendClient = createAuthendClient<AuthendSchema>({
  baseURL: import.meta.env.VITE_AUTHEND_API_URL,
  schema: authendSchema,
});
```

4. Use both auth and data:

```ts
await authendClient.auth.signIn.email({ email, password });
const posts = await authendClient.data.post.list();
```

## Next.js template

1. `npm install @authend/sdk`
2. `npx authend-gen init && npx authend-gen generate`
3. Create `src/lib/authend-server.ts`:

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "@/generated/authend";

export const authendServerClient = createAuthendClient<AuthendSchema>({
  baseURL: process.env.NEXT_PUBLIC_AUTHEND_API_URL!,
  schema: authendSchema,
  apiKey: process.env.AUTHEND_SERVER_API_KEY!,
});
```

4. Use auth + data in server actions/routes:

```ts
await authendServerClient.auth.getSession();
await authendServerClient.data.post.create({ title: "Hello" });
```

## Node backend template

1. `npm install @authend/sdk`
2. `npx authend-gen init && npx authend-gen generate`
3. Create `src/authend.ts`:

```ts
import { createAuthendClient } from "@authend/sdk";
import { authendSchema, type AuthendSchema } from "./generated/authend";

export const authendClient = createAuthendClient<AuthendSchema>({
  baseURL: process.env.AUTHEND_API_URL!,
  schema: authendSchema,
  apiKey: process.env.AUTHEND_API_KEY!,
});
```

4. Use auth + data in jobs/services:

```ts
await authendClient.auth.getSession();
await authendClient.data.post.list();
```
