import { eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";
import type {
  PluginCapability,
  PluginCapabilityState,
  PluginCatalogItem,
  PluginConfig,
  PluginConfigUpdate,
  PluginDependencyState,
  PluginExtensionBindings,
  PluginExtensionSlot,
  PluginHealth,
  PluginId,
  PluginInstallState,
  PluginManifest,
  PluginModel,
} from "@authend/shared";
import { db, sql } from "../db/client";
import { pluginConfigs } from "../db/schema/system";
import { env } from "../config/env";
import { HttpError } from "../lib/http";
import { fileExists, writeTextFile } from "../lib/fs";
import { resolveGeneratedPluginDefaultsFile } from "../lib/generated-artifacts";
import { extensionHandlers, getExtensionHandlerDefinition } from "../plugins/extension-registry";
import { pluginDefaults } from "../../extensions/plugin-defaults";
import {
  ORGANIZATION_INVITATION_HOOK_KEYS,
  ORGANIZATION_TEAM_HOOK_KEYS,
} from "../plugins/organization/manifest";
import { getPluginDefinition, pluginRegistry } from "../plugins/registry";
import type { ExtensionPluginDefaults, PluginContextRow, PluginDefinition, RuntimePluginContext } from "../plugins/types";

const generatedPluginDefaultsFile = resolveGeneratedPluginDefaultsFile();

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mergeConfigDefaults(definition: PluginDefinition, config: PluginConfig): PluginConfig {
  return {
    ...definition.defaultConfig,
    ...config,
  };
}

function mergePluginDefaults<T extends Record<string, unknown> | undefined>(base: T, patch: T) {
  return {
    ...(base ?? {}),
    ...(patch ?? {}),
  } as T extends undefined ? Record<string, unknown> : T;
}

type PersistedPluginDefaultsEntry = Omit<ExtensionPluginDefaults, "when">;

async function loadGeneratedExtensionPluginDefaults(): Promise<ExtensionPluginDefaults[]> {
  if (!(await fileExists(generatedPluginDefaultsFile))) {
    return [];
  }

  const module = (await import(pathToFileURL(generatedPluginDefaultsFile).href)) as {
    generatedPluginDefaults?: ExtensionPluginDefaults[];
  };

  return Array.isArray(module.generatedPluginDefaults) ? module.generatedPluginDefaults : [];
}

function defaultsForPlugin(pluginId: PluginId, defaults: ExtensionPluginDefaults[]) {
  return defaults.filter((entry) => entry.pluginId === pluginId);
}

function isExtensionDefaultActive(entry: ExtensionPluginDefaults) {
  return entry.when?.() ?? true;
}

function applyExtensionDefaultsToSeedState(
  definition: PluginDefinition,
  seed: {
    enabled: boolean;
    config: PluginConfig;
    capabilityState: PluginCapabilityState;
    extensionBindings: PluginExtensionBindings;
  },
  defaults: ExtensionPluginDefaults[] = pluginDefaults,
) {
  let next = {
    enabled: seed.enabled,
    config: seed.config,
    capabilityState: seed.capabilityState,
    extensionBindings: seed.extensionBindings,
  };

  for (const entry of defaultsForPlugin(definition.id, defaults)) {
    if (!isExtensionDefaultActive(entry)) {
      continue;
    }

    next = {
      enabled: entry.enabled ?? next.enabled,
      config: mergeConfigDefaults(definition, mergePluginDefaults(next.config, entry.configPatch)),
      capabilityState: normalizeCapabilityState(definition, mergePluginDefaults(next.capabilityState, entry.capabilityStatePatch)),
      extensionBindings: normalizeExtensionBindings(
        definition,
        mergePluginDefaults(next.extensionBindings, entry.extensionBindingsPatch),
      ),
    };
  }

  return next;
}

function validateExtensionPluginDefaults(defaults: ExtensionPluginDefaults[] = pluginDefaults) {
  const definitionIds = new Set(pluginRegistry.map((entry) => entry.id));

  for (const entry of defaults) {
    if (!definitionIds.has(entry.pluginId)) {
      throw new HttpError(500, `Unknown plugin default target ${entry.pluginId}`);
    }

    const definition = getPluginDefinition(entry.pluginId);
    if (!definition) {
      throw new HttpError(500, `Unknown plugin default target ${entry.pluginId}`);
    }

    const config = mergeConfigDefaults(definition, entry.configPatch ?? {});
    const configError = validatePluginConfig(definition, config);
    if (configError) {
      throw new HttpError(500, `Invalid extension plugin defaults for ${entry.pluginId}: ${configError}`);
    }

    normalizeCapabilityState(definition, asObject(entry.capabilityStatePatch));
    normalizeExtensionBindings(definition, asObject(entry.extensionBindingsPatch));
  }
}

function serializeGeneratedPluginDefaults(entries: PersistedPluginDefaultsEntry[]) {
  return `import type { ExtensionPluginDefaults } from "../../core/plugins/types";

/**
 * Machine-written plugin defaults snapshot.
 *
 * Admin plugin enable/disable/config actions rewrite this file so the selected
 * built-in plugin state can be committed to git and replayed on a fresh database.
 */
export const generatedPluginDefaults: ExtensionPluginDefaults[] = ${JSON.stringify(entries, null, 2)};
`;
}

export async function writeGeneratedPluginDefaultsSnapshot() {
  const manifests = await listPluginManifests();
  const entries = manifests
    .map((manifest) => {
      const definition = getPluginDefinition(manifest.id);
      if (!definition) {
        return null;
      }

      const baseline = applyExtensionDefaultsToSeedState(
        definition,
        {
          enabled: definition.defaultEnabled === true,
          config: mergeConfigDefaults(definition, {}),
          capabilityState: normalizeCapabilityState(definition, {}),
          extensionBindings: normalizeExtensionBindings(definition, {}),
        },
        pluginDefaults,
      );

      const entry: PersistedPluginDefaultsEntry = {
        pluginId: manifest.id,
      };

      if (manifest.installState.enabled !== baseline.enabled) {
        entry.enabled = manifest.installState.enabled;
      }
      if (JSON.stringify(manifest.installState.config) !== JSON.stringify(baseline.config)) {
        entry.configPatch = manifest.installState.config;
      }
      if (JSON.stringify(manifest.installState.capabilityState) !== JSON.stringify(baseline.capabilityState)) {
        entry.capabilityStatePatch = manifest.installState.capabilityState;
      }
      if (JSON.stringify(manifest.installState.extensionBindings) !== JSON.stringify(baseline.extensionBindings)) {
        entry.extensionBindingsPatch = manifest.installState.extensionBindings;
      }

      return Object.keys(entry).length > 1 ? entry : null;
    })
    .filter((entry): entry is PersistedPluginDefaultsEntry => entry !== null)
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId));

  await writeTextFile(generatedPluginDefaultsFile, serializeGeneratedPluginDefaults(entries));
  return generatedPluginDefaultsFile;
}

