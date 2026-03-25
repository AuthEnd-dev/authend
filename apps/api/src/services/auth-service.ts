import { betterAuth } from "better-auth";
import type { BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "../config/env";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { sendEmail } from "../lib/email";
import { createRuntimePluginContext, getEnabledRuntimePlugins } from "./plugin-orchestrator";
import { readSettingsSection } from "./settings-store";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeAuthOptions(base: Record<string, unknown>, update: Record<string, unknown>) {
  for (const [key, value] of Object.entries(update)) {
    if (isPlainObject(base[key]) && isPlainObject(value)) {
      base[key] = {
        ...(base[key] as Record<string, unknown>),
        ...value,
      };
      continue;
    }

    base[key] = value;
  }

  return base;
}

async function runtimeContributions() {
  const plugins = await getEnabledRuntimePlugins();
  return plugins.reduce(
    (acc, { definition, state }) => {
      const context = createRuntimePluginContext(state);
      const plugin = definition.composeServer?.(context) ?? null;
      if (plugin !== null) {
        acc.plugins.push(plugin);
      }

      const authOptions = definition.composeAuthOptions?.(context) ?? null;
      if (authOptions) {
        mergeAuthOptions(acc.authOptions, authOptions);
      }

      return acc;
    },
    { plugins: [] as BetterAuthPlugin[], authOptions: {} as Record<string, unknown> },
  );
}

async function createAuth(kind: "app" | "admin") {
  const contributions = await runtimeContributions();
  const [{ config: generalSettings }, { config: authSettings }, { config: emailSettings }, { config: domainSettings }] = await Promise.all([
    readSettingsSection("general"),
    readSettingsSection("authentication"),
    readSettingsSection("email"),
    readSettingsSection("domainsOrigins"),
  ]);

  const appBaseUrl = generalSettings.appUrl || env.APP_URL;
  const adminBaseUrl = generalSettings.adminUrl || env.ADMIN_URL || appBaseUrl;

  const trustedOrigins = Array.from(
    new Set(
      [
        ...(env.CORS_ORIGIN ?? [env.ADMIN_DEV_URL]),
        env.APP_URL,
        generalSettings.appUrl,
        generalSettings.adminUrl,
        ...domainSettings.trustedOrigins,
      ].filter(
        (value): value is string => typeof value === "string" && value.length > 0,
      ),
    ),
  );

  const baseURL = kind === "app" ? `${appBaseUrl}/api/auth` : `${adminBaseUrl}/api/admin/auth`;

  return betterAuth({
    appName: generalSettings.appName || env.APP_NAME,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !authSettings.allowSignUp,
      requireEmailVerification: authSettings.requireEmailVerification,
      minPasswordLength: authSettings.minPasswordLength,
      maxPasswordLength: authSettings.maxPasswordLength,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: emailSettings.passwordResetSubject || `${generalSettings.appName} password reset`,
          text: `Reset your password with this link: ${url}`,
          html: `<p>Reset your password with this link:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: emailSettings.verificationSubject || `${generalSettings.appName} verify your email`,
          text: `Verify your email with this link: ${url}`,
          html: `<p>Verify your email with this link:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    },
    ...contributions.authOptions,
    plugins: contributions.plugins,
  });
}

type BetterAuthInstance = Awaited<ReturnType<typeof createAuth>>;

let appAuthPromise: Promise<BetterAuthInstance> | null = null;
let adminAuthPromise: Promise<BetterAuthInstance> | null = null;

export async function getAuth() {
  appAuthPromise ??= createAuth("app");
  return appAuthPromise;
}

export async function getAdminAuth() {
  adminAuthPromise ??= createAuth("admin");
  return adminAuthPromise;
}

export async function invalidateAuth() {
  appAuthPromise = null;
  adminAuthPromise = null;
}
