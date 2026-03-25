import type { PluginConfig } from "@authend/shared";
import {
  getSocialProvider,
  isSupportedSocialProvider,
  parseSocialProviderList,
  socialProviderCatalog,
  socialProviderEnvKeys,
} from "@authend/shared";
import type { PluginDefinition } from "../types";

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readProviderConfig(config: PluginConfig, providerId: string) {
  const providers = asObject(config.providers);
  return asObject(providers[providerId]);
}

function providerEnvRequirements(config: PluginConfig, providerId: string) {
  const providerConfig = readProviderConfig(config, providerId);
  const requiredKeys: string[] = [];

  if (providerId === "tiktok") {
    if (typeof providerConfig.clientKey !== "string" || providerConfig.clientKey.length === 0) {
      requiredKeys.push(
        typeof providerConfig.clientKeyEnv === "string" && providerConfig.clientKeyEnv.length > 0
          ? providerConfig.clientKeyEnv
          : socialProviderEnvKeys(providerId)[0],
      );
    }
  } else if (typeof providerConfig.clientId !== "string" || providerConfig.clientId.length === 0) {
    requiredKeys.push(
      typeof providerConfig.clientIdEnv === "string" && providerConfig.clientIdEnv.length > 0
        ? providerConfig.clientIdEnv
        : socialProviderEnvKeys(providerId)[0],
    );
  }

  if (typeof providerConfig.clientSecret !== "string" || providerConfig.clientSecret.length === 0) {
    requiredKeys.push(
      typeof providerConfig.clientSecretEnv === "string" && providerConfig.clientSecretEnv.length > 0
        ? providerConfig.clientSecretEnv
        : socialProviderEnvKeys(providerId)[1],
    );
  }

  return requiredKeys;
}

export const socialAuthPluginDefinition: PluginDefinition = {
  id: "socialAuth",
  version: "2.0.0",
  label: "Social Sign-On",
  description: "Configure Better Auth social providers, expose sign-in and linking flows, and manage provider-specific OAuth options from one plugin.",
  category: "authentication",
  documentationUrl: "https://better-auth.com/docs/concepts/oauth",
  migrationStrategy: "none",
  dependencies: [],
  requiredEnv: [],
  allowUnknownConfigKeys: true,
  configSchema: [
    {
      key: "enabledProviders",
      label: "Enabled providers",
      type: "string",
      helpText:
        "Comma-separated provider ids. Use the provider list below or advanced JSON to add per-provider options.",
      placeholder: "google, github, discord",
      defaultValue: "",
    },
  ],
  capabilities: [
    {
      key: "core",
      label: "Social OAuth",
      description: "Enable Better Auth social sign-in, account linking, token access, and provider account info flows.",
      enabledByDefault: true,
      requires: [],
      addsModels: [],
      addsClientFeatures: ["signIn.social", "linkSocial", "getAccessToken", "accountInfo"],
      addsServerFeatures: ["socialProviders", "auth.api.signInSocial", "auth.api.linkSocialAccount"],
      addsAdminPanels: ["overview", "providers", "config"],
    },
  ],
  extensionSlots: [],
  models: [],
  adminPanels: [
    { key: "overview", label: "Overview", description: "Plugin state, docs, and health checks.", capabilityKeys: ["core"] },
    { key: "providers", label: "Providers", description: "Enabled provider list, docs, and env diagnostics.", capabilityKeys: ["core"] },
    { key: "config", label: "Config", description: "CSV provider selection plus advanced JSON overrides.", capabilityKeys: ["core"] },
  ],
  examples: [
    {
      key: "client-sign-in-social",
      title: "Start social sign-in",
      description: "Use Better Auth's built-in social sign-in flow from the client.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.signIn.social({
  provider: "google",
  callbackURL: "/app",
});`,
    },
    {
      key: "client-link-social",
      title: "Link another provider",
      description: "Request additional scopes or connect another social account for an existing user.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.linkSocial({
  provider: "github",
  scopes: ["repo"],
});`,
    },
    {
      key: "social-plugin-json-config",
      title: "Advanced provider JSON",
      description: "Use advanced JSON to configure provider-specific OAuth options and env key overrides.",
      language: "json",
      audience: "admin",
      capabilityKeys: ["core"],
      code: `{
  "enabledProviders": "google,github,tiktok",
  "providers": {
    "google": {
      "scope": ["email", "profile"],
      "prompt": "select_account"
    },
    "github": {
      "scope": ["read:user", "user:email"],
      "redirectURI": "https://example.com/api/auth/callback/github"
    },
    "tiktok": {
      "clientKeyEnv": "TIKTOK_CLIENT_KEY",
      "clientSecretEnv": "TIKTOK_CLIENT_SECRET"
    }
  }
}`,
    },
  ],
  clientNamespaces: ["social"],
  serverOperations: ["auth.signIn.social", "auth.linkSocial", "auth.getAccessToken", "auth.accountInfo"],
  defaultConfig: {
    enabledProviders: "",
  },
  defaultCapabilityState: { core: true },
  validateConfig(config, { forEnable }) {
    const enabledProviders = parseSocialProviderList(config.enabledProviders);
    const invalidProviders = enabledProviders.filter((providerId) => !isSupportedSocialProvider(providerId));
    if (invalidProviders.length > 0) {
      return `Unsupported social providers: ${invalidProviders.join(", ")}`;
    }

    const providers = config.providers;
    if (providers !== undefined && (!providers || typeof providers !== "object" || Array.isArray(providers))) {
      return "providers must be an object keyed by provider id";
    }

    if (!forEnable) {
      return null;
    }

    if (enabledProviders.length === 0) {
      return "Enable at least one social provider before enabling the plugin";
    }

    return null;
  },
  getRequiredEnv(state) {
    const enabledProviders = parseSocialProviderList(state.config.enabledProviders);
    return enabledProviders.flatMap((providerId) => providerEnvRequirements(state.config, providerId));
  },
};

export const supportedSocialProvidersSummary = socialProviderCatalog
  .map((provider) => `${provider.id}`)
  .join(", ");

export function socialProviderHelpText(providerId: string) {
  const provider = getSocialProvider(providerId);
  if (!provider) {
    return providerId;
  }
  return `${provider.label} (${provider.documentationUrl})`;
}