export const pluginOrchestratorTestUtils = {
  applyExtensionDefaultsToSeedState,
  serializeGeneratedPluginDefaults,
  validateExtensionPluginDefaults,
};

function isEnvConfigured(key: string) {
  const processValue = process.env[key];
  if (typeof processValue === "string") {
    return processValue.length > 0;
  }

  const envValue = (env as Record<string, unknown>)[key];
  if (typeof envValue === "string") {
    return envValue.length > 0;
  }

  return envValue !== undefined && envValue !== null;
}

function requiredEnvKeys(definition: PluginDefinition, state: PluginInstallState) {
  return definition.getRequiredEnv?.(state) ?? definition.requiredEnv;
}

function normalizeCapabilityState(definition: PluginDefinition, input: Record<string, unknown>): Record<string, boolean> {
  const merged = {
    ...definition.defaultCapabilityState,
  } as Record<string, boolean>;

  for (const capability of definition.capabilities) {
    const value = input[capability.key];
    if (typeof value === "boolean") {
      merged[capability.key] = value;
      continue;
    }
    if (merged[capability.key] === undefined) {
      merged[capability.key] = capability.enabledByDefault;
    }
  }

  return merged;
}

function normalizeExtensionBindings(definition: PluginDefinition, input: Record<string, unknown>): PluginExtensionBindings {
  const merged: PluginExtensionBindings = {
    ...definition.defaultExtensionBindings,
  };

  for (const slot of definition.extensionSlots) {
    const raw = input[slot.key];
    if (typeof raw === "string" && raw.length > 0) {
      merged[slot.key] = raw;
    } else if (slot.defaultHandlerId && !merged[slot.key]) {
      merged[slot.key] = slot.defaultHandlerId;
    }
  }

  return merged;
}

