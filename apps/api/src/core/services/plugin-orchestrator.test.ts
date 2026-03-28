import { afterEach, describe, expect, test } from "bun:test";
import type { PluginCapabilityState, PluginConfig, PluginExtensionBindings } from "@authend/shared";
import type { PluginDefinition } from "../plugins/types";
import { extensionPluginDefaults } from "../../extensions/plugin-defaults";

function socialAuthDefinition(): PluginDefinition {
  return {
    id: "socialAuth",
    version: "1.0.0",
    label: "Social Auth",
    description: "Social auth plugin",
    category: "authentication",
    documentationUrl: "https://example.com/social-auth",
    migrationStrategy: "none",
    dependencies: [],
    configSchema: [
      { key: "enabledProviders", label: "Enabled providers", type: "string" },
      { key: "providers", label: "Providers", type: "string" },
    ],
    capabilities: [
      {
        key: "core",
        label: "Core",
        description: "Core",
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
    defaultConfig: {
      enabledProviders: "",
    },
    defaultCapabilityState: { core: true },
    defaultExtensionBindings: {},
    validateConfig(config, { forEnable }) {
      if (!forEnable) {
        return null;
      }
      return typeof config.enabledProviders === "string" && config.enabledProviders.length > 0
        ? null
        : "Enable at least one social provider before enabling the plugin";
    },
  };
}

function seedState(input?: {
  enabled?: boolean;
  config?: PluginConfig;
  capabilityState?: PluginCapabilityState;
  extensionBindings?: PluginExtensionBindings;
}) {
  return {
    enabled: input?.enabled ?? false,
    config: input?.config ?? { enabledProviders: "" },
    capabilityState: input?.capabilityState ?? { core: true },
    extensionBindings: input?.extensionBindings ?? {},
  };
}

const originalDefaults = [...extensionPluginDefaults];

afterEach(() => {
  extensionPluginDefaults.splice(0, extensionPluginDefaults.length, ...originalDefaults);
  delete process.env.GOOGLE_CLIENT_ID;
});

describe("plugin-orchestrator extension defaults", () => {
  test("empty extension plugin defaults validate", async () => {
    process.env.APP_URL ??= "http://localhost:7002";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/authend";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-value-with-24-chars";
    process.env.SUPERADMIN_EMAIL ??= "admin@example.com";
    process.env.SUPERADMIN_PASSWORD ??= "password123";

    const { pluginOrchestratorTestUtils } = await import("./plugin-orchestrator");
    expect(() => pluginOrchestratorTestUtils.validateExtensionPluginDefaults()).not.toThrow();
  });

  test("env-gated extension defaults enable and patch built-in plugins during seed", async () => {
    process.env.APP_URL ??= "http://localhost:7002";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/authend";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-value-with-24-chars";
    process.env.SUPERADMIN_EMAIL ??= "admin@example.com";
    process.env.SUPERADMIN_PASSWORD ??= "password123";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";

    extensionPluginDefaults.splice(0, extensionPluginDefaults.length, {
      pluginId: "socialAuth",
      when: () => Boolean(process.env.GOOGLE_CLIENT_ID),
      enabled: true,
      configPatch: {
        enabledProviders: "google",
        providers: {
          google: {
            prompt: "select_account",
          },
        },
      },
    });

    const { pluginOrchestratorTestUtils } = await import("./plugin-orchestrator");
    const next = pluginOrchestratorTestUtils.applyExtensionDefaultsToSeedState(socialAuthDefinition(), seedState());

    expect(next.enabled).toBe(true);
    expect(next.config.enabledProviders).toBe("google");
    expect((next.config.providers as Record<string, { prompt: string }>).google.prompt).toBe("select_account");
  });

  test("persisted state remains authoritative after seed-time defaults", async () => {
    process.env.APP_URL ??= "http://localhost:7002";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/authend";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-value-with-24-chars";
    process.env.SUPERADMIN_EMAIL ??= "admin@example.com";
    process.env.SUPERADMIN_PASSWORD ??= "password123";

    extensionPluginDefaults.splice(0, extensionPluginDefaults.length, {
      pluginId: "socialAuth",
      enabled: true,
      configPatch: {
        enabledProviders: "google",
      },
    });

    const { pluginOrchestratorTestUtils } = await import("./plugin-orchestrator");
    const existingState = seedState({
      enabled: false,
      config: { enabledProviders: "github" },
    });

    expect(existingState.enabled).toBe(false);
    expect(existingState.config.enabledProviders).toBe("github");
    const seeded = pluginOrchestratorTestUtils.applyExtensionDefaultsToSeedState(socialAuthDefinition(), seedState());
    expect(seeded.config.enabledProviders).toBe("google");
  });

  test("invalid plugin-default targets fail clearly", async () => {
    process.env.APP_URL ??= "http://localhost:7002";
    process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/authend";
    process.env.BETTER_AUTH_SECRET ??= "test-secret-value-with-24-chars";
    process.env.SUPERADMIN_EMAIL ??= "admin@example.com";
    process.env.SUPERADMIN_PASSWORD ??= "password123";

    extensionPluginDefaults.splice(0, extensionPluginDefaults.length, {
      pluginId: "socialAuthx" as PluginDefinition["id"],
      enabled: true,
    });

    const { pluginOrchestratorTestUtils } = await import("./plugin-orchestrator");
    expect(() => pluginOrchestratorTestUtils.validateExtensionPluginDefaults()).toThrow("Unknown plugin default target");
  });
});
