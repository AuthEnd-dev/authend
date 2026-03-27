import { describe, expect, test } from "bun:test";
import type { PluginInstallState } from "@authend/shared";
import { composeAdminServerPlugin } from "../plugins/admin/runtime";
import { composeApiKeyServerPlugin } from "../plugins/api-key/runtime";
import { composeJwtServerPlugin } from "../plugins/jwt/runtime";
import { composeMagicLinkServerPlugin } from "../plugins/magic-link/runtime";
import { composeOrganizationServerPlugin } from "../plugins/organization/runtime";
import { composeSocialAuthOptions } from "../plugins/social-auth/runtime";
import { composeTwoFactorServerPlugin } from "../plugins/two-factor/runtime";

function state(input: Partial<PluginInstallState>): PluginInstallState {
  return {
    pluginId: input.pluginId ?? "admin",
    enabled: input.enabled ?? true,
    version: input.version ?? "1.0.0",
    config: input.config ?? {},
    capabilityState: input.capabilityState ?? {},
    dependencyState: input.dependencyState ?? [],
    health: input.health ?? { status: "healthy", issues: [] },
    provisioningState:
      input.provisioningState ?? { status: "not-required", appliedMigrationKeys: [], rollbackMigrationKeys: [], details: [] },
    extensionBindings: input.extensionBindings ?? {},
  };
}

function runtimeContext(input: Partial<PluginInstallState>, handlers: Record<string, Record<string, unknown>> = {}) {
  const pluginState = state(input);
  return {
    state: pluginState,
    getHandler(slotKey: string) {
      return (handlers[slotKey] as never) ?? null;
    },
  };
}

