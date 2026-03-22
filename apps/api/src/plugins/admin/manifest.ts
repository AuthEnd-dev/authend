import type { PluginDefinition } from "../types";

export const adminPluginDefinition: PluginDefinition = {
  id: "admin",
  version: "2.0.0",
  label: "Better Auth Admin",
  description: "Expose Better Auth admin endpoints for user management, bans, impersonation, and session administration.",
  category: "administration",
  documentationUrl: "https://www.better-auth.com/docs/plugins/admin",
  migrationStrategy: "none",
  dependencies: [],
  requiredEnv: [],
  defaultEnabled: true,
  required: true,
  configSchema: [
    { key: "defaultRole", label: "Default role", type: "string", helpText: "Role assigned to new users.", defaultValue: "user" },
    { key: "adminRoles", label: "Admin roles", type: "string", helpText: "Comma-separated roles considered admin roles.", defaultValue: "admin" },
    { key: "adminUserIds", label: "Admin user IDs", type: "string", helpText: "Comma-separated user ids with admin access." },
    { key: "defaultBanReason", label: "Default ban reason", type: "string", helpText: "Default reason shown when a user is banned." },
    { key: "defaultBanExpiresIn", label: "Default ban expires in", type: "number", helpText: "Default ban duration in seconds." },
    { key: "impersonationSessionDuration", label: "Impersonation session duration", type: "number", helpText: "Impersonation session duration in seconds.", defaultValue: 3600 },
    { key: "bannedUserMessage", label: "Banned user message", type: "string", helpText: "Message shown to banned users." },
    { key: "allowImpersonatingAdmins", label: "Allow impersonating admins", type: "boolean", helpText: "Allow impersonation of other admins.", defaultValue: false },
  ],
  capabilities: [
    {
      key: "core",
      label: "Admin endpoints",
      description: "User management, ban/unban, impersonation, and session administration.",
      enabledByDefault: true,
      requires: [],
      addsModels: [],
      addsClientFeatures: ["admin"],
      addsServerFeatures: ["admin manage users", "admin impersonation", "admin sessions"],
      addsAdminPanels: ["overview", "users", "sessions", "config"],
    },
  ],
  extensionSlots: [
    {
      key: "admin.ac",
      label: "Admin access control",
      description: "Bind a Better Auth access-control definition and roles for admin endpoints.",
      kind: "access-control",
      required: false,
      defaultHandlerId: "authend.defaultAdminAccessControl",
      handlerIds: [],
      inputSchema: {
        ac: "Access control definition",
        roles: "Named admin roles",
      },
      exampleLanguage: "ts",
      exampleTitle: "Define custom admin permissions",
      exampleDescription: "Use your own roles and access-control rules for admin endpoints.",
      exampleCode: `import { createAccessControl } from "better-auth/plugins";

const statements = {
  user: ["create", "list", "ban", "get", "update"],
  session: ["list", "revoke"],
};

const ac = createAccessControl(statements);

export const customAdminAccessControl = {
  id: "custom.adminAccessControl",
  label: "Custom admin access control",
  description: "Defines a restricted admin role model.",
  slotKeys: ["admin.ac"],
  build: () => ({
    id: "custom.adminAccessControl",
    ac,
    roles: {
      admin: ac.newRole({
        user: ["create", "list", "ban", "get", "update"],
        session: ["list", "revoke"],
      }),
      support: ac.newRole({
        user: ["list", "get"],
        session: ["list"],
      }),
    },
  }),
};`,
    },
  ],
  models: [],
  adminPanels: [
    { key: "overview", label: "Overview", description: "Plugin state, docs, and diagnostics.", capabilityKeys: ["core"] },
    { key: "users", label: "Managed users", description: "Operational view of users handled by the admin plugin.", capabilityKeys: ["core"] },
    { key: "sessions", label: "Impersonation & sessions", description: "Operational view of session and impersonation state.", capabilityKeys: ["core"] },
    { key: "config", label: "Config", description: "Admin roles, bans, and impersonation settings.", capabilityKeys: ["core"] },
  ],
  examples: [
    {
      key: "client-admin-list-users",
      title: "List users with the admin client",
      description: "Superadmins can use the Better Auth admin namespace after enabling the plugin.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `const users = await client.auth.admin.listUsers({
  limit: 20,
});`,
    },
    {
      key: "client-admin-impersonate",
      title: "Impersonate a user",
      description: "Start an impersonation session through the Better Auth admin namespace.",
      language: "ts",
      audience: "client",
      capabilityKeys: ["core"],
      code: `await client.auth.admin.impersonateUser({
  userId: "usr_123",
});`,
    },
  ],
  clientNamespaces: ["admin"],
  serverOperations: ["auth.admin"],
  defaultConfig: {
    defaultRole: "user",
    adminRoles: "admin",
    impersonationSessionDuration: 3600,
    allowImpersonatingAdmins: false,
  },
  defaultCapabilityState: { core: true },
  defaultExtensionBindings: {
    "admin.ac": "authend.defaultAdminAccessControl",
  },
  getRollbackPlan: () => ({
    key: "plugin_admin_v1",
    title: "Disable admin plugin",
    sql: `delete from "session"
where "impersonated_by" is not null;

update "user"
set "role" = 'user',
    "banned" = false,
    "ban_reason" = null,
    "ban_expires" = null,
    "updated_at" = now()
where "role" <> 'user'
   or "banned" = true
   or "ban_reason" is not null
   or "ban_expires" is not null;`,
  }),
};
