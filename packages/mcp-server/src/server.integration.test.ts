import { describe, expect, test } from "bun:test";
import type { PluginId, SchemaDraft, TableApiConfig, TableBlueprint } from "@authend/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAuthendMcpHttpApp } from "./http-app";
import { createAuthendMcpServer } from "./server";

const baseTable: TableBlueprint = {
  name: "post",
  displayName: "Post",
  primaryKey: "id",
  fields: [
    { name: "id", type: "text", nullable: false, unique: true, indexed: true },
    { name: "title", type: "text", nullable: false, unique: false, indexed: false },
  ],
  indexes: [],
  api: {
    authMode: "superadmin",
    access: {
      ownershipField: null,
      list: { actors: ["superadmin"], scope: "all" },
      get: { actors: ["superadmin"], scope: "all" },
      create: { actors: ["superadmin"], scope: "all" },
      update: { actors: ["superadmin"], scope: "all" },
      delete: { actors: ["superadmin"], scope: "all" },
    },
    operations: { list: true, get: true, create: true, update: true, delete: true },
    pagination: { enabled: true, defaultPageSize: 20, maxPageSize: 100 },
    filtering: { enabled: true, fields: [] },
    sorting: { enabled: true, fields: [], defaultOrder: "desc" },
    includes: { enabled: true, fields: [] },
    hiddenFields: [],
    fieldVisibility: {},
  },
  hooks: [],
};

function draft(): SchemaDraft {
  return {
    tables: [baseTable],
    relations: [],
  };
}

function createFakeContext() {
  return {
    actorUserId: "mcp.test",
    async getSchemaDraft() {
      return draft();
    },
    async previewSchema(nextDraft: SchemaDraft) {
      return {
        tableNames: nextDraft.tables.map((table) => table.name),
        relationCount: nextDraft.relations.length,
      };
    },
    async applySchema(nextDraft: SchemaDraft) {
      return {
        appliedTableNames: nextDraft.tables.map((table) => table.name),
      };
    },
    async getSchemaDrift() {
      return { drift: [] };
    },
    async listResources() {
      return [{ table: "post", routeSegment: "post" }];
    },
    async getResourceMeta(table: string) {
      return { table, fields: baseTable.fields };
    },
    async getResourcePreview(table: string) {
      return { resource: { table } };
    },
    async buildApiResource(table: string) {
      return { table, routeSegment: table, config: baseTable.api };
    },
    async listRecords(table: string, _query: URLSearchParams) {
      return { table, data: [{ id: "post_1", title: "Hello" }] };
    },
    async getRecord(table: string, id: string) {
      return { id, table, title: "Hello" };
    },
    async createRecord(table: string, payload: Record<string, unknown>) {
      return { id: "post_1", table, ...payload };
    },
    async updateRecord(table: string, id: string, payload: Record<string, unknown>) {
      return { id, table, ...payload };
    },
    async deleteRecord(table: string, id: string) {
      return { table, id };
    },
    async listPlugins() {
      return [{ id: "admin", installState: { enabled: true } }];
    },
    async getPlugin(pluginId: PluginId) {
      return { id: pluginId, installState: { enabled: true } };
    },
    async enablePlugin(pluginId: PluginId) {
      return { id: pluginId, installState: { enabled: true } };
    },
    async disablePlugin(pluginId: PluginId) {
      return { id: pluginId, installState: { enabled: false } };
    },
    async updatePluginConfig(pluginId: PluginId, update: Record<string, unknown>) {
      return { id: pluginId, update };
    },
    async listStorageObjects() {
      return [{ id: "file_1", key: "notes.txt" }];
    },
    async getStorageObjectById(id: string) {
      return { id, key: "notes.txt" };
    },
    async getStorageObjectByKey(key: string) {
      return { key, bodyText: "hello", bodyBase64: Buffer.from("hello").toString("base64") };
    },
    async putStorageObject(input: { key: string; body: Buffer; mimeType: string; visibility?: "public" | "private" }) {
      return { key: input.key, mimeType: input.mimeType, sizeBytes: input.body.length };
    },
    async deleteStorageObject(key: string) {
      return { key, deleted: true };
    },
    async getSdkSchema() {
      return { version: 1, resources: ["post"] };
    },
    async saveTableApiConfig(tableName: string, config: TableApiConfig) {
      return { tableName, config };
    },
  };
}

describe("authend mcp server", () => {
  test("registers schema-first tools over in-memory transport", async () => {
    const server = createAuthendMcpServer(createFakeContext() as never);
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === "authend_create_table")).toBe(true);

    const result = await client.callTool({
      name: "authend_create_table",
      arguments: {
        table: {
          ...baseTable,
          name: "comment",
          displayName: "Comment",
        },
      },
    });

    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as Record<string, any>).draft.tables.map((table: { name: string }) => table.name)).toEqual([
      "post",
      "comment",
    ]);

    await Promise.all([client.close(), server.close()]);
  });

  test("serves the same tools over streamable HTTP", async () => {
    const app = createAuthendMcpHttpApp(() => createAuthendMcpServer(createFakeContext() as never));
    const client = new Client({ name: "test-http-client", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://local.test/mcp"), {
      fetch: (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        return app.fetch(request);
      },
    });

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.some((tool) => tool.name === "authend_get_schema_draft")).toBe(true);

    const result = await client.callTool({
      name: "authend_get_schema_draft",
      arguments: {},
    });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as Record<string, any>).draft.tables[0]?.name).toBe("post");

    await client.close();
  });
});