function validatePluginConfig(definition: PluginDefinition, config: PluginConfig): string | null {
  const allowedKeys = new Set(definition.configSchema.map((field) => field.key));
  for (const key of Object.keys(config)) {
    if (!definition.allowUnknownConfigKeys && !allowedKeys.has(key)) {
      return `Unknown config key: ${key}`;
    }
  }

  for (const field of definition.configSchema) {
    const value = config[field.key];
    if (field.required && (value === undefined || value === null || value === "")) {
      return `${field.label} is required`;
    }
    if (value === undefined || value === null) {
      continue;
    }
    if (field.type === "boolean" && typeof value !== "boolean") {
      return `${field.label} must be a boolean`;
    }
    if (field.type === "number" && typeof value !== "number") {
      return `${field.label} must be a number`;
    }
    if ((field.type === "string" || field.type === "password" || field.type === "url") && typeof value !== "string") {
      return `${field.label} must be a string`;
    }
  }

  const customError = definition.validateConfig?.(config, { forEnable: false });
  if (customError) {
    return customError;
  }

  return null;
}

function capabilityMissingRequirements(
  capabilityState: Record<string, boolean>,
  capability: PluginDefinition["capabilities"][number],
) {
  return capability.requires.filter((key) => capabilityState[key] !== true);
}

function isSlotEnabled(slotKey: string, capabilityState: Record<string, boolean>) {
  if (slotKey === "ac") {
    return capabilityState.dynamicAccessControl === true;
  }
  if (slotKey === "sendInvitationEmail") {
    return capabilityState.invitations === true;
  }
  if (slotKey === "teams.defaultTeam.customCreateDefaultTeam") {
    return capabilityState.teams === true;
  }
  if (slotKey.startsWith("organizationHooks.")) {
    const hookKey = slotKey.replace("organizationHooks.", "");
    if (ORGANIZATION_INVITATION_HOOK_KEYS.includes(hookKey)) {
      return capabilityState.invitations === true;
    }
    if (ORGANIZATION_TEAM_HOOK_KEYS.includes(hookKey)) {
      return capabilityState.teams === true;
    }
  }
  return capabilityState.core === true;
}

function isSlotRequired(
  slot: PluginDefinition["extensionSlots"][number],
  capabilityState: Record<string, boolean>,
) {
  if (!slot.required) {
    return false;
  }
  return isSlotEnabled(slot.key, capabilityState);
}

function buildDependencyState(
  definition: PluginDefinition,
  rowsById: Map<PluginId, PluginContextRow>,
): PluginDependencyState[] {
  return definition.dependencies.map((pluginId) => {
    const dependency = rowsById.get(pluginId);
    return {
      pluginId,
      satisfied: dependency?.enabled === true,
      reason: dependency?.enabled === true ? null : `${pluginId} must be enabled`,
    };
  });
}

function buildHealth(missingEnvKeys: string[], dependencyState: PluginDependencyState[], capabilityIssues: string[]): PluginHealth {
  const issues = [
    ...missingEnvKeys.map((key) => `Missing env: ${key}`),
    ...dependencyState.filter((entry) => !entry.satisfied).map((entry) => entry.reason ?? `${entry.pluginId} not enabled`),
    ...capabilityIssues,
  ];

  if (issues.length === 0) {
    return { status: "healthy", issues: [] };
  }

  return {
    status: missingEnvKeys.length > 0 ? "error" : "degraded",
    issues,
  };
}

