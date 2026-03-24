# SDK Integration Examples

This folder contains framework-focused guides for integrating `@authend/sdk`.

All guides follow the same structure:

1. install SDK and generate typed schema
2. define environment variables (`public` vs `server-only`)
3. create a shared client factory
4. perform a minimal typed read and write call
5. wire Better Auth notes where needed

Use these guides:

- [React](./react.md)
- [Next.js](./nextjs.md)
- [Expo](./expo.md)
- [Node backend](./node.md)
- [Quick-start templates (auth + data)](./quick-start-templates.md)

## Canonical SDK Generate Flow

```bash
npm install @authend/sdk
npx authend-gen init
npx authend-gen generate
```

`authend-gen init` creates `authend.config.json`, and `authend-gen generate` writes local typed schema artifacts consumed by `createAuthendClient`.
