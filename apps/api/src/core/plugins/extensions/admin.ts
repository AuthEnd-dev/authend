import { createAccessControl } from "better-auth/plugins";
import type { ExtensionHandlerDefinition } from "../types";

const adminStatements = {
  user: ["create", "list", "set-role", "ban", "impersonate", "impersonate-admins", "delete", "set-password", "get", "update"] as const,
  session: ["list", "revoke", "delete"] as const,
};

const defaultAdminAc = createAccessControl(adminStatements);
const defaultAdminRoles = {
  admin: defaultAdminAc.newRole({
    user: ["create", "list", "set-role", "ban", "impersonate", "delete", "set-password", "get", "update"],
    session: ["list", "revoke", "delete"],
  }),
  user: defaultAdminAc.newRole({
    user: [],
    session: [],
  }),
};

export const adminExtensionHandlers: ExtensionHandlerDefinition[] = [
  {
    id: "authend.defaultAdminAccessControl",
    label: "Default admin access control",
    description: "Provides a default admin/user role model for Better Auth admin operations.",
    slotKeys: ["admin.ac"],
    build: () => ({
      id: "authend.defaultAdminAccessControl",
      ac: defaultAdminAc,
      roles: defaultAdminRoles,
    }),
  },
];
