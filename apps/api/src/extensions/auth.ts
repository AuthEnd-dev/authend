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
 */
export async function forkAuthContributions(_ctx: ForkAuthContext): Promise<{
  plugins: BetterAuthPlugin[];
  authOptions: Record<string, unknown>;
}> {
  return { plugins: [], authOptions: {} };
}
