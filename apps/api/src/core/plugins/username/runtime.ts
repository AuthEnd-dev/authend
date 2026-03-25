import { username } from "better-auth/plugins";
import type { PluginConfig } from "@authend/shared";
import type { PluginDefinition, RuntimePluginContext } from "../types";

function readNumber(config: PluginConfig, key: string) {
  return typeof config[key] === "number" ? config[key] : undefined;
}

function readString(config: PluginConfig, key: string) {
  return typeof config[key] === "string" ? config[key] : undefined;
}

export function composeUsernameServerPlugin(context: RuntimePluginContext) {
  const { state } = context;
  const options: Record<string, unknown> = {};

  const minUsernameLength = readNumber(state.config, "minUsernameLength");
  if (minUsernameLength !== undefined) {
    options.minUsernameLength = minUsernameLength;
  }

  const maxUsernameLength = readNumber(state.config, "maxUsernameLength");
  if (maxUsernameLength !== undefined) {
    options.maxUsernameLength = maxUsernameLength;
  }

  const usernameValidationOrder = readString(state.config, "usernameValidationOrder");
  const displayUsernameValidationOrder = readString(state.config, "displayUsernameValidationOrder");
  const isValidValidationOrder = (value?: string) => value === "pre-normalization" || value === "post-normalization";
  if (isValidValidationOrder(usernameValidationOrder) || isValidValidationOrder(displayUsernameValidationOrder)) {
    options.validationOrder = {
      ...(isValidValidationOrder(usernameValidationOrder) ? { username: usernameValidationOrder } : {}),
      ...(isValidValidationOrder(displayUsernameValidationOrder) ? { displayUsername: displayUsernameValidationOrder } : {}),
    };
  }

  const usernameValidator = context.getHandler("usernameValidator")?.usernameValidator;
  if (usernameValidator) {
    options.usernameValidator = usernameValidator;
  }

  const displayUsernameValidator = context.getHandler("displayUsernameValidator")?.displayUsernameValidator;
  if (displayUsernameValidator) {
    options.displayUsernameValidator = displayUsernameValidator;
  }

  const usernameNormalization = context.getHandler("usernameNormalization")?.usernameNormalization;
  if (usernameNormalization) {
    options.usernameNormalization = usernameNormalization;
  }

  const displayUsernameNormalization = context.getHandler("displayUsernameNormalization")?.displayUsernameNormalization;
  if (displayUsernameNormalization) {
    options.displayUsernameNormalization = displayUsernameNormalization;
  }

  return username(options);
}

export function attachUsernameRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeServer: composeUsernameServerPlugin,
    composeClient: () => ["username"],
  };
}
