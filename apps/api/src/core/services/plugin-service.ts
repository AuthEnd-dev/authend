import type { PluginConfigUpdate, PluginId } from "@authend/shared";
import { HttpError } from "../lib/http";
import { invalidateAuth } from "./auth-service";
import { writeAuditLog } from "./audit-service";
import { dispatchWebhookEvent } from "./webhook-service";
import {
  getPluginManifest,
  listPluginCatalogItems,
  listPluginManifests,
  persistPluginInstallState,
  seedPluginInstallStates,
  validatePluginConfigUpdate,
  writeGeneratedPluginDefaultsSnapshot,
} from "./plugin-orchestrator";

export async function seedPluginConfigs() {
  await seedPluginInstallStates();
}

export async function listPluginCatalog() {
  return listPluginCatalogItems();
}

export async function listPluginCapabilityManifests() {
  return listPluginManifests();
}

export async function readPluginCapabilityManifest(pluginId: PluginId) {
  return getPluginManifest(pluginId);
}

function statelessProvisioningState() {
  return {
    status: "not-required" as const,
    appliedMigrationKeys: [] as string[],
    rollbackMigrationKeys: [] as string[],
    details: [] as string[],
  };
}

async function syncDerivedState(pluginId: PluginId) {
  await persistPluginInstallState(pluginId, {
    provisioningState: statelessProvisioningState(),
  });
  const manifest = await getPluginManifest(pluginId);
  await persistPluginInstallState(pluginId, {
    dependencyState: manifest.installState.dependencyState,
    health: manifest.installState.health,
    provisioningState: statelessProvisioningState(),
  });
  return getPluginManifest(pluginId);
}

export async function ensureEnabledPluginsProvisioned(actorUserId?: string | null) {
  const manifests = await listPluginManifests();

  for (const manifest of manifests) {
    await syncDerivedState(manifest.id);
  }

  return [];
}

export async function savePluginConfig(pluginId: PluginId, update: PluginConfigUpdate, actorUserId?: string | null) {
  const validated = await validatePluginConfigUpdate(pluginId, update);
  const current = await getPluginManifest(pluginId);
  const capabilitiesChanged =
    JSON.stringify(current.installState.capabilityState) !== JSON.stringify(validated.capabilityState);

  await persistPluginInstallState(pluginId, {
    version: validated.definition.version,
    config: validated.config,
    capabilityState: validated.capabilityState,
    extensionBindings: validated.extensionBindings,
    provisioningState: statelessProvisioningState(),
  });

  const manifest = await syncDerivedState(pluginId);
  await writeGeneratedPluginDefaultsSnapshot();

  await writeAuditLog({
    action: "plugin.config.updated",
    actorUserId,
    target: pluginId,
    payload: {
      config: validated.config,
      capabilityState: validated.capabilityState,
      extensionBindings: validated.extensionBindings,
      capabilitiesChanged,
    },
  });

  await invalidateAuth();
  return manifest;
}

export async function enablePlugin(pluginId: PluginId, actorUserId?: string | null) {
  const current = await getPluginManifest(pluginId);
  if (current.missingEnvKeys.length > 0) {
    throw new HttpError(400, `Plugin ${pluginId} requires env vars: ${current.missingEnvKeys.join(", ")}`);
  }

  await validatePluginConfigUpdate(
    pluginId,
    {
      config: current.installState.config,
      capabilityState: current.installState.capabilityState,
      extensionBindings: current.installState.extensionBindings,
    },
    true,
  );

  await persistPluginInstallState(pluginId, {
    enabled: true,
    version: current.version,
    provisioningState: statelessProvisioningState(),
  });

  const manifest = await syncDerivedState(pluginId);
  await writeGeneratedPluginDefaultsSnapshot();

  await writeAuditLog({
    action: "plugin.enabled",
    actorUserId,
    target: pluginId,
    payload: {
      capabilities: manifest.installState.capabilityState,
      extensionBindings: manifest.installState.extensionBindings,
    },
  });

  await invalidateAuth();

  void dispatchWebhookEvent("plugin.enabled", { pluginId }).catch(() => {});

  return manifest;
}

export async function disablePlugin(pluginId: PluginId, actorUserId?: string | null) {
  const current = await getPluginManifest(pluginId);
  if (current.required) {
    throw new HttpError(400, `Plugin ${pluginId} is required and cannot be disabled.`);
  }
  if (!current.installState.enabled) {
    return current;
  }

  await persistPluginInstallState(pluginId, {
    enabled: false,
    provisioningState: statelessProvisioningState(),
  });
  const manifest = await syncDerivedState(pluginId);
  await writeGeneratedPluginDefaultsSnapshot();

  await writeAuditLog({
    action: "plugin.disabled",
    actorUserId,
    target: pluginId,
    payload: {
      capabilities: manifest.installState.capabilityState,
    },
  });

  await invalidateAuth();

  void dispatchWebhookEvent("plugin.disabled", { pluginId }).catch(() => {});

  return manifest;
}
