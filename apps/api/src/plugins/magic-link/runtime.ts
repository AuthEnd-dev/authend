import { magicLink } from "better-auth/plugins";
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

export function composeMagicLinkServerPlugin(context: RuntimePluginContext) {
  const { state } = context;
  const sendMagicLink = context.getHandler("sendMagicLink")?.sendMagicLink;
  if (!sendMagicLink) {
    return null;
  }

  const options: Record<string, unknown> = {
    sendMagicLink,
  };

  const expiresIn = readNumber(state.config, "expiresIn");
  if (expiresIn !== undefined) {
    options.expiresIn = expiresIn;
  }

  const allowedAttempts = readNumber(state.config, "allowedAttempts");
  if (allowedAttempts !== undefined) {
    options.allowedAttempts = allowedAttempts;
  }

  const disableSignUp = readBoolean(state.config, "disableSignUp");
  if (disableSignUp !== undefined) {
    options.disableSignUp = disableSignUp;
  }

  const rateLimitWindow = readNumber(state.config, "rateLimitWindow");
  const rateLimitMax = readNumber(state.config, "rateLimitMax");
  if (rateLimitWindow !== undefined || rateLimitMax !== undefined) {
    options.rateLimit = {
      ...(rateLimitWindow !== undefined ? { window: rateLimitWindow } : {}),
      ...(rateLimitMax !== undefined ? { max: rateLimitMax } : {}),
    };
  }

  const storeToken = readString(state.config, "storeToken");
  if (storeToken === "plain" || storeToken === "hashed") {
    options.storeToken = storeToken;
  }

  const generateToken = context.getHandler("generateToken")?.generateMagicLinkToken;
  if (generateToken) {
    options.generateToken = generateToken;
  }

  return magicLink(options as {
    sendMagicLink: NonNullable<typeof sendMagicLink>;
  });
}

export function attachMagicLinkRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeServer: composeMagicLinkServerPlugin,
    composeClient: () => ["magicLink"],
  };
}