async function listExistingDatabaseTables() {
  const rows = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = current_schema()
      and table_type = 'BASE TABLE'
  `;

  return new Set(rows.map((row) => row.table_name));
}

export async function ensurePluginConfigStateSchema() {
  await sql.unsafe(`
alter table "_plugin_configs" add column if not exists "version" text not null default '1.0.0';
alter table "_plugin_configs" add column if not exists "capability_state" jsonb not null default '{}'::jsonb;
alter table "_plugin_configs" add column if not exists "dependency_state" jsonb not null default '[]'::jsonb;
alter table "_plugin_configs" add column if not exists "health" jsonb not null default '{}'::jsonb;
alter table "_plugin_configs" add column if not exists "provisioning_state" jsonb not null default '{}'::jsonb;
alter table "_plugin_configs" add column if not exists "extension_bindings" jsonb not null default '{}'::jsonb;
  `);
}

export async function seedPluginInstallStates() {
  await ensurePluginConfigStateSchema();
  const defaults = [...pluginDefaults, ...(await loadGeneratedExtensionPluginDefaults())];
  validateExtensionPluginDefaults(defaults);

  for (const definition of pluginRegistry) {
    const existing = await db.query.pluginConfigs.findFirst({
      where: (table, operators) => operators.eq(table.pluginId, definition.id),
    });

    if (existing) {
      if (definition.required && !existing.enabled) {
        await db
          .update(pluginConfigs)
          .set({
            enabled: true,
            version: existing.version ?? definition.version,
            updatedAt: new Date(),
          })
          .where(eq(pluginConfigs.pluginId, definition.id));
      }
      continue;
    }

    const seedState = applyExtensionDefaultsToSeedState(definition, {
      enabled: definition.defaultEnabled === true,
      config: mergeConfigDefaults(definition, {}),
      capabilityState: normalizeCapabilityState(definition, {}),
      extensionBindings: normalizeExtensionBindings(definition, {}),
    }, defaults);

    await db.insert(pluginConfigs).values({
      id: crypto.randomUUID(),
      pluginId: definition.id,
      enabled: seedState.enabled,
      version: definition.version,
      config: seedState.config,
      capabilityState: seedState.capabilityState,
      dependencyState: [],
      health: { status: "unknown", issues: [] },
      provisioningState: { status: "not-required", appliedMigrationKeys: [], rollbackMigrationKeys: [], details: [] },
      extensionBindings: seedState.extensionBindings,
    });
  }
}

export async function loadPluginRows() {
  await ensurePluginConfigStateSchema();
  const rows = await db.select().from(pluginConfigs);
  return rows.map((row) => {
    const definition = getPluginDefinition(row.pluginId);
    if (!definition) {
      return null;
    }

    return {
      pluginId: definition.id,
      enabled: row.enabled,
      version: row.version ?? definition.version,
      config: mergeConfigDefaults(definition, asObject(row.config) as PluginConfig),
      capabilityState: normalizeCapabilityState(definition, asObject(row.capabilityState)),
      dependencyState: Array.isArray(row.dependencyState) ? (row.dependencyState as PluginDependencyState[]) : [],
      health: (asObject(row.health) as PluginHealth) ?? { status: "unknown", issues: [] },
      provisioningState: {
        status:
          typeof asObject(row.provisioningState).status === "string"
            ? (asObject(row.provisioningState).status as PluginInstallState["provisioningState"]["status"])
            : definition.getProvisionPlan
              ? row.enabled
                ? "pending"
                : "not-required"
              : "not-required",
        appliedMigrationKeys: Array.isArray(asObject(row.provisioningState).appliedMigrationKeys)
          ? (asObject(row.provisioningState).appliedMigrationKeys as string[])
          : [],
        rollbackMigrationKeys: Array.isArray(asObject(row.provisioningState).rollbackMigrationKeys)
          ? (asObject(row.provisioningState).rollbackMigrationKeys as string[])
          : [],
        details: Array.isArray(asObject(row.provisioningState).details) ? (asObject(row.provisioningState).details as string[]) : [],
      },
      extensionBindings: normalizeExtensionBindings(definition, asObject(row.extensionBindings)),
    } satisfies PluginContextRow;
  }).filter((row): row is PluginContextRow => row !== null);
}

function buildInstallState(
  definition: PluginDefinition,
  row: PluginContextRow,
  rowsById: Map<PluginId, PluginContextRow>,
): PluginInstallState {
  const dependencyState = buildDependencyState(definition, rowsById);
  const capabilityIssues: string[] = [];

  for (const capability of definition.capabilities) {
    if (row.capabilityState[capability.key] !== true) {
      continue;
    }
    for (const missing of capabilityMissingRequirements(row.capabilityState, capability)) {
      capabilityIssues.push(`${definition.id}.${capability.key} requires capability ${missing}`);
    }
  }

  for (const slot of definition.extensionSlots) {
    if (!isSlotEnabled(slot.key, row.capabilityState)) {
      continue;
    }
    if (!isSlotRequired(slot, row.capabilityState)) {
      continue;
    }
    const selectedHandlerId = row.extensionBindings[slot.key];
    const allowedHandlerIds = getSlotHandlerDefinitions(slot).map((handler) => handler.id);
    if (!selectedHandlerId) {
      capabilityIssues.push(`${definition.id}.${slot.key} requires a registered handler`);
      continue;
    }
    if (allowedHandlerIds.length > 0 && !allowedHandlerIds.includes(selectedHandlerId)) {
      capabilityIssues.push(`${definition.id}.${slot.key} uses an unsupported handler`);
    }
  }

  return {
    pluginId: definition.id,
    enabled: definition.required ? true : row.enabled,
    version: row.version ?? definition.version,
    config: row.config,
    capabilityState: row.capabilityState,
    dependencyState,
    health: buildHealth(
      requiredEnvKeys(definition, {
        pluginId: definition.id,
        enabled: definition.required ? true : row.enabled,
        version: row.version ?? definition.version,
        config: row.config,
        capabilityState: row.capabilityState,
        dependencyState,
        health: row.health,
        provisioningState: row.provisioningState,
        extensionBindings: row.extensionBindings,
      }).filter((key) => !isEnvConfigured(key)),
      dependencyState,
      capabilityIssues,
    ),
    provisioningState: row.provisioningState,
    extensionBindings: row.extensionBindings,
  };
}

function buildCapabilities(definition: PluginDefinition, state: PluginInstallState): PluginCapability[] {
  return definition.capabilities.map((capability) => ({
    ...capability,
    enabled: state.capabilityState[capability.key] === true,
    missingRequirements:
      state.capabilityState[capability.key] === true
        ? capabilityMissingRequirements(state.capabilityState, capability)
        : [],
  }));
}

function getSlotHandlerDefinitions(slot: PluginDefinition["extensionSlots"][number]) {
  if (slot.handlerIds.length > 0) {
    return slot.handlerIds
      .map((handlerId) => getExtensionHandlerDefinition(handlerId))
      .filter((handler): handler is NonNullable<typeof handler> => handler !== null);
  }

  return extensionHandlers.filter((handler) => handler.slotKeys?.includes(slot.key));
}

function buildExtensionSlots(definition: PluginDefinition, state: PluginInstallState): PluginExtensionSlot[] {
  return definition.extensionSlots.map((slot) => ({
    ...slot,
    enabled: isSlotEnabled(slot.key, state.capabilityState),
    selectedHandlerId: state.extensionBindings[slot.key] ?? slot.defaultHandlerId ?? null,
    availableHandlers: getSlotHandlerDefinitions(slot)
      .map((handler) => ({
        id: handler.id,
        label: handler.label,
        description: handler.description,
      })),
  }));
}

function buildModels(definition: PluginDefinition, state: PluginInstallState, existingTables: Set<string>): PluginModel[] {
  return definition.models.map((model) => ({
    ...model,
    provisioned:
      existingTables.has(model.tableName) && model.capabilityKeys.every((key) => state.capabilityState[key] === true),
  }));
}

function buildManifest(
  definition: PluginDefinition,
  state: PluginInstallState,
  existingTables: Set<string>,
): PluginManifest {
  const capabilities = buildCapabilities(definition, state);
  const extensionSlots = buildExtensionSlots(definition, state);
  const models = buildModels(definition, state, existingTables);

  return {
    id: definition.id,
    version: definition.version,
    label: definition.label,
    description: definition.description,
    category: definition.category,
    documentationUrl: definition.documentationUrl,
    defaultEnabled: definition.defaultEnabled === true,
    required: definition.required === true,
    dependencies: definition.dependencies,
    requiredEnv: requiredEnvKeys(definition, state),
    missingEnvKeys: requiredEnvKeys(definition, state).filter((key) => !isEnvConfigured(key)),
    configSchema: definition.configSchema.map((field) => ({
      required: false,
      ...field,
    })),
    capabilities,
    extensionSlots,
    models,
    adminPanels: definition.adminPanels.map((panel) => ({
      ...panel,
      enabled: panel.capabilityKeys.every((key) => state.capabilityState[key] === true),
    })),
    examples: definition.examples.filter((example) => example.capabilityKeys.every((key) => state.capabilityState[key] === true)),
    clientNamespaces: state.enabled ? (definition.composeClient?.(state) ?? definition.clientNamespaces) : [],
    serverOperations: state.enabled ? definition.serverOperations : [],
    installState: state,
  };
}

function manifestToCatalogItem(manifest: PluginManifest): PluginCatalogItem {
  return {
    id: manifest.id,
    label: manifest.label,
    description: manifest.description,
    category: manifest.category,
    documentationUrl: manifest.documentationUrl,
    defaultEnabled: manifest.defaultEnabled,
    required: manifest.required,
    status: manifest.missingEnvKeys.length > 0 ? "requires-env" : manifest.installState.enabled ? "enabled" : "disabled",
    missingEnvKeys: manifest.missingEnvKeys,
    config: manifest.installState.config,
    configSchema: manifest.configSchema,
    requiredEnv: manifest.requiredEnv,
    migrationStrategy: getPluginDefinition(manifest.id)?.migrationStrategy ?? "none",
    version: manifest.version,
    dependencies: manifest.dependencies,
    capabilities: manifest.capabilities,
    extensionSlots: manifest.extensionSlots,
    models: manifest.models,
    adminPanels: manifest.adminPanels,
    examples: manifest.examples,
    clientNamespaces: manifest.clientNamespaces,
    serverOperations: manifest.serverOperations,
    installState: manifest.installState,
    health: manifest.installState.health,
    provisioningState: manifest.installState.provisioningState,
  };
}

export async function listPluginManifests() {
  const rows = await loadPluginRows();
  const rowsById = new Map(rows.map((row) => [row.pluginId, row]));
  const existingTables = await listExistingDatabaseTables();

  return pluginRegistry.map((definition) => {
    const row =
      rowsById.get(definition.id) ??
      ({
        pluginId: definition.id,
        enabled: definition.defaultEnabled === true,
        version: definition.version,
        config: mergeConfigDefaults(definition, {}),
        capabilityState: normalizeCapabilityState(definition, {}),
        dependencyState: [],
        health: { status: "unknown", issues: [] },
        provisioningState: { status: "not-required", appliedMigrationKeys: [], rollbackMigrationKeys: [], details: [] },
        extensionBindings: normalizeExtensionBindings(definition, {}),
      } satisfies PluginContextRow);
    const state = buildInstallState(definition, row, rowsById);
    return buildManifest(definition, state, existingTables);
  });
}

export async function getPluginManifest(pluginId: PluginId) {
  const manifests = await listPluginManifests();
  const manifest = manifests.find((entry) => entry.id === pluginId);
  if (!manifest) {
    throw new HttpError(404, `Unknown plugin ${pluginId}`);
  }
  return manifest;
}

export async function listPluginCatalogItems() {
  const manifests = await listPluginManifests();
  return manifests.map(manifestToCatalogItem);
}

export async function getEnabledRuntimePlugins() {
  const manifests = await listPluginManifests();
  return manifests
    .filter((manifest) => manifest.installState.enabled)
    .map((manifest) => ({
      definition: getPluginDefinition(manifest.id)!,
      state: manifest.installState,
    }));
}

export async function persistPluginInstallState(pluginId: PluginId, update: Partial<PluginContextRow>) {
  await db
    .update(pluginConfigs)
    .set({
      ...(update.enabled === undefined ? {} : { enabled: update.enabled }),
      ...(update.version === undefined ? {} : { version: update.version }),
      ...(update.config === undefined ? {} : { config: update.config }),
      ...(update.capabilityState === undefined ? {} : { capabilityState: update.capabilityState }),
      ...(update.dependencyState === undefined ? {} : { dependencyState: update.dependencyState }),
      ...(update.health === undefined ? {} : { health: update.health }),
      ...(update.provisioningState === undefined ? {} : { provisioningState: update.provisioningState }),
      ...(update.extensionBindings === undefined ? {} : { extensionBindings: update.extensionBindings }),
      updatedAt: new Date(),
    })
    .where(eq(pluginConfigs.pluginId, pluginId));
}

export async function validatePluginConfigUpdate(pluginId: PluginId, input: PluginConfigUpdate, forEnable = false) {
  const definition = getPluginDefinition(pluginId);
  if (!definition) {
    throw new HttpError(404, `Unknown plugin ${pluginId}`);
  }

  const config = mergeConfigDefaults(definition, input.config ?? {});
  const configError = validatePluginConfig(definition, config);
  if (configError) {
    throw new HttpError(400, configError);
  }

  const customValidationError = definition.validateConfig?.(config, { forEnable });
  if (customValidationError) {
    throw new HttpError(400, customValidationError);
  }

  const capabilityState = normalizeCapabilityState(definition, asObject(input.capabilityState));
  const extensionBindings = normalizeExtensionBindings(definition, asObject(input.extensionBindings));

  for (const capability of definition.capabilities) {
    if (capabilityState[capability.key] !== true) {
      continue;
    }
    const missing = capabilityMissingRequirements(capabilityState, capability);
    if (missing.length > 0) {
      throw new HttpError(400, `${definition.id}.${capability.key} requires: ${missing.join(", ")}`);
    }
  }

  for (const slot of definition.extensionSlots) {
    if (!isSlotEnabled(slot.key, capabilityState)) {
      continue;
    }

    const handlerId = extensionBindings[slot.key];
    const allowedHandlerIds = getSlotHandlerDefinitions(slot).map((handler) => handler.id);
    if (handlerId && allowedHandlerIds.length > 0 && !allowedHandlerIds.includes(handlerId)) {
      throw new HttpError(400, `${slot.key} does not allow handler ${handlerId}`);
    }

    if (isSlotRequired(slot, capabilityState) && !handlerId) {
      throw new HttpError(400, `${slot.key} requires a registered handler`);
    }
  }

  const manifests = await listPluginManifests();
  const dependencyProblems = definition.dependencies.filter((dependency) => {
    const dependencyManifest = manifests.find((entry) => entry.id === dependency);
    return dependencyManifest?.installState.enabled !== true;
  });

  if (definition.id === "apiKey" && config.references === "organization") {
    const organizationManifest = manifests.find((entry) => entry.id === "organization");
    if (organizationManifest?.installState.enabled !== true) {
      throw new HttpError(400, "apiKey references=organization requires the organization plugin to be enabled");
    }
  }

  if (forEnable && dependencyProblems.length > 0) {
    throw new HttpError(400, `${pluginId} depends on: ${dependencyProblems.join(", ")}`);
  }

  return {
    definition,
    config,
    capabilityState,
    extensionBindings,
  };
}

export function createRuntimePluginContext(state: PluginInstallState): RuntimePluginContext {
  return {
    state,
    getHandler(slotKey: string) {
      const handlerId = state.extensionBindings[slotKey];
      if (!handlerId) {
        return null;
      }
      const definition = getExtensionHandlerDefinition(handlerId);
      return definition?.build() ?? null;
    },
  };
}

export async function listPluginOwnedTables() {
  const manifests = await listPluginManifests();
  return manifests.flatMap((manifest) =>
    manifest.models
      .filter((model) => model.provisioned)
      .map((model) => ({
        pluginId: manifest.id,
        tableName: model.tableName,
        label: model.label,
      })),
  );
}

export function listAvailableExtensionHandlers() {
  return extensionHandlers.map((handler) => ({
    id: handler.id,
    label: handler.label,
    description: handler.description,
  }));
}
