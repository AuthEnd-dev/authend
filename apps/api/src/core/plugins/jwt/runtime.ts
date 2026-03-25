import { jwt } from "better-auth/plugins";
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

export function composeJwtServerPlugin(context: RuntimePluginContext) {
  const { state } = context;
  const options: Record<string, unknown> = {};

  const jwksOptions: Record<string, unknown> = {};
  const remoteUrl = readString(state.config, "remoteUrl");
  if (remoteUrl) {
    jwksOptions.remoteUrl = remoteUrl;
  }
  const disablePrivateKeyEncryption = readBoolean(state.config, "disablePrivateKeyEncryption");
  if (disablePrivateKeyEncryption !== undefined) {
    jwksOptions.disablePrivateKeyEncryption = disablePrivateKeyEncryption;
  }
  const rotationInterval = readNumber(state.config, "rotationInterval");
  if (rotationInterval !== undefined) {
    jwksOptions.rotationInterval = rotationInterval;
  }
  const gracePeriod = readNumber(state.config, "gracePeriod");
  if (gracePeriod !== undefined) {
    jwksOptions.gracePeriod = gracePeriod;
  }
  const jwksPath = readString(state.config, "jwksPath");
  if (jwksPath) {
    jwksOptions.jwksPath = jwksPath;
  }
  if (Object.keys(jwksOptions).length > 0) {
    options.jwks = jwksOptions;
  }

  const jwtOptions: Record<string, unknown> = {};
  const issuer = readString(state.config, "issuer");
  if (issuer) {
    jwtOptions.issuer = issuer;
  }
  const audience = readString(state.config, "audience");
  if (audience) {
    jwtOptions.audience = audience;
  }
  const expirationTime = readString(state.config, "expirationTime");
  if (expirationTime) {
    jwtOptions.expirationTime = expirationTime;
  }

  const definePayload = context.getHandler("jwt.definePayload")?.jwtDefinePayload;
  if (definePayload) {
    jwtOptions.definePayload = definePayload;
  }
  const getSubject = context.getHandler("jwt.getSubject")?.jwtGetSubject;
  if (getSubject) {
    jwtOptions.getSubject = getSubject;
  }
  const sign = context.getHandler("jwt.sign")?.jwtSign;
  if (sign) {
    jwtOptions.sign = sign;
  }
  if (Object.keys(jwtOptions).length > 0) {
    options.jwt = jwtOptions;
  }

  const disableSettingJwtHeader = readBoolean(state.config, "disableSettingJwtHeader");
  if (disableSettingJwtHeader !== undefined) {
    options.disableSettingJwtHeader = disableSettingJwtHeader;
  }

  return jwt(options);
}

export function attachJwtRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeServer: composeJwtServerPlugin,
    composeClient: () => ["jwt"],
  };
}
