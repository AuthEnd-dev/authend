import type { BetterAuthPlugin } from 'better-auth';
import type { SettingsSectionConfigMap } from '@authend/shared';

/** Context passed to fork auth hooks so extensions avoid importing the full auth service. */
export type ForkAuthContext = {
  kind: 'app' | 'admin';
  baseURL: string;
  appBaseUrl: string;
  adminBaseUrl: string;
  trustedOrigins: string[];
  generalSettings: SettingsSectionConfigMap['general'];
  authSettings: SettingsSectionConfigMap['authentication'];
  emailSettings: SettingsSectionConfigMap['email'];
  domainSettings: SettingsSectionConfigMap['domainsOrigins'];
};

/**
 * Return extra Better Auth plugins and shallow-merged option fragments.
 * Merged after runtime plugin contributions; use for custom providers, hooks, or overrides.
 *
 * Keep this runtime-only. Do not persist AuthEnd plugin install state from here.
 * Use `extensions/plugin-defaults.ts` for declarative defaults for existing built-in plugins.
 */
export async function forkAuthContributions(ctx: ForkAuthContext): Promise<{
  plugins: BetterAuthPlugin[];
  authOptions: Record<string, unknown>;
}> {
  return {
    plugins: [],
    authOptions: {},
  };
}

/*
Example: add runtime-only Better Auth contributions.

Uncomment and adapt this for your fork:

import { expo } from "@better-auth/expo";

export async function forkAuthContributions(ctx: ForkAuthContext): Promise<{
  plugins: BetterAuthPlugin[];
  authOptions: Record<string, unknown>;
}> {
  const mobileOrigins = [
    "myapp://",
    "myapp://*",
    ...(process.env.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
  ];

  return {
    plugins: ctx.kind === "app" ? [expo()] : [],
    authOptions:
      ctx.kind === "app"
        ? {
            trustedOrigins: Array.from(new Set([...ctx.trustedOrigins, ...mobileOrigins])),
          }
        : {},
  };
}

Notes:

- This file is for Better Auth runtime plugins and auth option overrides only.
- Do not persist AuthEnd plugin install state from here.
- Use `plugin-defaults.ts` for defaults for existing built-in AuthEnd plugins.
*/
