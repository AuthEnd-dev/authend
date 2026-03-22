import type { PluginConfigUpdate, PluginId } from "@authend/shared";
import { HttpError } from "../lib/http";
import { writeGeneratedMigration, applySqlMigration, rollbackSqlMigration } from "./migration-service";
import { invalidateAuth } from "./auth-service";
import { writeAuditLog } from "./audit-service";
import { getPluginDefinition } from "../plugins/registry";
import {
  getPluginManifest,
  listPluginCatalogItems,
  listPluginManifests,
  persistPluginInstallState,
  seedPluginInstallStates,
  validatePluginConfigUpdate,
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

async function syncDerivedState(pluginId: PluginId) {
  const manifest = await getPluginManifest(pluginId);
  await persistPluginInstallState(pluginId, {
    dependencyState: manifest.installState.dependencyState,
    health: manifest.installState.health,
  });
  return manifest;
}

async function provisionPlugin(pluginId: PluginId, actorUserId?: string | null) {
  const manifest = await getPluginManifest(pluginId);
  const plan = getPluginDefinition(pluginId)?.getProvisionPlan?.(manifest.installState) ?? null;

  if (!plan) {
    await persistPluginInstallState(pluginId, {
      provisioningState: {
        status: "not-required",
        appliedMigrationKeys: [],
        rollbackMigrationKeys: manifest.installState.provisioningState.rollbackMigrationKeys,
        details: [],
      },
    });
    return false;
  }

  await writeGeneratedMigration(plan.key, plan.sql);
  const didApply = await applySqlMigration({
    key: plan.key,
    title: plan.title,
    sqlText: plan.sql,
    actorUserId,
  });

  await persistPluginInstallState(pluginId, {
    provisioningState: {
      status: "provisioned",
      appliedMigrationKeys: Array.from(new Set([...manifest.installState.provisioningState.appliedMigrationKeys, plan.key])),
      rollbackMigrationKeys: manifest.installState.provisioningState.rollbackMigrationKeys,
      details: didApply ? [`Applied ${plan.key}`] : [`${plan.key} already applied`],
    },
  });

  return didApply;
}

async function rollbackPlugin(
  pluginId: PluginId,
  actorUserId?: string | null,
  manifestOverride?: Awaited<ReturnType<typeof getPluginManifest>>,
) {
  const manifest = manifestOverride ?? (await getPluginManifest(pluginId));
  const plan = getPluginDefinition(pluginId)?.getRollbackPlan?.(manifest.installState) ?? null;

  if (!plan) {
    await persistPluginInstallState(pluginId, {
      provisioningState: {
        status: "rolled_back",
        appliedMigrationKeys: manifest.installState.provisioningState.appliedMigrationKeys,
        rollbackMigrationKeys: manifest.installState.provisioningState.rollbackMigrationKeys,
        details: [],
      },
    });
    return false;
  }

  const didRollback = await rollbackSqlMigration({
    key: plan.key,
    title: plan.title,
    sqlText: plan.sql,
    actorUserId,
  });

  await persistPluginInstallState(pluginId, {
    provisioningState: {
      status: "rolled_back",
      appliedMigrationKeys: manifest.installState.provisioningState.appliedMigrationKeys,
      rollbackMigrationKeys: Array.from(new Set([...manifest.installState.provisioningState.rollbackMigrationKeys, plan.key])),
      details: didRollback ? [`Rolled back ${plan.key}`] : [`${plan.key} already rolled back`],
    },
  });

  return didRollback;
}

export async function ensureEnabledPluginsProvisioned(actorUserId?: string | null) {
  const manifests = await listPluginManifests();
  const applied: string[] = [];

  for (const manifest of manifests) {
    if (!manifest.installState.enabled) {
      continue;
    }
    const didApply = await provisionPlugin(manifest.id, actorUserId);
    if (didApply) {
      applied.push(manifest.id);
    }
    await syncDerivedState(manifest.id);
  }

  return applied;
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
  });

  if (current.installState.enabled) {
    if (capabilitiesChanged) {
      await rollbackPlugin(pluginId, actorUserId, current);
    }
    await provisionPlugin(pluginId, actorUserId);
  }

  const manifest = await syncDerivedState(pluginId);

  await writeAuditLog({
    action: "plugin.config.updated",
    actorUserId,
    target: pluginId,
    payload: {
      config: validated.config,
      capabilityState: validated.capabilityState,
      extensionBindings: validated.extensionBindings,
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
  });

  await provisionPlugin(pluginId, actorUserId);
  const manifest = await syncDerivedState(pluginId);

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
  return manifest;
}

export async function disablePlugin(pluginId: PluginId, actorUserId?: string | null) {
  const current = await getPluginManifest(pluginId);
  if (!current.installState.enabled) {
    return current;
  }

  await rollbackPlugin(pluginId, actorUserId);
  await persistPluginInstallState(pluginId, {
    enabled: false,
  });
  const manifest = await syncDerivedState(pluginId);

  await writeAuditLog({
    action: "plugin.disabled",
    actorUserId,
    target: pluginId,
    payload: {
      capabilities: manifest.installState.capabilityState,
    },
  });

  await invalidateAuth();
  return manifest;
}
