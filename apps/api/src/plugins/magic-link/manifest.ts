import type { PluginDefinition } from "../types";

export const magicLinkPluginDefinition: PluginDefinition = {
  id: "magicLink",
  version: "2.0.0",
  label: "Magic Link",
  description: "Passwordless sign-in through email-delivered magic links with configurable delivery and token settings.",
  category: "authentication",
  documentationUrl: "https://www.better-auth.com/docs/plugins/magic-link",
  migrationStrategy: "none",
  dependencies: [],
  requiredEnv: [],
  configSchema: [
    { key: "expiresIn", label: "Expires in", type: "number", helpText: "Magic-link expiration time in seconds.", defaultValue: 300 },
    { key: "allowedAttempts", label: "Allowed attempts", type: "number", helpText: "Maximum number of token verification attempts.", defaultValue: 1 },
    { key: "disableSignUp", label: "Disable sign-up", type: "boolean", helpText: "Only allow magic links for existing users.", defaultValue: false },
    { key: "rateLimitWindow", label: "Rate limit window", type: "number", helpText: "Magic-link request rate-limit window in seconds.", defaultValue: 60 },
    { key: "rateLimitMax", label: "Rate limit max", type: "number", helpText: "Maximum magic-link requests per window.", defaultValue: 5 },
    { key: "storeToken", label: "Store token", type: "string", helpText: "Use `plain` or `hashed` token storage.", defaultValue: "plain" },
  ],
  capabilities: [
    {
      key: "core",
      label: "Magic links",
      description: "Passwordless sign-in using email links and configurable delivery handlers.",
      enabledByDefault: true,
      requires: [],
      addsModels: [],
      addsClientFeatures: ["magicLink"],
      addsServerFeatures: ["magic link email flow", "magic link verification"],
      addsAdminPanels: ["overview", "delivery"],
    },
  ],
  extensionSlots: [
    {
      key: "sendMagicLink",
      label: "Send magic link",
      description: "Bind the email-delivery implementation used to send magic links.",
      kind: "notification",
      required: true,
      defaultHandlerId: "authend.sendMagicLinkEmail",
      handlerIds: [],
      inputSchema: {
        email: "Recipient email address",
        url: "Verification URL",
        token: "Raw magic-link token",
      },
      exampleLanguage: "ts",
      exampleTitle: "Send branded magic-link emails",
      exampleDescription: "Swap in your own email provider without changing the Better Auth runtime.",
      exampleCode: `export const brandedMagicLinkEmail = {
  id: "custom.brandedMagicLinkEmail",
  label: "Send branded magic-link email",
  description: "Uses the app mailer to send magic links.",
  slotKeys: ["sendMagicLink"],
  build: () => ({
    id: "custom.brandedMagicLinkEmail",
    sendMagicLink: async ({ email, url }) => {
      await sendAppEmail({
        to: email,
        subject: "Sign in to Acme",
        template: "magic-link",
        data: { url },
      });
    },
  }),
};`,
    },
    {
      key: "generateToken",
      label: "Generate token",
      description: "Bind a custom function to generate the stored magic-link token.",
      kind: "hook",
      required: false,
      handlerIds: [],
      inputSchema: {
        email: "Recipient email address",
        returns: "token string",
      },
      exampleLanguage: "ts",
      exampleTitle: "Use a custom token format",
      exampleDescription: "Generate signed or prefixed tokens if your delivery flow requires it.",
      exampleCode: `export const customMagicLinkToken = {
  id: "custom.magicLinkToken",
  label: "Custom magic-link token",
  description: "Generates a custom token format for magic links.",
  slotKeys: ["generateToken"],
  build: () => ({
    id: "custom.magicLinkToken",
    generateMagicLinkToken: async (email) => \`ml_\${await signToken({ email })}\`,
  }),
};`,
    },
  ],
  models: [],
  adminPanels: [
    { key: "overview", label: "Overview", description: "Plugin state, docs, and config.", capabilityKeys: ["core"] },
    { key: "delivery", label: "Delivery", description: "Email delivery and rate-limiting settings.", capabilityKeys: ["core"] },
  ],
  examples: [
    {
      key: "client-magic-link",
      title: "Send a magic link",
      description: "Trigger passwordless email login through the Better Auth client namespace.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.magicLink.signIn({
  email: "dev@example.com",
});`,
    },
    {
      key: "client-verify-magic-link",
      title: "Verify a magic link",
      description: "Verify the magic-link token from the Better Auth client namespace.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.magicLink.verify({
  token,
});`,
    },
  ],
  clientNamespaces: ["magicLink"],
  serverOperations: ["auth.magicLink"],
  defaultConfig: {
    expiresIn: 300,
    allowedAttempts: 1,
    disableSignUp: false,
    rateLimitWindow: 60,
    rateLimitMax: 5,
    storeToken: "plain",
  },
  defaultCapabilityState: { core: true },
  defaultExtensionBindings: {
    sendMagicLink: "authend.sendMagicLinkEmail",
  },
};
