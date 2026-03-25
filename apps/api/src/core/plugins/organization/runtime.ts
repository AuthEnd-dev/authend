import { organization } from "better-auth/plugins";
import type { PluginConfig } from "@authend/shared";
import type { PluginDefinition, RuntimePluginContext } from "../types";
import { ORGANIZATION_HOOK_KEYS } from "./manifest";

function readBoolean(config: PluginConfig, key: string) {
  return typeof config[key] === "boolean" ? config[key] : undefined;
}

function readNumber(config: PluginConfig, key: string) {
  return typeof config[key] === "number" ? config[key] : undefined;
}

function readString(config: PluginConfig, key: string) {
  return typeof config[key] === "string" ? config[key] : undefined;
}

export function composeOrganizationServerPlugin(context: RuntimePluginContext) {
  const { state } = context;
  const options: Record<string, unknown> = {};

  const creationHandler = context.getHandler("allowUserToCreateOrganization");
  if (creationHandler?.allowUserToCreateOrganization) {
    options.allowUserToCreateOrganization = creationHandler.allowUserToCreateOrganization;
  } else {
    options.allowUserToCreateOrganization = readBoolean(state.config, "allowUserToCreateOrganization") ?? true;
  }

  const numberOptions = ["organizationLimit", "membershipLimit", "invitationExpiresIn", "invitationLimit"];
  for (const key of numberOptions) {
    const value = readNumber(state.config, key);
    if (value !== undefined) {
      options[key] = value;
    }
  }

  const stringOptions = ["creatorRole"];
  for (const key of stringOptions) {
    const value = readString(state.config, key);
    if (value !== undefined) {
      options[key] = value;
    }
  }

  const booleanOptions = ["cancelPendingInvitationsOnReInvite", "requireEmailVerificationOnInvitation", "disableOrganizationDeletion"];
  for (const key of booleanOptions) {
    const value = readBoolean(state.config, key);
    if (value !== undefined) {
      options[key] = value;
    }
  }

  const sendInvitationEmail = context.getHandler("sendInvitationEmail")?.sendInvitationEmail;
  if (state.capabilityState.invitations && sendInvitationEmail) {
    options.sendInvitationEmail = sendInvitationEmail;
  }

  if (state.capabilityState.teams) {
    const customCreateDefaultTeam = context.getHandler("teams.defaultTeam.customCreateDefaultTeam")?.customCreateDefaultTeam;
    const teamOptions: Record<string, unknown> = {
      enabled: true,
      defaultTeam: {
        enabled: readBoolean(state.config, "createDefaultTeam") ?? true,
        ...(customCreateDefaultTeam ? { customCreateDefaultTeam } : {}),
      },
    };

    const maximumTeams = readNumber(state.config, "maximumTeams");
    if (maximumTeams !== undefined) {
      teamOptions.maximumTeams = maximumTeams;
    }

    const maximumMembersPerTeam = readNumber(state.config, "maximumMembersPerTeam");
    if (maximumMembersPerTeam !== undefined) {
      teamOptions.maximumMembersPerTeam = maximumMembersPerTeam;
    }

    const allowRemovingAllTeams = readBoolean(state.config, "allowRemovingAllTeams");
    if (allowRemovingAllTeams !== undefined) {
      teamOptions.allowRemovingAllTeams = allowRemovingAllTeams;
    }

    options.teams = teamOptions;
  }

  if (state.capabilityState.dynamicAccessControl) {
    const accessHandler = context.getHandler("ac");
    const dynamicAccessControl: Record<string, unknown> = {
      enabled: true,
    };
    const maximumRolesPerOrganization = readNumber(state.config, "maximumRolesPerOrganization");
    if (maximumRolesPerOrganization !== undefined) {
      dynamicAccessControl.maximumRolesPerOrganization = maximumRolesPerOrganization;
    }
    if (accessHandler?.ac) {
      options.dynamicAccessControl = dynamicAccessControl;
      options.ac = accessHandler.ac;
      if (accessHandler.roles) {
        options.roles = accessHandler.roles;
      }
    } else {
      options.dynamicAccessControl = dynamicAccessControl;
    }
  }

  const organizationHooks: Record<string, unknown> = {};
  for (const hookKey of ORGANIZATION_HOOK_KEYS) {
    const slot = `organizationHooks.${hookKey}`;
    const hook = context.getHandler(slot)?.organizationHook;
    if (!hook) {
      continue;
    }
    organizationHooks[hookKey] = hook;
  }

  if (Object.keys(organizationHooks).length > 0) {
    options.organizationHooks = organizationHooks;
  }

  return organization(options);
}

export function attachOrganizationRuntime(definition: PluginDefinition): PluginDefinition {
  return {
    ...definition,
    composeServer: composeOrganizationServerPlugin,
    composeClient: (state) => {
      const features = ["organization"];
      if (state.capabilityState.invitations) {
        features.push("organization.invitations");
      }
      if (state.capabilityState.teams) {
        features.push("organization.teams");
      }
      if (state.capabilityState.dynamicAccessControl) {
        features.push("organization.checkRolePermission");
      }
      if (state.capabilityState.activeOrganization) {
        features.push("organization.setActiveOrganization");
      }
      if (state.capabilityState.activeTeam) {
        features.push("organization.setActiveTeam");
      }
      return features;
    },
  };
}