describe("plugin runtime config wiring", () => {
  test("admin runtime consumes saved role and impersonation config", () => {
    const plugin = composeAdminServerPlugin(
      runtimeContext({
        pluginId: "admin",
        config: {
          defaultRole: "member",
          allowImpersonatingAdmins: true,
          adminRoles: ["admin"],
          impersonationSessionDuration: 7200,
        },
      }),
    ) as unknown as { options: Record<string, unknown> };

    expect(plugin.options.defaultRole).toBe("member");
    expect(plugin.options.allowImpersonatingAdmins).toBe(true);
    expect(plugin.options.impersonationSessionDuration).toBe(7200);
    expect(plugin.options.adminRoles).toEqual(["admin"]);
  });

  test("api key runtime consumes saved creation and rate-limit config", () => {
    const plugin = composeApiKeyServerPlugin(
      runtimeContext({
        pluginId: "apiKey",
        config: {
          defaultPrefix: "srv",
          defaultKeyLength: 24,
          rateLimitEnabled: true,
          rateLimitTimeWindow: 60000,
          rateLimitMax: 3,
          disableKeyHashing: true,
        },
      }),
    ) as unknown as { configurations: Array<Record<string, unknown>> };

    const [configuration] = plugin.configurations;
    expect(configuration.defaultPrefix).toBe("srv");
    expect(configuration.defaultKeyLength).toBe(24);
    expect(configuration.disableKeyHashing).toBe(true);
    expect(configuration.rateLimit).toEqual({
      enabled: true,
      timeWindow: 60000,
      maxRequests: 3,
    });
  });

  test("jwt runtime consumes saved issuer and jwks config", () => {
    const plugin = composeJwtServerPlugin(
      runtimeContext({
        pluginId: "jwt",
        config: {
          issuer: "https://issuer.example",
          audience: "authend-tests",
          jwksPath: "/custom-jwks",
          disableSettingJwtHeader: true,
        },
      }),
    ) as unknown as { options: Record<string, unknown> };

    expect(plugin.options.jwt).toEqual({
      issuer: "https://issuer.example",
      audience: "authend-tests",
    });
    expect(plugin.options.jwks).toEqual({
      jwksPath: "/custom-jwks",
    });
    expect(plugin.options.disableSettingJwtHeader).toBe(true);
  });

  test("magic link runtime consumes saved delivery and token config", () => {
    const plugin = composeMagicLinkServerPlugin(
      runtimeContext(
        {
          pluginId: "magicLink",
          config: {
            expiresIn: 900,
            allowedAttempts: 2,
            disableSignUp: true,
            storeToken: "hashed",
            rateLimitWindow: 120,
            rateLimitMax: 4,
          },
        },
        {
          sendMagicLink: {
            sendMagicLink: async () => undefined,
          },
        },
      ),
    ) as unknown as { options: Record<string, unknown> };

    expect(plugin.options.expiresIn).toBe(900);
    expect(plugin.options.allowedAttempts).toBe(2);
    expect(plugin.options.disableSignUp).toBe(true);
    expect(plugin.options.storeToken).toBe("hashed");
    expect(plugin.options.rateLimit).toEqual({
      window: 120,
      max: 4,
    });
  });

  test("organization runtime consumes saved org and team limits", () => {
    const plugin = composeOrganizationServerPlugin(
      runtimeContext(
        {
          pluginId: "organization",
          capabilityState: {
            core: true,
            teams: true,
            dynamicAccessControl: true,
            invitations: true,
          },
          config: {
            allowUserToCreateOrganization: false,
            organizationLimit: 2,
            creatorRole: "admin",
            invitationExpiresIn: 3600,
            createDefaultTeam: false,
            maximumTeams: 3,
            maximumRolesPerOrganization: 9,
          },
        },
        {
          ac: {
            ac: { rules: true },
            roles: { owner: { permissions: ["*"] } },
          },
          sendInvitationEmail: {
            sendInvitationEmail: async () => undefined,
          },
        },
      ),
    ) as unknown as { options: Record<string, unknown> };

    expect(plugin.options.allowUserToCreateOrganization).toBe(false);
    expect(plugin.options.organizationLimit).toBe(2);
    expect(plugin.options.creatorRole).toBe("admin");
    expect(plugin.options.invitationExpiresIn).toBe(3600);
    expect(plugin.options.teams).toEqual({
      enabled: true,
      defaultTeam: {
        enabled: false,
      },
      maximumTeams: 3,
    });
    expect(plugin.options.dynamicAccessControl).toEqual({
      enabled: true,
      maximumRolesPerOrganization: 9,
    });
  });

  test("two-factor runtime consumes saved issuer and otp settings", () => {
    const plugin = composeTwoFactorServerPlugin(
      runtimeContext({
        pluginId: "twoFactor",
        config: {
          issuer: "AuthEnd QA",
          skipVerificationOnEnable: true,
          twoFactorCookieMaxAge: 180,
          trustDeviceMaxAge: 86400,
          totpDigits: 8,
          totpPeriod: 45,
          otpDigits: 7,
          otpPeriod: 90,
        },
      }),
    ) as unknown as { options: Record<string, unknown> };

    expect(plugin.options.issuer).toBe("AuthEnd QA");
    expect(plugin.options.skipVerificationOnEnable).toBe(true);
    expect(plugin.options.twoFactorCookieMaxAge).toBe(180);
    expect(plugin.options.trustDeviceMaxAge).toBe(86400);
    expect(plugin.options.totpOptions).toEqual({
      digits: 8,
      period: 45,
    });
    expect(plugin.options.otpOptions).toEqual({
      digits: 7,
      period: 90,
    });
  });

  test("social auth runtime consumes saved provider config", () => {
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";

    const options = composeSocialAuthOptions(
      runtimeContext({
        pluginId: "socialAuth",
        config: {
          enabledProviders: "google",
          providers: {
            google: {
              scope: ["openid", "email", "profile"],
              prompt: "consent",
              disableSignUp: true,
            },
          },
        },
      }),
    );

    expect(options).toEqual({
      socialProviders: {
        google: {
          clientId: "google-client-id",
          clientSecret: "google-client-secret",
          scope: ["openid", "email", "profile"],
          prompt: "consent",
          disableSignUp: true,
        },
      },
    });
  });
});
