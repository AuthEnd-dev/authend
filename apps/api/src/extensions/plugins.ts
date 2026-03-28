import type { PluginDefinition } from "../core/plugins/types";

/**
 * Register fork-owned AuthEnd plugin definitions here to avoid merge conflicts
 * with `plugins/builtin-registry.ts`.
 *
 * Use `plugin-defaults.ts` to declare defaults for existing built-in plugins.
 */
export const extensionPluginDefinitions: PluginDefinition[] = [];

/*
Example: register a fork-owned AuthEnd plugin definition.

Uncomment and adapt this for your fork:

export const extensionPluginDefinitions: PluginDefinition[] = [
  {
    id: "magicLink",
    version: "1.0.0",
    label: "Fork Demo Plugin",
    description: "Example fork-owned plugin definition.",
    category: "api",
    documentationUrl: "https://example.com/docs/fork-demo-plugin",
    migrationStrategy: "none",
    dependencies: [],
    configSchema: [],
    capabilities: [
      {
        key: "core",
        label: "Core",
        description: "Enable the plugin runtime.",
        enabledByDefault: true,
        requires: [],
        addsModels: [],
        addsClientFeatures: [],
        addsServerFeatures: [],
        addsAdminPanels: [],
      },
    ],
    extensionSlots: [],
    models: [],
    adminPanels: [],
    examples: [],
    clientNamespaces: [],
    serverOperations: [],
    requiredEnv: [],
    defaultEnabled: false,
    defaultConfig: {},
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
  },
];

Notes:

- This file is only for new fork-owned AuthEnd plugin definitions.
- Do not use this file to configure an existing built-in plugin.
- Use `plugin-defaults.ts` for built-in plugin defaults instead.
*/
