import { twoFactor } from "better-auth/plugins";
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

export function composeTwoFactorServerPlugin(_context: RuntimePluginContext) {
  const state = _context.state;
  const options: Record<string, unknown> = {};

  const issuer = readString(state.config, "issuer");
  if (issuer) {
    options.issuer = issuer;
  }

  const skipVerificationOnEnable = readBoolean(state.config, "skipVerificationOnEnable");
  if (skipVerificationOnEnable !== undefined) {
    options.skipVerificationOnEnable = skipVerificationOnEnable;
  }

  const twoFactorCookieMaxAge = readNumber(state.config, "twoFactorCookieMaxAge");
  if (twoFactorCookieMaxAge !== undefined) {
    options.twoFactorCookieMaxAge = twoFactorCookieMaxAge;
  }

  const trustDeviceMaxAge = readNumber(state.config, "trustDeviceMaxAge");
  if (trustDeviceMaxAge !== undefined) {
    options.trustDeviceMaxAge = trustDeviceMaxAge;
  }

  const totpOptions: Record<string, unknown> = {};
  const totpDigits = readNumber(state.config, "totpDigits");
  if (totpDigits !== undefined) {
    totpOptions.digits = totpDigits;
  }
  const totpPeriod = readNumber(state.config, "totpPeriod");
  if (totpPeriod !== undefined) {
    totpOptions.period = totpPeriod;
  }
  if (Object.keys(totpOptions).length > 0) {
    options.totpOptions = totpOptions;
  }

  const otpOptions: Record<string, unknown> = {};
  const otpDigits = readNumber(state.config, "otpDigits");
  if (otpDigits !== undefined) {
    otpOptions.digits = otpDigits;
  }
  const otpPeriod = readNumber(state.config, "otpPeriod");
  if (otpPeriod !== undefined) {
    otpOptions.period = otpPeriod;
  }
  if (Object.keys(otpOptions).length > 0) {
    options.otpOptions = otpOptions;
  }

  return twoFactor(options);
}

export function attachTwoFactorRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeServer: composeTwoFactorServerPlugin,
    composeClient: () => ["twoFactor"],
  };
}
