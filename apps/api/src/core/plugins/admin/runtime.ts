import { admin } from "better-auth/plugins";
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

function readStringArray(config: PluginConfig, key: string) {
  const value = config[key];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return undefined;
}

export function composeAdminServerPlugin(context: RuntimePluginContext) {
  const { state } = context;
  const options: Record<string, unknown> = {};

  const stringKeys = ["defaultRole", "defaultBanReason", "bannedUserMessage"];
  for (const key of stringKeys) {
    const value = readString(state.config, key);
    if (value) {
      options[key] = value;
    }
  }

  const numberKeys = ["defaultBanExpiresIn", "impersonationSessionDuration"];
  for (const key of numberKeys) {
    const value = readNumber(state.config, key);
    if (value !== undefined) {
      options[key] = value;
    }
  }

  const allowImpersonatingAdmins = readBoolean(state.config, "allowImpersonatingAdmins");
  if (allowImpersonatingAdmins !== undefined) {
    options.allowImpersonatingAdmins = allowImpersonatingAdmins;
  }

  const adminRoles = readStringArray(state.config, "adminRoles");
  if (adminRoles && adminRoles.length > 0) {
    options.adminRoles = adminRoles;
  }

  const adminUserIds = readStringArray(state.config, "adminUserIds");
  if (adminUserIds && adminUserIds.length > 0) {
    options.adminUserIds = adminUserIds;
  }

  const accessHandler = context.getHandler("admin.ac");
  if (accessHandler?.ac) {
    options.ac = accessHandler.ac;
    if (accessHandler.roles) {
      options.roles = accessHandler.roles;
    }
  }

  return admin(options);
}

export function attachAdminRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeServer: composeAdminServerPlugin,
    composeClient: () => ["admin"],
  };
}
