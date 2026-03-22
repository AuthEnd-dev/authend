import { admin, jwt, magicLink, twoFactor, username } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import type { PluginDefinition } from "./types";
import { organizationPluginDefinition } from "./organization/manifest";
import { attachOrganizationRuntime } from "./organization/runtime";
import { getOrganizationProvisionPlan, getOrganizationRollbackPlan } from "./organization/provision";
import { env } from "../config/env";
import { sendEmail } from "../lib/email";

function sqlPlan(key: string, title: string, sql: string) {
  return { key, title, sql };
}

const simpleDefinitions: PluginDefinition[] = [
  {
    id: "username",
    version: "2.0.0",
    label: "Username",
    description: "Allow unique usernames on top of email and password auth.",
    category: "authentication",
    documentationUrl: "https://www.better-auth.com/docs/plugins/username",
    migrationStrategy: "none",
    dependencies: [],
    requiredEnv: [],
    examples: [
      {
        key: "client-sign-up-username",
        title: "Sign up with a username",
        description: "The username plugin extends email/password sign-up with a username field.",
        language: "ts",
        audience: "client",
        capabilityKeys: ["core"],
        code: `await client.auth.signUp.email({
  email: "dev@example.com",
  password: "ChangeMe123!",
  name: "Dev User",
  username: "devuser",
});`,
      },
    ],
    configSchema: [],
    capabilities: [
      {
        key: "core",
        label: "Username support",
        description: "Adds username auth fields and endpoints.",
        enabledByDefault: true,
        requires: [],
        addsModels: [],
        addsClientFeatures: ["username"],
        addsServerFeatures: ["username auth"],
        addsAdminPanels: ["overview"],
      },
    ],
    extensionSlots: [],
    models: [],
    adminPanels: [
      {
        key: "overview",
        label: "Overview",
        description: "Plugin state and docs.",
        capabilityKeys: ["core"],
      },
    ],
    clientNamespaces: ["username"],
    serverOperations: ["auth.username"],
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
    composeServer: () => username(),
    composeClient: () => ["username"],
    getRollbackPlan: () =>
      sqlPlan(
        "plugin_username_v1",
        "Disable username plugin",
        `update "user"
set "username" = null,
    "display_username" = null,
    "updated_at" = now()
where "username" is not null
   or "display_username" is not null;`,
      ),
  },
  {
    id: "jwt",
    version: "2.0.0",
    label: "JWT",
    description: "Issue JWTs for stateless API access and machine-to-machine flows.",
    category: "api",
    documentationUrl: "https://www.better-auth.com/docs/plugins/jwt",
    migrationStrategy: "sql",
    dependencies: [],
    requiredEnv: [],
    examples: [
      {
        key: "server-jwt-session",
        title: "Request a JWT-backed session",
        description: "Use the Better Auth client after enabling the JWT plugin to access JWT-oriented flows.",
        language: "ts",
        audience: "client",
        capabilityKeys: ["core"],
        code: `const session = await client.auth.getSession();
console.log(session);`,
      },
    ],
    configSchema: [],
    capabilities: [
      {
        key: "core",
        label: "JWT issuance",
        description: "Exposes JWT endpoints and the JWKS table.",
        enabledByDefault: true,
        requires: [],
        addsModels: ["jwks"],
        addsClientFeatures: ["jwt"],
        addsServerFeatures: ["jwt issue/verify"],
        addsAdminPanels: ["overview"],
      },
    ],
    extensionSlots: [],
    models: [
      {
        key: "jwks",
        tableName: "jwks",
        label: "JWKS",
        capabilityKeys: ["core"],
        description: "JWT signing keys.",
      },
    ],
    adminPanels: [
      {
        key: "overview",
        label: "Overview",
        description: "Plugin state and docs.",
        capabilityKeys: ["core"],
      },
    ],
    clientNamespaces: ["jwt"],
    serverOperations: ["auth.jwt"],
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
    composeServer: () => jwt(),
    composeClient: () => ["jwt"],
    getProvisionPlan: () =>
      sqlPlan(
        "plugin_jwt_v1",
        "Enable jwt plugin",
        `create table if not exists "jwks" (
  "id" text primary key,
  "public_key" text not null,
  "private_key" text not null,
  "created_at" timestamptz not null default now(),
  "expires_at" timestamptz
);`,
      ),
    getRollbackPlan: () => sqlPlan("plugin_jwt_v1", "Disable jwt plugin", `drop table if exists "jwks" cascade;`),
  },
  {
    id: "twoFactor",
    version: "2.0.0",
    label: "Two Factor",
    description: "Add TOTP-based two-factor authentication with recovery codes.",
    category: "authentication",
    documentationUrl: "https://www.better-auth.com/docs/plugins/2fa",
    migrationStrategy: "sql",
    dependencies: [],
    requiredEnv: [],
    examples: [
      {
        key: "client-enable-2fa",
        title: "Start two-factor enrollment",
        description: "Use the native Better Auth twoFactor client namespace after enabling the plugin.",
        language: "ts",
        audience: "client",
        capabilityKeys: ["core"],
        code: `await client.auth.twoFactor.enable({
  password: "ChangeMe123!",
});`,
      },
    ],
    configSchema: [],
    capabilities: [
      {
        key: "core",
        label: "2FA",
        description: "Two-factor tables and verification endpoints.",
        enabledByDefault: true,
        requires: [],
        addsModels: ["two_factor"],
        addsClientFeatures: ["twoFactor"],
        addsServerFeatures: ["2fa enrollment"],
        addsAdminPanels: ["overview"],
      },
    ],
    extensionSlots: [],
    models: [
      {
        key: "two_factor",
        tableName: "two_factor",
        label: "Two factor",
        capabilityKeys: ["core"],
        description: "Two-factor secrets and backup codes.",
      },
    ],
    adminPanels: [
      {
        key: "overview",
        label: "Overview",
        description: "Plugin state and docs.",
        capabilityKeys: ["core"],
      },
    ],
    clientNamespaces: ["twoFactor"],
    serverOperations: ["auth.twoFactor"],
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
    composeServer: () => twoFactor({ issuer: env.APP_NAME }),
    composeClient: () => ["twoFactor"],
    getProvisionPlan: () =>
      sqlPlan(
        "plugin_twoFactor_v2",
        "Enable twoFactor plugin",
        `create table if not exists "two_factor" (
  "id" text primary key,
  "user_id" text not null references "user"("id") on delete cascade,
  "secret" text,
  "backup_codes" text,
  unique ("user_id")
);

create unique index if not exists "two_factor_user_idx" on "two_factor" ("user_id");`,
      ),
    getRollbackPlan: () =>
      sqlPlan(
        "plugin_twoFactor_v2",
        "Disable twoFactor plugin",
        `update "user"
set "two_factor_enabled" = false,
    "updated_at" = now()
where "two_factor_enabled" = true;

delete from "verification"
where "identifier" like '2fa-%'
   or "identifier" like '2fa-otp-%'
   or "identifier" like 'trust-device-%';

drop table if exists "two_factor" cascade;`,
      ),
  },
  {
    id: "apiKey",
    version: "2.0.0",
    label: "API Key",
    description: "Issue personal and organization API keys for backend-to-backend access.",
    category: "api",
    documentationUrl: "https://www.better-auth.com/docs/plugins/api-key",
    migrationStrategy: "sql",
    dependencies: [],
    requiredEnv: [],
    examples: [
      {
        key: "client-create-api-key",
        title: "Create an API key",
        description: "Issue an API key once the plugin is enabled.",
        language: "ts",
        audience: "client",
        capabilityKeys: ["core"],
        code: `await client.auth.apiKey.create({
  name: "CI token",
});`,
      },
    ],
    configSchema: [],
    capabilities: [
      {
        key: "core",
        label: "API keys",
        description: "API key endpoints and storage.",
        enabledByDefault: true,
        requires: [],
        addsModels: ["apikey"],
        addsClientFeatures: ["apiKey"],
        addsServerFeatures: ["api key issue/revoke"],
        addsAdminPanels: ["overview"],
      },
    ],
    extensionSlots: [],
    models: [
      {
        key: "apikey",
        tableName: "apikey",
        label: "API keys",
        capabilityKeys: ["core"],
        description: "Issued API keys.",
      },
    ],
    adminPanels: [
      {
        key: "overview",
        label: "Overview",
        description: "Plugin state and docs.",
        capabilityKeys: ["core"],
      },
    ],
    clientNamespaces: ["apiKey"],
    serverOperations: ["auth.apiKey"],
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
    composeServer: () => apiKey(),
    composeClient: () => ["apiKey"],
    getProvisionPlan: () =>
      sqlPlan(
        "plugin_apiKey_v2",
        "Enable apiKey plugin",
        `do $$
begin
  if to_regclass('public.api_key') is not null and to_regclass('public.apikey') is null then
    alter table "api_key" rename to "apikey";
  end if;
end $$;

create table if not exists "apikey" (
  "id" text primary key,
  "config_id" text not null default 'default',
  "name" text,
  "start" text,
  "reference_id" text not null,
  "prefix" text,
  "key" text not null,
  "refill_interval" integer,
  "refill_amount" integer,
  "last_refill_at" timestamptz,
  "enabled" boolean not null default true,
  "rate_limit_enabled" boolean not null default true,
  "rate_limit_time_window" integer,
  "rate_limit_max" integer,
  "request_count" integer not null default 0,
  "remaining" integer,
  "last_request" timestamptz,
  "expires_at" timestamptz,
  "permissions" text,
  "metadata" text,
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

alter table "apikey" add column if not exists "config_id" text default 'default';
alter table "apikey" add column if not exists "reference_id" text;
alter table "apikey" add column if not exists "remaining" integer;
alter table "apikey" alter column "config_id" set default 'default';
alter table "apikey" alter column "enabled" set default true;
alter table "apikey" alter column "rate_limit_enabled" set default true;
alter table "apikey" alter column "request_count" set default 0;

create index if not exists "apikey_config_id_idx" on "apikey" ("config_id");
create index if not exists "apikey_reference_id_idx" on "apikey" ("reference_id");
create index if not exists "apikey_key_idx" on "apikey" ("key");`,
      ),
    getRollbackPlan: () =>
      sqlPlan(
        "plugin_apiKey_v2",
        "Disable apiKey plugin",
        `drop table if exists "apikey" cascade;
drop table if exists "api_key" cascade;`,
      ),
  },
  {
    id: "magicLink",
    version: "2.0.0",
    label: "Magic Link",
    description: "Allow passwordless login through email-delivered one-click links.",
    category: "authentication",
    documentationUrl: "https://www.better-auth.com/docs/plugins/magic-link",
    migrationStrategy: "none",
    dependencies: [],
    requiredEnv: [],
    examples: [
      {
        key: "client-magic-link",
        title: "Send a magic link",
        description: "Trigger passwordless email login through the Better Auth client namespace.",
        language: "ts",
        audience: "client",
        capabilityKeys: ["core"],
        code: `await client.auth.magicLink.signIn({
  email: "dev@example.com",
});`,
      },
    ],
    configSchema: [],
    capabilities: [
      {
        key: "core",
        label: "Magic links",
        description: "Passwordless sign-in using email links.",
        enabledByDefault: true,
        requires: [],
        addsModels: [],
        addsClientFeatures: ["magicLink"],
        addsServerFeatures: ["magic link email flow"],
        addsAdminPanels: ["overview"],
      },
    ],
    extensionSlots: [],
    models: [],
    adminPanels: [
      {
        key: "overview",
        label: "Overview",
        description: "Plugin state and docs.",
        capabilityKeys: ["core"],
      },
    ],
    clientNamespaces: ["magicLink"],
    serverOperations: ["auth.magicLink"],
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
    composeServer: () =>
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({
            to: email,
            subject: `${env.APP_NAME} sign-in link`,
            text: `Use this link to sign in: ${url}`,
            html: `<p>Use this link to sign in:</p><p><a href="${url}">${url}</a></p>`,
          });
        },
      }),
    composeClient: () => ["magicLink"],
    getRollbackPlan: () =>
      sqlPlan(
        "plugin_magicLink_v1",
        "Disable magicLink plugin",
        `delete from "verification"
where "identifier" not like 'reset-password:%'
  and "identifier" not like 'delete-account-%'
  and "value" like '%"attempt":%';`,
      ),
  },
  {
    id: "admin",
    version: "2.0.0",
    label: "Better Auth Admin",
    description: "Expose Better Auth admin endpoints for permission-aware user management.",
    category: "administration",
    documentationUrl: "https://www.better-auth.com/docs/plugins/admin",
    migrationStrategy: "none",
    dependencies: [],
    requiredEnv: [],
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
    ],
    configSchema: [],
    capabilities: [
      {
        key: "core",
        label: "Admin endpoints",
        description: "Admin endpoints and impersonation helpers.",
        enabledByDefault: true,
        requires: [],
        addsModels: [],
        addsClientFeatures: ["admin"],
        addsServerFeatures: ["admin manage users"],
        addsAdminPanels: ["overview"],
      },
    ],
    extensionSlots: [],
    models: [],
    adminPanels: [
      {
        key: "overview",
        label: "Overview",
        description: "Plugin state and docs.",
        capabilityKeys: ["core"],
      },
    ],
    clientNamespaces: ["admin"],
    serverOperations: ["auth.admin"],
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
    composeServer: () => admin(),
    composeClient: () => ["admin"],
    getRollbackPlan: () =>
      sqlPlan(
        "plugin_admin_v1",
        "Disable admin plugin",
        `delete from "session"
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
      ),
  },
];

const organizationDefinition = attachOrganizationRuntime({
  ...organizationPluginDefinition,
  getProvisionPlan: getOrganizationProvisionPlan,
  getRollbackPlan: getOrganizationRollbackPlan,
});

export const pluginRegistry: PluginDefinition[] = [simpleDefinitions[0], simpleDefinitions[1], organizationDefinition, simpleDefinitions[2], simpleDefinitions[3], simpleDefinitions[4], simpleDefinitions[5]];

export function getPluginDefinition(pluginId: string) {
  return pluginRegistry.find((entry) => entry.id === pluginId) ?? null;
}
