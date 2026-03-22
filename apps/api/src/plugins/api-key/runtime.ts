import { apiKey } from "@better-auth/api-key";
import type { PluginConfig } from "@authend/shared";
import type { PluginDefinition, RuntimePluginContext } from "../types";

function readBoolean(config: PluginConfig, key: string) {
  return typeof config[key] === "boolean" ? config[key] : undefined;
}

function readNumber(config: PluginConfig, key: string) {
  return typeof config[key] === "number" ? config[key] : undefined;
}

function readString(config: PluginConfig, key: string) {
  return typeof config[key] === "string" ? config[key] : undefined;
}

export function composeApiKeyServerPlugin(context: RuntimePluginContext) {
  const { state } = context;
  const configuration: Record<string, unknown> = {};

  const stringKeys = ["configId", "defaultPrefix"];
  for (const key of stringKeys) {
    const value = readString(state.config, key);
    if (value) {
      configuration[key] = value;
    }
  }

  const references = readString(state.config, "references");
  if (references === "user" || references === "organization") {
    configuration.references = references;
  }

  const storage = readString(state.config, "storage");
  if (storage === "database" || storage === "secondary-storage") {
    configuration.storage = storage;
  }

  const numberKeys = [
    "defaultKeyLength",
    "maximumPrefixLength",
    "minimumPrefixLength",
    "maximumNameLength",
    "minimumNameLength",
  ];
  for (const key of numberKeys) {
    const value = readNumber(state.config, key);
    if (value !== undefined) {
      configuration[key] = value;
    }
  }

  const booleanKeys = [
    "requireName",
    "enableMetadata",
    "enableSessionForAPIKeys",
    "fallbackToDatabase",
    "deferUpdates",
    "disableKeyHashing",
  ];
  for (const key of booleanKeys) {
    const value = readBoolean(state.config, key);
    if (value !== undefined) {
      configuration[key] = value;
    }
  }

  const keyExpiration: Record<string, unknown> = {};
  const defaultExpiresIn = readNumber(state.config, "defaultExpiresIn");
  if (defaultExpiresIn !== undefined) {
    keyExpiration.defaultExpiresIn = defaultExpiresIn;
  }
  const disableCustomExpiresTime = readBoolean(state.config, "disableCustomExpiresTime");
  if (disableCustomExpiresTime !== undefined) {
    keyExpiration.disableCustomExpiresTime = disableCustomExpiresTime;
  }
  const minExpiresIn = readNumber(state.config, "minExpiresIn");
  if (minExpiresIn !== undefined) {
    keyExpiration.minExpiresIn = minExpiresIn;
  }
  const maxExpiresIn = readNumber(state.config, "maxExpiresIn");
  if (maxExpiresIn !== undefined) {
    keyExpiration.maxExpiresIn = maxExpiresIn;
  }
  if (Object.keys(keyExpiration).length > 0) {
    configuration.keyExpiration = keyExpiration;
  }

  const rateLimit: Record<string, unknown> = {};
  const rateLimitEnabled = readBoolean(state.config, "rateLimitEnabled");
  if (rateLimitEnabled !== undefined) {
    rateLimit.enabled = rateLimitEnabled;
  }
  const rateLimitTimeWindow = readNumber(state.config, "rateLimitTimeWindow");
  if (rateLimitTimeWindow !== undefined) {
    rateLimit.timeWindow = rateLimitTimeWindow;
  }
  const rateLimitMax = readNumber(state.config, "rateLimitMax");
  if (rateLimitMax !== undefined) {
    rateLimit.maxRequests = rateLimitMax;
  }
  if (Object.keys(rateLimit).length > 0) {
    configuration.rateLimit = rateLimit;
  }

  const customAPIKeyGetter = context.getHandler("apiKey.customAPIKeyGetter")?.customAPIKeyGetter;
  if (customAPIKeyGetter) {
    configuration.customAPIKeyGetter = customAPIKeyGetter;
  }
  const customAPIKeyValidator = context.getHandler("apiKey.customAPIKeyValidator")?.customAPIKeyValidator;
  if (customAPIKeyValidator) {
    configuration.customAPIKeyValidator = customAPIKeyValidator;
  }
  const customKeyGenerator = context.getHandler("apiKey.customKeyGenerator")?.customKeyGenerator;
  if (customKeyGenerator) {
    configuration.customKeyGenerator = customKeyGenerator;
  }
  const defaultPermissions = context.getHandler("apiKey.defaultPermissions")?.defaultPermissions;
  if (defaultPermissions) {
    configuration.permissions = {
      defaultPermissions,
    };
  }

  return apiKey(configuration);
}

export function attachApiKeyRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeServer: composeApiKeyServerPlugin,
    composeClient: () => ["apiKey"],
  };
}
