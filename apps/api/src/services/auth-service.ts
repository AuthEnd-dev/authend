import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { env } from "../config/env";
import { db } from "../db/client";
import * as schema from "../db/schema";
import { sendEmail } from "../lib/email";
import { createRuntimePluginContext, getEnabledRuntimePlugins } from "./plugin-orchestrator";

async function runtimePlugins() {
  const plugins = await getEnabledRuntimePlugins();
  return plugins
    .map(({ definition, state }) => definition.composeServer?.(createRuntimePluginContext(state)) ?? null)
    .filter((plugin): plugin is NonNullable<typeof plugin> => plugin !== null);
}

async function createAuth() {
  return betterAuth({
    appName: env.APP_NAME,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.CORS_ORIGIN ?? env.ADMIN_DEV_URL, env.APP_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: `${env.APP_NAME} password reset`,
          text: `Reset your password with this link: ${url}`,
          html: `<p>Reset your password with this link:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: `${env.APP_NAME} verify your email`,
          text: `Verify your email with this link: ${url}`,
          html: `<p>Verify your email with this link:</p><p><a href="${url}">${url}</a></p>`,
        });
      },
    },
    plugins: await runtimePlugins(),
  });
}

type BetterAuthInstance = Awaited<ReturnType<typeof createAuth>>;

let authPromise: Promise<BetterAuthInstance> | null = null;

export async function getAuth() {
  authPromise ??= createAuth();
  return authPromise;
}

export async function invalidateAuth() {
  authPromise = null;
}
