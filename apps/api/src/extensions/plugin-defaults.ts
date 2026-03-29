import type { ExtensionPluginDefaults } from '../core/plugins/types';

/**
 * Fork-owned defaults for existing built-in AuthEnd plugins.
 *
 * Use this file when you want a fork to start with a built-in plugin enabled
 * or preconfigured without editing core manifests.
 *
 * This file is declarative only. Do not perform writes or side effects here.
 */
export const pluginDefaults: ExtensionPluginDefaults[] = [];
/*
Example: enable the built-in social auth plugin for Google when env vars exist.

Uncomment and adapt this for your fork:

export const pluginDefaults: ExtensionPluginDefaults[] = [
  {
    pluginId: "socialAuth",
    when: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    enabled: true,
    configPatch: {
      enabledProviders: "google",
      providers: {
        google: {
          scope: ["openid", "email", "profile"],
          prompt: "select_account",
        },
      },
    },
  },
];

Notes:

- `when` gates the default. If it returns `false`, the default is ignored.
- These defaults are applied during plugin state seeding, not on every boot forever.
- Admin-generated defaults, when present, live in `extensions/generated/plugin-defaults.generated.ts`.
- This is the correct place for defaults for existing built-in plugins.
- Do not move this logic into `extensions/auth.ts` or core bootstrap code.
*/
