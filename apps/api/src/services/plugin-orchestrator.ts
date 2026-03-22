import { eq } from "drizzle-orm";
import type {
  PluginCapability,
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
import { extensionHandlers, getExtensionHandlerDefinition } from "../plugins/extension-registry";
import {
  ORGANIZATION_INVITATION_HOOK_KEYS,
  ORGANIZATION_TEAM_HOOK_KEYS,
} from "../plugins/organization/manifest";
import { getPluginDefinition, pluginRegistry } from "../plugins/registry";
import type { PluginContextRow, PluginDefinition, RuntimePluginContext } from "../plugins/types";

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mergeConfigDefaults(definition: PluginDefinition, config: PluginConfig): PluginConfig {
  return {
    ...(definition.defaultConfig ?? {}),
    ...config,
  };
}

function normalizeCapabilityState(definition: PluginDefinition, input: Record<string, unknown>): Record<string, boolean> {
  const merged = {
    ...(definition.defaultCapabilityState ?? {}),
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
    ...(definition.defaultExtensionBindings ?? {}),
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
    if (!allowedKeys.has(key)) {
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

function isSlotRequired(slotKey: string, capabilityState: Record<string, boolean>) {
  if (slotKey === "ac") {
    return capabilityState.dynamicAccessControl === true;
  }
  return false;
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
alter table "plugin_configs" add column if not exists "version" text not null default '1.0.0';
alter table "plugin_configs" add column if not exists "capability_state" jsonb not null default '{}'::jsonb;
alter table "plugin_configs" add column if not exists "dependency_state" jsonb not null default '[]'::jsonb;
alter table "plugin_configs" add column if not exists "health" jsonb not null default '{}'::jsonb;
alter table "plugin_configs" add column if not exists "provisioning_state" jsonb not null default '{}'::jsonb;
alter table "plugin_configs" add column if not exists "extension_bindings" jsonb not null default '{}'::jsonb;
  `);
}

export async function seedPluginInstallStates() {
  await ensurePluginConfigStateSchema();

  for (const definition of pluginRegistry) {
    const existing = await db.query.pluginConfigs.findFirst({
      where: (table, operators) => operators.eq(table.pluginId, definition.id),
    });

    if (existing) {
      continue;
    }

    await db.insert(pluginConfigs).values({
      id: crypto.randomUUID(),
      pluginId: definition.id,
      enabled: false,
      version: definition.version,
      config: mergeConfigDefaults(definition, {}),
      capabilityState: normalizeCapabilityState(definition, {}),
      dependencyState: [],
      health: { status: "unknown", issues: [] },
      provisioningState: { status: "not-required", appliedMigrationKeys: [], rollbackMigrationKeys: [], details: [] },
      extensionBindings: normalizeExtensionBindings(definition, {}),
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
    if (!isSlotRequired(slot.key, row.capabilityState)) {
      continue;
    }
    const selectedHandlerId = row.extensionBindings[slot.key];
    if (!selectedHandlerId) {
      capabilityIssues.push(`${definition.id}.${slot.key} requires a registered handler`);
      continue;
    }
    if (slot.handlerIds.length > 0 && !slot.handlerIds.includes(selectedHandlerId)) {
      capabilityIssues.push(`${definition.id}.${slot.key} uses an unsupported handler`);
    }
  }

  return {
    pluginId: definition.id,
    enabled: row.enabled,
    version: row.version ?? definition.version,
    config: row.config,
    capabilityState: row.capabilityState,
    dependencyState,
    health: buildHealth(
      definition.requiredEnv.filter((key) => !(env as Record<string, unknown>)[key]),
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

function buildExtensionSlots(definition: PluginDefinition, state: PluginInstallState): PluginExtensionSlot[] {
  return definition.extensionSlots.map((slot) => ({
    ...slot,
    enabled: isSlotEnabled(slot.key, state.capabilityState),
    selectedHandlerId: state.extensionBindings[slot.key] ?? slot.defaultHandlerId ?? null,
    availableHandlers: slot.handlerIds
      .map((handlerId) => getExtensionHandlerDefinition(handlerId))
      .filter((handler): handler is NonNullable<typeof handler> => handler !== null)
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
    dependencies: definition.dependencies,
    requiredEnv: definition.requiredEnv,
    missingEnvKeys: definition.requiredEnv.filter((key) => !(env as Record<string, unknown>)[key]),
    configSchema: definition.configSchema,
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
        enabled: false,
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
    if (handlerId && slot.handlerIds.length > 0 && !slot.handlerIds.includes(handlerId)) {
      throw new HttpError(400, `${slot.key} does not allow handler ${handlerId}`);
    }

    if (isSlotRequired(slot.key, capabilityState) && !handlerId) {
      throw new HttpError(400, `${slot.key} requires a registered handler`);
    }
  }

  const manifests = await listPluginManifests();
  const dependencyProblems = definition.dependencies.filter((dependency) => {
    const dependencyManifest = manifests.find((entry) => entry.id === dependency);
    return dependencyManifest?.installState.enabled !== true;
  });

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
