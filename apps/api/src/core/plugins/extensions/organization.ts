import { createAccessControl } from "better-auth/plugins";
import { env } from "../../config/env";
import { sendEmail } from "../../lib/email";
import type { ExtensionHandlerDefinition } from "../types";

// This is the default extension entry point for organization plugin policies and hooks.
const orgStatements = {
  organization: ["update", "delete"] as const,
  member: ["create", "update", "delete"] as const,
  invitation: ["create", "cancel"] as const,
  team: ["create", "update", "delete"] as const,
  ac: ["create", "read", "update", "delete"] as const,
};

const defaultOrgAc = createAccessControl(orgStatements);
const defaultOrgRoles = {
  owner: defaultOrgAc.newRole({
    organization: ["update", "delete"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["create", "read", "update", "delete"],
  }),
  admin: defaultOrgAc.newRole({
    organization: ["update"],
    member: ["create", "update"],
    invitation: ["create", "cancel"],
    team: ["create", "update", "delete"],
    ac: ["read"],
  }),
  member: defaultOrgAc.newRole({
    organization: [],
    member: [],
    invitation: [],
    team: [],
    ac: [],
  }),
};

export const organizationExtensionHandlers: ExtensionHandlerDefinition[] = [
  {
    id: "authend.allowAllOrganizations",
    label: "Allow all organization creation",
    description: "Permits any signed-in user to create organizations.",
    build: () => ({
      id: "authend.allowAllOrganizations",
      allowUserToCreateOrganization: () => true,
    }),
  },
  {
    id: "authend.denyAllOrganizations",
    label: "Deny organization creation",
    description: "Blocks self-serve organization creation for all users.",
    build: () => ({
      id: "authend.denyAllOrganizations",
      allowUserToCreateOrganization: () => false,
    }),
  },
  {
    id: "authend.sendInvitationEmail",
    label: "Send invitation email",
    description: "Uses the configured SMTP transport to send organization invitations.",
    build: () => ({
      id: "authend.sendInvitationEmail",
      sendInvitationEmail: async ({ email, organization, id }) => {
        const url = `${env.APP_URL.replace(/\/$/, "")}/admin?invitationId=${encodeURIComponent(id)}`;
        const organizationName =
          typeof organization.name === "string" && organization.name.length > 0 ? organization.name : env.APP_NAME;
        await sendEmail({
          to: email,
          subject: `Invitation to join ${organizationName}`,
          text: `You were invited to join ${organizationName}. Open ${url} to continue.`,
          html: `<p>You were invited to join <strong>${organizationName}</strong>.</p><p><a href="${url}">Open invitation</a></p>`,
        });
      },
    }),
  },
  {
    id: "authend.noopOrganizationHook",
    label: "No-op lifecycle hook",
    description: "Placeholder hook that accepts the event and performs no side effects.",
    build: () => ({
      id: "authend.noopOrganizationHook",
      organizationHook: async () => undefined,
    }),
  },
  {
    id: "authend.defaultOrgAccessControl",
    label: "Default organization access control",
    description: "Provides owner, admin, and member roles for dynamic access control.",
    build: () => ({
      id: "authend.defaultOrgAccessControl",
      ac: defaultOrgAc,
      roles: defaultOrgRoles,
    }),
  },
];
