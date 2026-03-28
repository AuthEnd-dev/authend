import type {
  PluginConfigUpdate,
  PluginId,
  SchemaDraft,
  TableApiConfig,
} from "@authend/shared";
import { buildApiResource, buildApiPreview, listApiResources, saveTableApiConfig } from "../../../apps/api/src/core/services/api-design-service";
import {
  createRecord,
  deleteRecord,
  getClientTableDescriptor,
  getRecord,
  listRecords,
  type RecordAccessContext,
  updateRecord,
} from "../../../apps/api/src/core/services/crud-service";
import {
  disablePlugin,
  enablePlugin,
  listPluginCapabilityManifests,
  readPluginCapabilityManifest,
  savePluginConfig,
} from "../../../apps/api/src/core/services/plugin-service";
import { applyDraft, getSchemaDraft, getSchemaDriftReport, previewDraft } from "../../../apps/api/src/core/services/schema-service";
import { buildSdkSchemaManifest } from "../../../apps/api/src/core/services/sdk-service";
import {
  getStorageFileRecordById,
  headStoredFile,
  listStorageFileRecords,
  readStoredObjectBuffer,
  removeStoredFile,
  writeManagedStorageObject,
} from "../../../apps/api/src/core/services/storage-service";
import { MCP_ACTOR_USER_ID } from "./constants";

const superadminAccess: RecordAccessContext = {
  actorKind: "superadmin",
  subjectId: MCP_ACTOR_USER_ID,
  bypassOwnership: true,
};

export type AuthendMcpContext = ReturnType<typeof createAuthendMcpContext>;

export function createAuthendMcpContext() {
  return {
    actorUserId: MCP_ACTOR_USER_ID,
    async getSchemaDraft() {
      return getSchemaDraft();
    },
    async previewSchema(draft: SchemaDraft) {
      return previewDraft(draft);
    },
    async applySchema(draft: SchemaDraft) {
      return applyDraft(draft, MCP_ACTOR_USER_ID);
    },
    async getSchemaDrift() {
      return getSchemaDriftReport();
    },
    async listResources() {
      return listApiResources();
    },
    async getResourceMeta(table: string) {
      return getClientTableDescriptor(table, superadminAccess);
    },
    async getResourcePreview(table: string) {
      return buildApiPreview(table);
    },
    async listRecords(table: string, query: URLSearchParams) {
      return listRecords(table, query, { access: superadminAccess });
    },
    async getRecord(table: string, id: string) {
      return getRecord(table, id, { access: superadminAccess });
    },
    async createRecord(table: string, payload: Record<string, unknown>) {
      return createRecord(table, payload, { access: superadminAccess });
    },
    async updateRecord(table: string, id: string, payload: Record<string, unknown>) {
      return updateRecord(table, id, payload, { access: superadminAccess });
    },
    async deleteRecord(table: string, id: string) {
      return deleteRecord(table, id, { access: superadminAccess });
    },
    async listPlugins() {
      return listPluginCapabilityManifests();
    },
    async getPlugin(pluginId: PluginId) {
      return readPluginCapabilityManifest(pluginId);
    },
    async enablePlugin(pluginId: PluginId) {
      return enablePlugin(pluginId, MCP_ACTOR_USER_ID);
    },
    async disablePlugin(pluginId: PluginId) {
      return disablePlugin(pluginId, MCP_ACTOR_USER_ID);
    },
    async updatePluginConfig(pluginId: PluginId, update: PluginConfigUpdate) {
      return savePluginConfig(pluginId, update, MCP_ACTOR_USER_ID);
    },
    async listStorageObjects(input?: Parameters<typeof listStorageFileRecords>[0]) {
      return listStorageFileRecords(input);
    },
    async getStorageObjectById(id: string) {
      return getStorageFileRecordById(id);
    },
    async getStorageObjectByKey(key: string) {
      const [head, body] = await Promise.all([headStoredFile(key), readStoredObjectBuffer(key)]);
      return {
        ...head,
        bodyBase64: body.toString("base64"),
        bodyText: decodeBodyText(body, head.mimeType),
      };
    },
    async putStorageObject(input: { key: string; body: Buffer; mimeType: string; visibility?: "public" | "private" }) {
      return writeManagedStorageObject(input);
    },
    async deleteStorageObject(key: string) {
      await removeStoredFile(key);
      return { key, deleted: true };
    },
    async getSdkSchema() {
      return buildSdkSchemaManifest();
    },
    async saveTableApiConfig(tableName: string, config: TableApiConfig) {
      return saveTableApiConfig(tableName, config, MCP_ACTOR_USER_ID);
    },
    async buildApiResource(table: string) {
      return buildApiResource(table);
    },
  };
}

function decodeBodyText(buffer: Buffer, mimeType: string | null) {
  if (!mimeType) {
    return null;
  }

  const lower = mimeType.toLowerCase();
  if (
    lower.startsWith("text/") ||
    lower.includes("json") ||
    lower.includes("javascript") ||
    lower.includes("xml") ||
    lower.includes("svg")
  ) {
    return buffer.toString("utf8");
  }

  return null;
}
