import type { PluginConfig } from "@authend/shared";
import { parseSocialProviderList, socialProviderEnvKeys } from "@authend/shared";
import type { PluginDefinition, RuntimePluginContext } from "../types";

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readBoolean(config: Record<string, unknown>, key: string) {
  return typeof config[key] === "boolean" ? config[key] : undefined;
}

function readString(config: Record<string, unknown>, key: string) {
  return typeof config[key] === "string" && config[key].length > 0 ? config[key] : undefined;
}

function readScope(config: Record<string, unknown>) {
  if (Array.isArray(config.scope)) {
    return config.scope.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }

  if (typeof config.scope === "string") {
    return config.scope
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return undefined;
}

function readProvidersConfig(config: PluginConfig) {
  return asObject(config.providers);
}

function readProviderConfig(config: PluginConfig, providerId: string) {
  const providers = readProvidersConfig(config);
  return asObject(providers[providerId]);
}

function envValue(key: string) {
  const value = process.env[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function providerCredentials(providerId: string, providerConfig: Record<string, unknown>) {
  const [defaultClientKey, defaultSecretKey] = socialProviderEnvKeys(providerId);
  const clientSecret =
    readString(providerConfig, "clientSecret") ??
    envValue(readString(providerConfig, "clientSecretEnv") ?? defaultSecretKey);

  if (providerId === "tiktok") {
    const clientKey =
      readString(providerConfig, "clientKey") ??
      envValue(readString(providerConfig, "clientKeyEnv") ?? defaultClientKey);

    if (!clientKey || !clientSecret) {
      return null;
    }

    return {
      clientKey,
      clientSecret,
    };
  }

  const clientId =
    readString(providerConfig, "clientId") ??
    envValue(readString(providerConfig, "clientIdEnv") ?? defaultClientKey);

  if (!clientId || !clientSecret) {
    return null;
  }

  return {
    clientId,
    clientSecret,
  };
}

function buildProviderOptions(config: PluginConfig, providerId: string) {
  const providerConfig = readProviderConfig(config, providerId);
  const credentials = providerCredentials(providerId, providerConfig);
  if (!credentials) {
    return null;
  }

  const options: Record<string, unknown> = {
    ...credentials,
  };

  const scope = readScope(providerConfig);
  if (scope && scope.length > 0) {
    options.scope = scope;
  }

  const passthroughKeys = [
    "issuer",
    "redirectURI",
    "prompt",
    "responseMode",
    "verifyIdToken",
    "disableSignUp",
    "disableIdTokenSignIn",
    "overrideUserInfoOnSignIn",
    "disableImplicitSignUp",
    "disableDefaultScope",
  ] as const;

  for (const key of passthroughKeys) {
    const booleanValue = readBoolean(providerConfig, key);
    if (booleanValue !== undefined) {
      options[key] = booleanValue;
      continue;
    }

    const stringValue = readString(providerConfig, key);
    if (stringValue !== undefined) {
      options[key] = stringValue;
    }
  }

  for (const [key, value] of Object.entries(providerConfig)) {
    if (
      key === "clientId" ||
      key === "clientSecret" ||
      key === "clientKey" ||
      key === "clientIdEnv" ||
      key === "clientSecretEnv" ||
      key === "clientKeyEnv" ||
      key === "scope"
    ) {
      continue;
    }

    if (options[key] !== undefined) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      options[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      options[key] = value;
    }
  }

  return options;
}

export function composeSocialAuthOptions(context: RuntimePluginContext) {
  const enabledProviders = parseSocialProviderList(context.state.config.enabledProviders);
  if (enabledProviders.length === 0) {
    return null;
  }

  const socialProviders = Object.fromEntries(
    enabledProviders
      .map((providerId) => {
        const options = buildProviderOptions(context.state.config, providerId);
        return options ? [providerId, options] : null;
      })
      .filter((entry): entry is [string, Record<string, unknown>] => entry !== null),
  );

  if (Object.keys(socialProviders).length === 0) {
    return null;
  }

  return {
    socialProviders,
  };
}

export function attachSocialAuthRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeAuthOptions: composeSocialAuthOptions,
    composeClient: () => ["social"],
  };
}
